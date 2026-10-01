// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import {
  checkSubmissionEligibility,
  type EligibilityTargetInput,
  type SubmissionEligibility,
} from "@repo/core/application/application/checkSubmissionEligibility";
import {
  getMyApplication,
  type MyApplicationView,
} from "@repo/core/application/application/getMyApplication";
import {
  listMyActiveApplicationsAboutPlace,
  type MyActiveApplication,
} from "@repo/core/application/application/listMyActiveApplicationsAboutPlace";
import { prepareReapplication } from "@repo/core/application/application/prepareReapplication";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { findSelectionCandidates } from "@repo/core/application/discovery/findSelectionCandidates";
import {
  type ViewOccasionOutput,
  viewOccasion,
} from "@repo/core/application/discovery/viewOccasion";
import {
  type ViewPlaceOutput,
  viewPlace,
} from "@repo/core/application/discovery/viewPlace";
import {
  type ViewRegionOutput,
  viewRegion,
} from "@repo/core/application/discovery/viewRegion";
import type { PhotoRefs } from "@repo/core/application/discovery/views";
import {
  isForbiddenError,
  isNotFoundError,
  NotFoundError,
} from "@repo/core/application/errors";
import { listPlaceListings } from "@repo/core/application/listing/listPlaceListings";
import { listAttachableListings } from "@repo/core/application/occasion/listAttachableListings";
import {
  listStewardedPlaces,
  type StewardedPlaceView,
} from "@repo/core/application/place/listStewardedPlaces";
import { getPlaceAffiliationStatus } from "@repo/core/application/region/getPlaceAffiliationStatus";
import type { ApplicationKind } from "@repo/core/domain/application/application";
import type { Actor } from "@repo/core/domain/common/actor";
import { Address } from "@repo/core/domain/common/address";
import type {
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { Publication } from "@repo/core/domain/common/publication";
import type { RegionSummary } from "@repo/core/domain/discovery/viewProjection";
import { requireActor } from "./actor";
import { subjectTitle } from "./applicationSubjects";
import { APPLICATION_KIND_TITLE } from "./applicationWords";
import { applicationIdOf } from "./applyData";
import type {
  ActingAs,
  AttachableOption,
  CandidateRefusal,
  MembershipEntry,
  MembershipFormData,
  MembershipKind,
  MyActiveApplicationItem,
  OccasionOption,
  ParticipationChoice,
  ParticipationEntry,
  ParticipationFormData,
  ParticipationListings,
  PlaceOption,
  RegionOption,
  RelationPage,
  RelationRefusal,
  StateBadge,
} from "./applyRelationsView";
import { MEMBERSHIP_KIND_LABEL, MEMBERSHIP_MODE } from "./applyRelationsView";
import type { ApplyMode } from "./applyView";
import { approverText } from "./myApplicationDetailData";
import { attachedItem } from "./occasionData";
import type { CandidatePage } from "./occasionView";
import { periodText } from "./occasionView";
import { OPERATING_STATUS_LABEL } from "./placeView";
import { occasionIdOf, placeIdOf, regionIdOf } from "./targetIds";

/*
 * RQ-05 and RQ-06: the screens' first loads, the candidates of their
 * choices (CF-02) with the reason each one cannot be chosen
 * (`checkSubmissionEligibility`, one call per candidate), and the refusal
 * a submission met, read afresh.
 */

async function actorAndContainer(): Promise<
  Readonly<{ container: RequestContainer; actor: Actor }>
> {
  const container = await getContainer();
  return { container, actor: await requireActor(container) };
}

/** The most candidates a keyword search shows (CF-02). */
const CANDIDATE_LIMIT = 20;

const areaText = (address: Address): string =>
  `${address.prefecture}${address.municipality}${address.town}`;

async function orNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

// --- The application an entry names -------------------------------------------

type Started = Readonly<{ app: MyApplicationView; mode: ApplyMode }>;

const applicationNotFound = (): NotFoundError =>
  new NotFoundError(
    "APPLICATION_NOT_FOUND",
    "The application is not one this screen resubmits or reapplies for",
  );

/**
 * The returned application `resubmit` names, or the ended one `reapply`
 * names, which must be one of `kinds` (else CS-06). A status that does not
 * allow the entry is a refusal (CS-08).
 */
async function startedFrom(
  container: RequestContainer,
  actor: Actor,
  entry: Readonly<{ resubmit: string | null; reapply: string | null }>,
  kinds: readonly ApplicationKind[],
): Promise<Started | RelationRefusal | null> {
  const raw = entry.resubmit ?? entry.reapply;
  if (raw === null) return null;
  const app = await getMyApplication({
    container,
    actor,
    input: { applicationId: applicationIdOf(raw) },
  });
  if (!kinds.includes(app.kind)) throw applicationNotFound();
  const { status } = app;
  if (entry.resubmit !== null) {
    return status.kind === "returned"
      ? {
          app,
          mode: {
            kind: "resubmit",
            applicationId: app.id,
            version: app.version,
            request: status.request,
            requestedBy: approverText(app),
          },
        }
      : { kind: "notReturned", applicationId: app.id, status: status.kind };
  }
  return status.kind === "rejected" ||
    status.kind === "withdrawn" ||
    status.kind === "lapsed"
    ? {
        app,
        mode: {
          kind: "reapply",
          from: app.id,
          ended: status.kind,
          submittedAt: app.submittedAt.toISOString(),
        },
      }
    : { kind: "notEnded", applicationId: app.id, status: status.kind };
}

const isStarted = (value: Started | RelationRefusal | null): value is Started =>
  value !== null && "app" in value;

const subjectName = (
  app: MyApplicationView,
  kind: "place" | "region" | "occasion",
): string =>
  app.subjects.find((subject) => subject.ref.kind === kind)?.name ?? "";

// --- Stores -------------------------------------------------------------------

async function stewardedPlaces(
  container: RequestContainer,
  actor: Actor,
): Promise<readonly StewardedPlaceView[]> {
  return listStewardedPlaces({ container, actor, input: {} });
}

function stewardedOption(place: StewardedPlaceView): PlaceOption {
  return {
    placeId: place.placeId,
    name: place.name,
    meta: OPERATING_STATUS_LABEL[place.operatingStatus],
    sub: place.suspended ? "運営による非公開" : "",
    operating: OPERATING_STATUS_LABEL[place.operatingStatus],
    address: "",
    photoUrl: place.cover?.displayRef.url ?? null,
    actingAs: "steward",
    viewable: !place.suspended,
    refusal: null,
  };
}

function viewedOption(view: ViewPlaceOutput, actingAs: ActingAs): PlaceOption {
  const { place } = view;
  const [cover] = place.photos;
  const [region] = view.regions;
  const operating = OPERATING_STATUS_LABEL[place.standing.operating];
  return {
    placeId: place.placeId,
    name: place.name,
    meta: `${region?.name ?? "所属地域なし"} · ${Address.text(place.address)}`,
    sub:
      actingAs === "steward" ? operating : `管理者のいない店舗 · ${operating}`,
    operating,
    address: Address.text(place.address),
    photoUrl:
      cover === undefined ? null : (view.photos[cover.photoId]?.url ?? null),
    actingAs,
    viewable: true,
    refusal: null,
  };
}

type PlaceRead = Readonly<{
  option: PlaceOption;
  /** The store has no steward. */
  vacant: boolean;
  /** Viewers see it (`viewPlace`), with its viewable regions. */
  view: ViewPlaceOutput | null;
}>;

/**
 * The store at `placeId` and as whom the actor applies for it: as its
 * steward when they steward it (the store need not be viewable), else as
 * an individual (it must be viewable). `null` when neither holds.
 */
async function readPlace(
  container: RequestContainer,
  actor: Actor,
  placeId: PlaceId,
  stewarded: readonly StewardedPlaceView[],
): Promise<PlaceRead | null> {
  const own = stewarded.find((place) => place.placeId === placeId);
  const view = await orNull(() =>
    viewPlace({ container, actor, input: { placeId } }),
  );
  if (own !== undefined) {
    return {
      option:
        view === null ? stewardedOption(own) : viewedOption(view, "steward"),
      vacant: false,
      view,
    };
  }
  if (view === null) return null;
  return {
    option: viewedOption(view, "individual"),
    vacant: view.placeIsVacant,
    view,
  };
}

/** Not the steward of a store that has one (CS-05 of RQ-05 / RQ-06). */
const notSteward = (read: PlaceRead, atSubmit: boolean): RelationRefusal => ({
  kind: "notSteward",
  placeId: read.option.placeId,
  placeName: read.option.name,
  vacant: read.vacant,
  atSubmit,
});

// --- Eligibility --------------------------------------------------------------

type MembershipTarget = Readonly<{
  kind: MembershipKind;
  actingAs: ActingAs;
  placeId: PlaceId;
  regionId: RegionId;
}>;

function membershipInput(target: MembershipTarget): EligibilityTargetInput {
  const { kind, placeId, regionId } = target;
  return target.actingAs === "steward"
    ? { applicant: "place", placeId, kind, regionId }
    : { kind, placeId, regionId };
}

async function eligibilityOf(
  container: RequestContainer,
  actor: Actor,
  target: EligibilityTargetInput,
): Promise<SubmissionEligibility | "forbidden"> {
  try {
    return await checkSubmissionEligibility({
      container,
      actor,
      input: { target },
    });
  } catch (error) {
    if (isForbiddenError(error)) return "forbidden";
    throw error;
  }
}

type Names = Readonly<{ placeName: string; targetName: string }>;

/**
 * A region candidate's reason (「受け付けない事情」, by the submission's order
 * of judgement): the premises, the region that must be viewable, the same
 * applicant's active application.
 */
function membershipCandidateRefusal(
  eligibility: SubmissionEligibility | "forbidden",
  target: MembershipTarget,
  names: Names,
): CandidateRefusal | null {
  if (eligibility === "forbidden") {
    return {
      badge: null,
      reason: `${names.placeName}の店舗管理者ではないため、申請できません。`,
      go: null,
    };
  }
  if (eligibility.accepted) return null;
  const steward = target.actingAs === "steward";
  const status = steward
    ? ({ kind: "affiliationStatus", placeId: target.placeId } as const)
    : null;
  switch (eligibility.brokenPremises[0]) {
    case "notAffiliated":
      return {
        badge: "所属中",
        reason: `${names.placeName}は、この地域に所属しています。`,
        go: status,
      };
    case "affiliated":
      return {
        badge: null,
        reason: `${names.placeName}とこの地域の所属は、すでに解除されています。`,
        go: status,
      };
    case "placeHasNoSteward":
      return {
        badge: null,
        reason: `${names.placeName}には店舗管理者がいるため、個人としては申請できません。`,
        go: null,
      };
    case "placeHasSteward":
      return {
        badge: null,
        reason: `${names.placeName}に店舗管理者がいないため、店舗管理者としては申請できません。`,
        go: null,
      };
    case undefined:
      break;
    default:
      return { badge: null, reason: "この地域は選べません。", go: null };
  }
  const [unviewable] = eligibility.unviewable;
  if (unviewable !== undefined) {
    return {
      badge: null,
      reason:
        unviewable.kind === "place"
          ? `${names.placeName}は閲覧できないため、申請できません。`
          : "この地域は閲覧できないため、選べません。",
      go: null,
    };
  }
  if (eligibility.activeDuplicate !== null) {
    const words = MEMBERSHIP_KIND_LABEL[target.kind];
    return {
      badge: "申請中",
      reason: steward
        ? `${names.placeName}の、この地域への${words}の申請が確認中か差し戻しです。`
        : `あなたが出した、この地域への${words}の申請が確認中か差し戻しです。`,
      go: { kind: "application", applicationId: eligibility.activeDuplicate },
    };
  }
  return null;
}

/** An event candidate's reason (RQ-06). */
function participationCandidateRefusal(
  eligibility: SubmissionEligibility | "forbidden",
  placeId: PlaceId,
  occasionId: OccasionId,
  names: Names,
): CandidateRefusal | null {
  if (eligibility === "forbidden") {
    return {
      badge: null,
      reason: `${names.placeName}の店舗管理者ではないため、申請できません。`,
      go: null,
    };
  }
  if (eligibility.accepted) return null;
  switch (eligibility.brokenPremises[0]) {
    case "notParticipating":
      return {
        badge: "参加中",
        reason: "すでに参加しているため選べません",
        go: { kind: "participation", placeId, occasionId },
      };
    case "occasionOpen":
      return {
        badge: null,
        reason: "終了したか中止になったイベントのため選べません",
        go: null,
      };
    case "placeHasSteward":
      return {
        badge: null,
        reason: `${names.placeName}に店舗管理者がいないため、申請できません`,
        go: null,
      };
    case undefined:
      break;
    default:
      return { badge: null, reason: "このイベントは選べません", go: null };
  }
  if (eligibility.unviewable.length > 0) {
    return {
      badge: null,
      reason: "閲覧できないイベントのため選べません",
      go: null,
    };
  }
  if (eligibility.activeDuplicate !== null) {
    return {
      badge: "申請中",
      reason: "この店舗の申請が確認中か差し戻しのため選べません",
      go: { kind: "application", applicationId: eligibility.activeDuplicate },
    };
  }
  return null;
}

/**
 * A managed store's reason for the event DT-04 chose (RQ-06's store
 * choice): the event's reason, worded for the store where it is about the
 * store (参加中, 申請中).
 */
function participationPlaceRefusal(
  eligibility: SubmissionEligibility | "forbidden",
  placeId: PlaceId,
  occasionId: OccasionId,
  placeName: string,
): CandidateRefusal | null {
  const refusal = participationCandidateRefusal(
    eligibility,
    placeId,
    occasionId,
    { placeName, targetName: "" },
  );
  switch (refusal?.go?.kind) {
    case "participation":
      return {
        ...refusal,
        reason: `${placeName}は、このイベントに参加しています。`,
      };
    case "application":
      return {
        ...refusal,
        reason: `${placeName}の、このイベントへの参加の申請が確認中か差し戻しです。`,
      };
    default:
      return refusal;
  }
}

// --- Regions ------------------------------------------------------------------

function summaryOption(region: RegionSummary, photos: PhotoRefs): RegionOption {
  return {
    regionId: region.regionId,
    name: region.name,
    meta: `${areaText(region.address)} · 公開中`,
    photoUrl: photos[region.cover.photoId]?.url ?? null,
    badges: [],
    viewable: true,
    refusal: null,
  };
}

function detailOption(view: ViewRegionOutput): RegionOption {
  const { region } = view;
  const [cover] = region.photos;
  return {
    regionId: region.regionId,
    name: region.name,
    meta: `${areaText(region.address)} · 公開中`,
    photoUrl:
      cover === undefined ? null : (view.photos[cover.photoId]?.url ?? null),
    badges: [],
    viewable: true,
    refusal: null,
  };
}

/** A region viewers cannot see, known by its id and, when read from an application, its name. */
const unseenRegion = (regionId: string, name: string): RegionOption => ({
  regionId,
  name: name === "" ? "閲覧できない地域" : name,
  meta: "閲覧者に表示されていない地域",
  photoUrl: null,
  badges: [],
  viewable: false,
  refusal: null,
});

async function readRegion(
  container: RequestContainer,
  regionId: RegionId,
  fallbackName: string,
): Promise<RegionOption> {
  const view = await orNull(() =>
    viewRegion({ container, input: { regionId } }),
  );
  return view === null
    ? unseenRegion(regionId, fallbackName)
    : detailOption(view);
}

function publicationBadge(
  publication: Publication,
  suspended: boolean,
): StateBadge | null {
  if (suspended) return { label: "運営による非公開", tone: "alert" };
  switch (publication.status) {
    case "published":
      return null;
    case "unpublished":
      return { label: "公開の取り下げ", tone: "muted" };
    case "draft":
      return { label: "下書き", tone: "muted" };
  }
}

/**
 * The regions `read`'s store may leave, as its applicant sees them: a
 * steward every affiliated region with its state (unpublished and
 * suspended ones included); an individual only those viewers see.
 */
async function leaveCandidates(
  container: RequestContainer,
  actor: Actor,
  read: PlaceRead,
): Promise<readonly RegionOption[]> {
  const placeId = placeIdOf(read.option.placeId);
  if (read.option.actingAs === "steward") {
    const status = await getPlaceAffiliationStatus({
      container,
      actor,
      input: { placeId },
    });
    return status.regions.map((region) => {
      const badge = publicationBadge(region.publication, region.suspended);
      const representative =
        status.representative?.regionId === region.regionId;
      return {
        regionId: region.regionId,
        name: region.name ?? "名称のない地域",
        meta: region.suspended
          ? "所属中 · 地域は閲覧者に表示されていません"
          : region.publication.status === "published"
            ? "所属中 · 地域は公開中"
            : "所属中 · 地域は公開を取り下げています",
        photoUrl: region.cover?.displayRef.url ?? null,
        badges: [
          ...(representative
            ? [{ label: "代表地域", tone: "accent" } as const]
            : []),
          ...(badge === null ? [] : [badge]),
        ],
        viewable: region.viewable,
        refusal: null,
      };
    });
  }
  const view = read.view;
  if (view === null) return [];
  return view.regions.map((region) => ({
    ...summaryOption(region, view.photos),
    meta: `所属中 · ${areaText(region.address)}`,
  }));
}

async function judgeRegions(
  container: RequestContainer,
  actor: Actor,
  regions: readonly RegionOption[],
  base: Omit<MembershipTarget, "regionId">,
  placeName: string,
): Promise<readonly RegionOption[]> {
  return Promise.all(
    regions.map(async (region) => {
      const target = { ...base, regionId: regionIdOf(region.regionId) };
      return {
        ...region,
        refusal: membershipCandidateRefusal(
          await eligibilityOf(container, actor, membershipInput(target)),
          target,
          { placeName, targetName: region.name },
        ),
      };
    }),
  );
}

/** `findMembershipRegionsFn`: published regions matching `keyword`, each judged for the store (所属). */
export async function findMembershipRegions(
  rawPlaceId: string,
  actingAs: ActingAs,
  keyword: string,
): Promise<Readonly<{ items: readonly RegionOption[]; count: number }>> {
  const { container, actor } = await actorAndContainer();
  const placeId = placeIdOf(rawPlaceId);
  const found = await findSelectionCandidates({
    container,
    input: {
      scope: { kind: "region" },
      keyword,
      pagination: { page: 1, limit: CANDIDATE_LIMIT },
    },
  });
  if (found.candidates.kind !== "region") return { items: [], count: 0 };
  const placeName = await placeNameOf(container, actor, placeId);
  return {
    items: await judgeRegions(
      container,
      actor,
      found.candidates.items.map((region) =>
        summaryOption(region, found.photos),
      ),
      { kind: "affiliation", actingAs, placeId },
      placeName,
    ),
    count: found.candidates.count,
  };
}

async function placeNameOf(
  container: RequestContainer,
  actor: Actor,
  placeId: PlaceId,
): Promise<string> {
  const read = await readPlace(
    container,
    actor,
    placeId,
    await stewardedPlaces(container, actor),
  );
  return read?.option.name ?? "この店舗";
}

/** `findMembershipPlacesFn` (DT-03): viewable stores without a steward matching `keyword`, each judged for the region. */
export async function findMembershipPlaces(
  rawRegionId: string,
  keyword: string,
): Promise<Readonly<{ items: readonly PlaceOption[]; count: number }>> {
  const { container, actor } = await actorAndContainer();
  const regionId = regionIdOf(rawRegionId);
  const found = await findSelectionCandidates({
    container,
    input: {
      scope: { kind: "place", vacantOnly: true },
      keyword,
      pagination: { page: 1, limit: CANDIDATE_LIMIT },
    },
  });
  if (found.candidates.kind !== "place") return { items: [], count: 0 };
  const items = await Promise.all(
    found.candidates.items.map(async ({ summary }): Promise<PlaceOption> => {
      const target: MembershipTarget = {
        kind: "affiliation",
        actingAs: "individual",
        placeId: summary.placeId,
        regionId,
      };
      const cover = summary.cover;
      const operating = OPERATING_STATUS_LABEL[summary.standing.operating];
      return {
        placeId: summary.placeId,
        name: summary.name,
        meta: `${summary.region ?? "所属地域なし"} · ${Address.text(summary.address)}`,
        sub: `管理者のいない店舗 · ${operating}`,
        operating,
        address: Address.text(summary.address),
        photoUrl:
          cover === null ? null : (found.photos[cover.photoId]?.url ?? null),
        actingAs: "individual",
        viewable: true,
        refusal: membershipCandidateRefusal(
          await eligibilityOf(container, actor, membershipInput(target)),
          target,
          { placeName: summary.name, targetName: "" },
        ),
      };
    }),
  );
  return { items, count: found.candidates.count };
}

// --- RQ-05 --------------------------------------------------------------------

const refused = <D>(refusal: RelationRefusal): RelationPage<D> => ({
  kind: "refused",
  refusal,
});

/**
 * RQ-05's first load: a new application from SM-05 / DT-02 (the store) or
 * DT-03 (the region), a reapplication, or a resubmission.
 */
export async function loadMembershipPage(
  entry: MembershipEntry,
): Promise<RelationPage<MembershipFormData>> {
  const { container, actor } = await actorAndContainer();
  const started = await startedFrom(container, actor, entry, [
    "affiliation",
    "leave",
  ]);
  if (started !== null && !isStarted(started)) return refused(started);
  const stewarded = await stewardedPlaces(container, actor);

  if (started !== null) {
    const { content } = started.app;
    if (content.kind !== "affiliation" && content.kind !== "leave") {
      throw applicationNotFound();
    }
    const steward = started.app.applicant.kind === "place";
    const placeName = subjectName(started.app, "place");
    const regionName = subjectName(started.app, "region");
    const read = await readPlace(container, actor, content.placeId, stewarded);
    if (started.mode.kind === "resubmit") {
      // Nothing but the reply changes: the store and the region are shown
      // as they can be read, and need not be viewable.
      return {
        kind: "form",
        data: {
          mode: started.mode,
          opening: "place",
          kind: content.kind,
          kindFixed: true,
          place: {
            ...(read?.option ?? {
              placeId: content.placeId,
              name: placeName,
              meta: "",
              sub: "",
              operating: "",
              address: "",
              photoUrl: null,
              viewable: false,
              refusal: null,
            }),
            actingAs: steward ? "steward" : "individual",
          },
          managed: [],
          region: await readRegion(container, content.regionId, regionName),
          affiliated: [],
          mine: [],
        },
      };
    }
    return membershipForm(container, actor, {
      mode: started.mode,
      read,
      kind: content.kind,
      regionId: content.regionId,
      regionName,
      steward,
    });
  }

  const kind = MEMBERSHIP_MODE[entry.mode ?? "join"];
  if (entry.placeId === null) {
    if (entry.regionId === null) throw applicationNotFound();
    return regionOpening(
      container,
      actor,
      regionIdOf(entry.regionId),
      stewarded,
    );
  }
  const read = await readPlace(
    container,
    actor,
    placeIdOf(entry.placeId),
    stewarded,
  );
  return membershipForm(container, actor, {
    mode: { kind: "new" },
    read,
    kind,
    regionId: entry.regionId === null ? null : regionIdOf(entry.regionId),
    regionName: "",
    steward: null,
  });
}

/**
 * The form opened on a store (SM-05, DT-02, a reapplication): the store's
 * own refusals first (CS-06, CS-05, 店舗管理者がいる), then the region the
 * entry chose judged, and the regions it may leave.
 */
async function membershipForm(
  container: RequestContainer,
  actor: Actor,
  opened: Readonly<{
    mode: ApplyMode;
    read: PlaceRead | null;
    kind: MembershipKind;
    regionId: RegionId | null;
    regionName: string;
    /** A reapplication's applicant; `null` for a new application (as the store's steward when they are). */
    steward: boolean | null;
  }>,
): Promise<RelationPage<MembershipFormData>> {
  const { read } = opened;
  if (read === null) {
    return refused({ kind: "unavailable", subject: "place" });
  }
  const actingAs = read.option.actingAs;
  if (opened.steward === true && actingAs !== "steward") {
    return refused(notSteward(read, false));
  }
  if (actingAs === "individual" && !read.vacant) {
    // A reapplication as an individual meets 「店舗に店舗管理者がいる」; a
    // new one opened on a store with a steward is CS-05 (RQ-05).
    return refused(
      opened.steward === false
        ? { kind: "hasSteward", placeId: read.option.placeId, listingId: null }
        : notSteward(read, false),
    );
  }
  const placeId = placeIdOf(read.option.placeId);
  const placeName = read.option.name;
  const leaving = await judgeRegions(
    container,
    actor,
    await leaveCandidates(container, actor, read),
    { kind: "leave", actingAs, placeId },
    placeName,
  );
  let region: RegionOption | null = null;
  if (opened.regionId !== null) {
    const target: MembershipTarget = {
      kind: opened.kind,
      actingAs,
      placeId,
      regionId: opened.regionId,
    };
    const listed =
      opened.kind === "leave"
        ? leaving.find((item) => item.regionId === opened.regionId)
        : undefined;
    if (listed !== undefined) {
      region = listed;
    } else {
      const [seen, eligibility] = await Promise.all([
        readRegion(container, opened.regionId, opened.regionName),
        eligibilityOf(container, actor, membershipInput(target)),
      ]);
      // 離脱 of a region the store no longer belongs to (SM-05's link, a
      // reapplication after the affiliation was dissolved) meets 「所属が
      // ない」, which no other region chosen here can avoid: refused.
      if (
        opened.kind === "leave" &&
        eligibility !== "forbidden" &&
        eligibility.brokenPremises[0] === "affiliated"
      ) {
        return refused({
          kind: "notAffiliated",
          placeId: read.option.placeId,
          placeName,
          regionName: seen.name,
          steward: actingAs === "steward",
        });
      }
      region = {
        ...seen,
        refusal: membershipCandidateRefusal(eligibility, target, {
          placeName,
          targetName: seen.name,
        }),
      };
    }
  }
  const kind =
    opened.kind === "leave" && leaving.length === 0
      ? "affiliation"
      : opened.kind;
  return {
    kind: "form",
    data: {
      mode: opened.mode,
      opening: "place",
      kind,
      kindFixed: false,
      place: read.option,
      managed: [],
      // Judged for the kind the entry named, a region would carry the
      // wrong reason for another kind.
      region: kind === opened.kind ? region : null,
      affiliated: leaving,
      mine:
        actingAs === "individual"
          ? await myActiveApplications(container, actor, placeId)
          : [],
    },
  };
}

/**
 * DT-03: the region is chosen; the stores the actor manages are offered
 * (one is chosen when it is the only one), each judged for the region.
 */
async function regionOpening(
  container: RequestContainer,
  actor: Actor,
  regionId: RegionId,
  stewarded: readonly StewardedPlaceView[],
): Promise<RelationPage<MembershipFormData>> {
  const region = await readRegion(container, regionId, "");
  const managed = await Promise.all(
    stewarded.map(async (place): Promise<PlaceOption> => {
      const target: MembershipTarget = {
        kind: "affiliation",
        actingAs: "steward",
        placeId: place.placeId,
        regionId,
      };
      return {
        ...stewardedOption(place),
        refusal: membershipCandidateRefusal(
          await eligibilityOf(container, actor, membershipInput(target)),
          target,
          { placeName: place.name, targetName: region.name },
        ),
      };
    }),
  );
  const [only] = managed;
  return {
    kind: "form",
    data: {
      mode: { kind: "new" },
      opening: "region",
      kind: "affiliation",
      kindFixed: true,
      place: managed.length === 1 && only !== undefined ? only : null,
      managed,
      region,
      affiliated: [],
      mine: [],
    },
  };
}

/** 所属の申請 · 白波横丁: the kind, and what it is about besides the store. */
function activeItem(app: MyActiveApplication): MyActiveApplicationItem {
  const others = app.subjects.filter(({ ref }) => ref.kind !== "place");
  const kind = APPLICATION_KIND_TITLE[app.kind];
  return {
    applicationId: app.id,
    title: others.length === 0 ? kind : `${kind} · ${subjectTitle(others)}`,
    status: app.status.kind,
  };
}

async function myActiveApplications(
  container: RequestContainer,
  actor: Actor,
  placeId: PlaceId,
): Promise<readonly MyActiveApplicationItem[]> {
  const items = await listMyActiveApplicationsAboutPlace({
    container,
    actor,
    input: { placeId },
  });
  return items.map(activeItem);
}

/**
 * `listMyApplicationsAboutPlaceFn`: the viewer's applications in progress
 * about a store chosen on the screen (DT-03's opening), as an individual.
 */
export async function myApplicationsAboutPlace(
  rawPlaceId: string,
): Promise<readonly MyActiveApplicationItem[]> {
  const { container, actor } = await actorAndContainer();
  return myActiveApplications(container, actor, placeIdOf(rawPlaceId));
}

/**
 * `checkMembershipFn`: the refusal a submission of the target meets now,
 * after one was refused for a reason of 「受け付けない事情」.
 */
export async function membershipRefusal(
  raw: Readonly<{
    kind: MembershipKind;
    actingAs: ActingAs;
    placeId: string;
    regionId: string;
  }>,
): Promise<RelationRefusal | null> {
  const { container, actor } = await actorAndContainer();
  const target: MembershipTarget = {
    kind: raw.kind,
    actingAs: raw.actingAs,
    placeId: placeIdOf(raw.placeId),
    regionId: regionIdOf(raw.regionId),
  };
  const stewarded = await stewardedPlaces(container, actor);
  const read = await readPlace(container, actor, target.placeId, stewarded);
  const eligibility = await eligibilityOf(
    container,
    actor,
    membershipInput(target),
  );
  if (eligibility === "forbidden") {
    return read === null
      ? { kind: "unavailable", subject: "place" }
      : notSteward(read, true);
  }
  if (eligibility.accepted) return null;
  const placeName = read?.option.name ?? "この店舗";
  const region = await readRegion(container, target.regionId, "");
  const steward = target.actingAs === "steward";
  const relation = {
    placeId: raw.placeId,
    placeName,
    regionName: region.name,
    steward,
  };
  switch (eligibility.brokenPremises[0]) {
    case "placeHasNoSteward":
      return { kind: "hasSteward", placeId: raw.placeId, listingId: null };
    case "placeHasSteward":
      return read === null
        ? { kind: "unavailable", subject: "place" }
        : notSteward(read, true);
    case "notAffiliated":
      return { kind: "affiliated", ...relation };
    case "affiliated":
      return { kind: "notAffiliated", ...relation };
    case undefined:
      break;
    default:
      return { kind: "unavailable", subject: "place" };
  }
  const [unviewable] = eligibility.unviewable;
  if (unviewable !== undefined) {
    return unviewable.kind === "place"
      ? { kind: "unavailable", subject: "place" }
      : { kind: "targetUnavailable", subject: "region" };
  }
  if (eligibility.activeDuplicate !== null) {
    return {
      kind: "activeRelation",
      applicationId: eligibility.activeDuplicate,
      what: `${placeName}の${region.name}への${MEMBERSHIP_KIND_LABEL[target.kind]}の申請`,
    };
  }
  return null;
}

// --- RQ-06 --------------------------------------------------------------------

function occasionOptionOf(view: ViewOccasionOutput): OccasionOption {
  const { occasion } = view;
  const [cover] = occasion.photos;
  const period = { start: occasion.period.start, end: occasion.period.end };
  return {
    occasionId: occasion.occasionId,
    name: occasion.name,
    period,
    periodText: periodText(period),
    venue: Address.text(occasion.venue.address),
    photoUrl:
      cover === undefined ? null : (view.photos[cover.photoId]?.url ?? null),
    viewable: true,
    refusal: null,
  };
}

const unseenOccasion = (occasionId: string, name: string): OccasionOption => ({
  occasionId,
  name: name === "" ? "閲覧できないイベント" : name,
  period: null,
  periodText: "",
  venue: "",
  photoUrl: null,
  viewable: false,
  refusal: null,
});

async function readOccasion(
  container: RequestContainer,
  actor: Actor,
  occasionId: OccasionId,
  fallbackName: string,
): Promise<OccasionOption> {
  const view = await orNull(() =>
    viewOccasion({ container, actor, input: { occasionId } }),
  );
  return view === null
    ? unseenOccasion(occasionId, fallbackName)
    : occasionOptionOf(view);
}

const participationInput = (
  placeId: PlaceId,
  occasionId: OccasionId,
): EligibilityTargetInput => ({
  applicant: "place",
  placeId,
  kind: "participation",
  occasionId,
});

const ATTACHABLE_LIMIT = 100;

async function attachableOf(
  container: RequestContainer,
  actor: Actor,
  placeId: PlaceId,
  occasionId: OccasionId,
): Promise<readonly AttachableOption[]> {
  const items: AttachableOption[] = [];
  for (let page = 1; page <= 10; page++) {
    const read = await listAttachableListings({
      container,
      actor,
      input: {
        placeId,
        occasionId,
        pagination: { page, limit: ATTACHABLE_LIMIT },
      },
    });
    items.push(
      ...read.items.map((item) => ({
        id: item.id,
        name: item.name,
        photoUrl: item.cover?.display?.url ?? null,
        offeringStatus: item.offeringStatus,
      })),
    );
    if (read.items.length === 0 || items.length >= read.count) break;
  }
  return items;
}

/** The listings the store can attach to the event, and whether it has any not published. */
async function listingsOf(
  container: RequestContainer,
  actor: Actor,
  placeId: PlaceId,
  occasionId: OccasionId,
): Promise<ParticipationListings> {
  const [attachable, shelves] = await Promise.all([
    orNull(() => attachableOf(container, actor, placeId, occasionId)),
    orNull(() =>
      listPlaceListings({
        container,
        actor,
        input: {
          placeId,
          shelf: { publication: null, phase: null },
          pagination: { page: 1, limit: 1 },
        },
      }),
    ),
  ]);
  const counts = shelves?.counts.publication;
  return {
    attachable: attachable ?? [],
    unpublished: counts !== undefined && counts.draft + counts.hidden > 0,
  };
}

/** `participationListingsFn`: the store's listings for the event, whatever the event's refusal (a resubmission's own application is active). */
export async function participationListings(
  rawPlaceId: string,
  rawOccasionId: string,
): Promise<ParticipationListings> {
  const { container, actor } = await actorAndContainer();
  return listingsOf(
    container,
    actor,
    placeIdOf(rawPlaceId),
    occasionIdOf(rawOccasionId),
  );
}

async function choiceOf(
  container: RequestContainer,
  actor: Actor,
  place: PlaceOption,
  occasionId: OccasionId,
  fallbackName: string,
): Promise<ParticipationChoice> {
  const placeId = placeIdOf(place.placeId);
  const occasion = await readOccasion(
    container,
    actor,
    occasionId,
    fallbackName,
  );
  const refusal = participationCandidateRefusal(
    await eligibilityOf(
      container,
      actor,
      participationInput(placeId, occasionId),
    ),
    placeId,
    occasionId,
    { placeName: place.name, targetName: occasion.name },
  );
  return {
    occasion: { ...occasion, refusal },
    ...(refusal === null
      ? await listingsOf(container, actor, placeId, occasionId)
      : { attachable: [], unpublished: false }),
  };
}

/** `participationChoiceFn`: the event chosen for the store, judged, with what the store can attach. */
export async function participationChoice(
  rawPlaceId: string,
  rawOccasionId: string,
): Promise<ParticipationChoice> {
  const { container, actor } = await actorAndContainer();
  const stewarded = await stewardedPlaces(container, actor);
  const own = stewarded.find((place) => place.placeId === rawPlaceId);
  const occasionId = occasionIdOf(rawOccasionId);
  if (own === undefined) {
    return {
      occasion: {
        ...(await readOccasion(container, actor, occasionId, "")),
        refusal: {
          badge: null,
          reason: "この店舗の店舗管理者ではないため、申請できません",
          go: null,
        },
      },
      attachable: [],
      unpublished: false,
    };
  }
  return choiceOf(container, actor, stewardedOption(own), occasionId, "");
}

/** `findParticipationOccasionsFn`: published upcoming and ongoing events matching `keyword`, each judged for the store. */
export async function findParticipationOccasions(
  rawPlaceId: string,
  keyword: string,
): Promise<
  CandidatePage &
    Readonly<{ refusals: Readonly<Record<string, CandidateRefusal>> }>
> {
  const { container, actor } = await actorAndContainer();
  const placeId = placeIdOf(rawPlaceId);
  const found = await findSelectionCandidates({
    container,
    input: {
      scope: { kind: "occasion", openOnly: true },
      keyword,
      pagination: { page: 1, limit: CANDIDATE_LIMIT },
    },
  });
  if (found.candidates.kind !== "occasion") {
    return { items: [], count: 0, refusals: {} };
  }
  const placeName = await placeNameOf(container, actor, placeId);
  const refusals: Record<string, CandidateRefusal> = {};
  const items = await Promise.all(
    found.candidates.items.map(async (occasion) => {
      const refusal = participationCandidateRefusal(
        await eligibilityOf(
          container,
          actor,
          participationInput(placeId, occasion.occasionId),
        ),
        placeId,
        occasion.occasionId,
        { placeName, targetName: occasion.name },
      );
      if (refusal !== null) refusals[occasion.occasionId] = refusal;
      const holding =
        occasion.standing.holding === "ongoing" ? "開催中" : "開催前";
      return {
        id: occasion.occasionId,
        name: occasion.name,
        meta: `${periodText(occasion.period)} · ${holding}`,
        photoUrl: found.photos[occasion.cover.photoId]?.url ?? null,
        refusal: refusal?.reason ?? null,
      };
    }),
  );
  return { items, count: found.candidates.count, refusals };
}

/**
 * RQ-06's first load: a new application from SM-06 (the store) or DT-04
 * (the event), a reapplication, or a resubmission.
 */
export async function loadParticipationPage(
  entry: ParticipationEntry,
): Promise<RelationPage<ParticipationFormData>> {
  const { container, actor } = await actorAndContainer();
  const started = await startedFrom(container, actor, entry, ["participation"]);
  if (started !== null && !isStarted(started)) return refused(started);
  const stewarded = await stewardedPlaces(container, actor);

  if (started !== null) {
    const { content } = started.app;
    if (content.kind !== "participation") throw applicationNotFound();
    const read = await readPlace(container, actor, content.placeId, stewarded);
    if (read === null || read.option.actingAs !== "steward") {
      return refused(
        read === null
          ? {
              kind: "notSteward",
              placeId: content.placeId,
              placeName: subjectName(started.app, "place"),
              vacant: false,
              atSubmit: false,
            }
          : notSteward(read, false),
      );
    }
    const occasionName = subjectName(started.app, "occasion");
    if (started.mode.kind === "resubmit") {
      const placeId = placeIdOf(read.option.placeId);
      const occasion = await readOccasion(
        container,
        actor,
        content.occasionId,
        occasionName,
      );
      return {
        kind: "form",
        data: {
          mode: started.mode,
          opening: "place",
          place: read.option,
          managed: [],
          choice: {
            occasion,
            ...(await listingsOf(
              container,
              actor,
              placeId,
              content.occasionId,
            )),
          },
          start: {
            listingIds: content.listings.map((listing) => listing.id),
            dates: content.dates,
          },
          held: content.listings.map(attachedItem),
          removed: null,
        },
      };
    }
    const reapplication = await prepareReapplication({
      container,
      actor,
      input: { applicationId: started.app.id },
    });
    const prepared =
      reapplication.content.kind === "participation"
        ? reapplication.content
        : null;
    if (prepared === null) throw applicationNotFound();
    return {
      kind: "form",
      data: {
        mode: started.mode,
        opening: "place",
        place: read.option,
        managed: [],
        choice: await choiceOf(
          container,
          actor,
          read.option,
          content.occasionId,
          occasionName,
        ),
        start: { listingIds: prepared.listingIds, dates: prepared.dates },
        held: [],
        removed:
          prepared.removedListings.length === 0 &&
          prepared.removedDates.length === 0
            ? null
            : {
                listings: prepared.removedListings.map(attachedItem),
                dates: prepared.removedDates,
              },
      },
    };
  }

  const empty = { listingIds: [], dates: [] };
  if (entry.placeId !== null) {
    const read = await readPlace(
      container,
      actor,
      placeIdOf(entry.placeId),
      stewarded,
    );
    if (read === null)
      return refused({ kind: "unavailable", subject: "place" });
    if (read.option.actingAs !== "steward") {
      return refused(notSteward(read, false));
    }
    return {
      kind: "form",
      data: {
        mode: { kind: "new" },
        opening: "place",
        place: read.option,
        managed: [],
        choice:
          entry.occasionId === null
            ? null
            : await choiceOf(
                container,
                actor,
                read.option,
                occasionIdOf(entry.occasionId),
                "",
              ),
        start: empty,
        held: [],
        removed: null,
      },
    };
  }
  if (entry.occasionId === null) throw applicationNotFound();
  const occasionId = occasionIdOf(entry.occasionId);
  if (stewarded.length === 0) {
    return refused({ kind: "noManagedPlace", occasionId });
  }
  const managed = await Promise.all(
    stewarded.map(async (place): Promise<PlaceOption> => {
      const option = stewardedOption(place);
      return {
        ...option,
        refusal: participationPlaceRefusal(
          await eligibilityOf(
            container,
            actor,
            participationInput(place.placeId, occasionId),
          ),
          place.placeId,
          occasionId,
          option.name,
        ),
      };
    }),
  );
  const [only] = managed;
  const place = managed.length === 1 && only !== undefined ? only : null;
  return {
    kind: "form",
    data: {
      mode: { kind: "new" },
      opening: "occasion",
      place,
      managed,
      choice:
        place === null
          ? {
              occasion: await readOccasion(container, actor, occasionId, ""),
              attachable: [],
              unpublished: false,
            }
          : await choiceOf(container, actor, place, occasionId, ""),
      start: empty,
      held: [],
      removed: null,
    },
  };
}

/** `checkParticipationFn`: the refusal a submission for the store and the event meets now. */
export async function participationRefusal(
  rawPlaceId: string,
  rawOccasionId: string,
): Promise<RelationRefusal | null> {
  const { container, actor } = await actorAndContainer();
  const placeId = placeIdOf(rawPlaceId);
  const occasionId = occasionIdOf(rawOccasionId);
  const eligibility = await eligibilityOf(
    container,
    actor,
    participationInput(placeId, occasionId),
  );
  if (
    eligibility === "forbidden" ||
    eligibility.brokenPremises[0] === "placeHasSteward"
  ) {
    const read = await readPlace(
      container,
      actor,
      placeId,
      await stewardedPlaces(container, actor),
    );
    return read === null
      ? { kind: "unavailable", subject: "place" }
      : notSteward(read, true);
  }
  if (eligibility.accepted) return null;
  const occasion = await readOccasion(container, actor, occasionId, "");
  switch (eligibility.brokenPremises[0]) {
    case "occasionOpen":
      return { kind: "occasionClosed", occasionName: occasion.name };
    case "notParticipating":
      return {
        kind: "participating",
        placeId: rawPlaceId,
        occasionId: rawOccasionId,
        occasionName: occasion.name,
      };
    case undefined:
      break;
    default:
      return { kind: "targetUnavailable", subject: "occasion" };
  }
  if (eligibility.unviewable.length > 0) {
    return { kind: "targetUnavailable", subject: "occasion" };
  }
  if (eligibility.activeDuplicate !== null) {
    return {
      kind: "activeRelation",
      applicationId: eligibility.activeDuplicate,
      what: `${occasion.name}への参加の申請`,
    };
  }
  return null;
}
