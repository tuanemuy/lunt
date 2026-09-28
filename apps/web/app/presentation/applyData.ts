// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import {
  checkSubmissionEligibility,
  type EligibilityTargetInput,
  type SubmissionEligibility,
} from "@repo/core/application/application/checkSubmissionEligibility";
import type {
  ListingContentView,
  PlaceProfileView,
} from "@repo/core/application/application/detail";
import {
  getMyApplication,
  type MyApplicationView,
} from "@repo/core/application/application/getMyApplication";
import {
  prepareReapplication,
  type Reapplication,
} from "@repo/core/application/application/prepareReapplication";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { viewListing } from "@repo/core/application/discovery/viewListing";
import { viewPlace } from "@repo/core/application/discovery/viewPlace";
import { NotFoundError } from "@repo/core/application/errors";
import type { ApplicationKind } from "@repo/core/domain/application/application";
import type { Actor } from "@repo/core/domain/common/actor";
import { Address } from "@repo/core/domain/common/address";
import { ApplicationId } from "@repo/core/domain/common/ids";
import type { Offering } from "@repo/core/domain/listing/offering";
import type { Framing } from "@repo/core/domain/listing/values";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { requireActor } from "./actor";
import type { EligibilityTarget } from "./apply";
import type {
  ApplyListing,
  ApplyMode,
  ApplyPage,
  ApplyPlace,
  ApplyRefusal,
  ClaimValues,
  ListingRevisionFormData,
  NewListingFormData,
  PlaceRevisionFormData,
  PlaceStateValues,
  RegistrationFormData,
  StewardshipFormData,
} from "./applyView";
import { loadAreaLists, townOfAddress } from "./areaData";
import { loadCategoryOptions } from "./listingData";
import {
  EMPTY_LISTING_FORM,
  type ListingFormValues,
  offeringDraftOf,
} from "./listingForm";
import type { PlaceFormValues } from "./placeForm";
import { listingIdOf, placeIdOf } from "./targetIds";

/** How a screen was opened: `?resubmit=` / `?reapply=` (at most one is used). */
export type ApplyEntry = Readonly<{
  resubmit: string | null;
  reapply: string | null;
}>;

/**
 * An application id from the URL or a request. One that cannot be an id
 * names no application, so it reads as missing (CS-06).
 */
export function applicationIdOf(raw: string): ApplicationId {
  try {
    return ApplicationId.create(raw);
  } catch {
    throw new NotFoundError(
      "APPLICATION_NOT_FOUND",
      `No application has the id ${raw}`,
    );
  }
}

const notFound = (): NotFoundError =>
  new NotFoundError(
    "APPLICATION_NOT_FOUND",
    "The application is not one this screen resubmits or reapplies for",
  );

async function actorAndContainer(): Promise<
  Readonly<{ container: RequestContainer; actor: Actor }>
> {
  const container = await getContainer();
  return { container, actor: await requireActor(container) };
}

// --- Eligibility ------------------------------------------------------------

/**
 * The refusal shown for an eligibility check that did not accept, by the
 * submission's order of judgement: premises, targets that must be
 * viewable, the active duplicate.
 */
function refusalOf(eligibility: SubmissionEligibility): ApplyRefusal | null {
  if (eligibility.accepted) return null;
  const { target } = eligibility;
  const [premise] = eligibility.brokenPremises;
  const placeId = "placeId" in target ? target.placeId : null;
  const listingId = target.kind === "listingRevision" ? target.listingId : null;
  switch (premise) {
    case "placeHasNoSteward":
      return {
        kind: "hasSteward",
        placeId: placeId ?? "",
        listingId,
      };
    case "listingExists":
      return { kind: "unavailable", subject: "listing" };
    case "applicantNotSteward":
      return { kind: "alreadySteward", placeId: placeId ?? "" };
    case "registrationStanding":
      return target.kind === "stewardship" && target.registrationId !== null
        ? { kind: "registrationEnded", registrationId: target.registrationId }
        : { kind: "unavailable", subject: "place" };
    case undefined:
      break;
    default:
      return { kind: "unavailable", subject: "place" };
  }
  const [unviewable] = eligibility.unviewable;
  if (unviewable !== undefined) {
    return {
      kind: "unavailable",
      subject: unviewable.kind === "listing" ? "listing" : "place",
    };
  }
  if (eligibility.activeDuplicate !== null) {
    return {
      kind: "active",
      applicationId: eligibility.activeDuplicate,
      subject: target.kind === "listingRevision" ? "listing" : "place",
    };
  }
  return null;
}

function eligibilityInput(target: EligibilityTarget): EligibilityTargetInput {
  if ("listingId" in target) {
    return {
      kind: "listingRevision",
      listingId: listingIdOf(target.listingId),
    };
  }
  if ("registrationId" in target) {
    return {
      kind: "stewardship",
      registrationId: applicationIdOf(target.registrationId),
    };
  }
  return { kind: target.kind, placeId: placeIdOf(target.placeId) };
}

async function checkRefusal(
  container: RequestContainer,
  actor: Actor,
  target: EligibilityTargetInput,
): Promise<
  Readonly<{
    refusal: ApplyRefusal | null;
    eligibility: SubmissionEligibility;
  }>
> {
  const eligibility = await checkSubmissionEligibility({
    container,
    actor,
    input: { target },
  });
  return { refusal: refusalOf(eligibility), eligibility };
}

/** `checkEligibilityFn`: the refusal a submission of `target` meets now. */
export async function eligibilityRefusal(
  target: EligibilityTarget,
): Promise<ApplyRefusal | null> {
  const { container, actor } = await actorAndContainer();
  return (await checkRefusal(container, actor, eligibilityInput(target)))
    .refusal;
}

// --- The application an entry names ------------------------------------------

type Started = Readonly<{ app: MyApplicationView; mode: ApplyMode }>;

/**
 * The returned application `?resubmit=` names, or the ended one
 * `?reapply=` names, which must be of `kind` (else CS-06). A status that
 * does not allow the entry is a refusal (CS-08).
 */
async function startedFrom(
  container: RequestContainer,
  actor: Actor,
  entry: ApplyEntry,
  kind: ApplicationKind,
): Promise<Started | ApplyRefusal | null> {
  const raw = entry.resubmit ?? entry.reapply;
  if (raw === null) return null;
  const app = await getMyApplication({
    container,
    actor,
    input: { applicationId: applicationIdOf(raw) },
  });
  if (app.kind !== kind) throw notFound();
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

const isRefusal = (
  value: Started | ApplyRefusal | null,
): value is ApplyRefusal => value !== null && !("app" in value);

// --- Values -----------------------------------------------------------------

type PlaceSource = Readonly<{
  name: string;
  photos: readonly Readonly<{ photoId: string; url: string | null }>[];
  description: string | null;
  address: Address;
  location: Readonly<{ latitude: number; longitude: number }>;
  businessHours: string | null;
  contact: string | null;
}>;

async function placeValuesOf(
  container: RequestContainer,
  source: PlaceSource,
): Promise<PlaceFormValues> {
  return {
    photos: source.photos.map((photo) => ({
      photoId: photo.photoId,
      url: photo.url ?? "",
    })),
    name: source.name,
    town: await townOfAddress(container, source.address),
    addressRest: source.address.rest,
    latitude: String(source.location.latitude),
    longitude: String(source.location.longitude),
    businessHours: source.businessHours ?? "",
    description: source.description ?? "",
    contact: source.contact ?? "",
  };
}

const profileSource = (profile: PlaceProfileView): PlaceSource => ({
  name: profile.name,
  photos: profile.photos.map((photo) => ({
    photoId: photo.photoId,
    url: photo.display?.url ?? null,
  })),
  description: profile.description,
  address: profile.address,
  location: profile.location,
  businessHours: profile.businessHours,
  contact: profile.contact,
});

type ListingSource = Readonly<{
  name: string | null;
  description: string | null;
  categoryId: string | null;
  photos: readonly Readonly<{
    photoId: string;
    url: string | null;
    framing: Framing | null;
  }>[];
  offering: Offering;
}>;

const listingValuesOf = (source: ListingSource): ListingFormValues => ({
  photos: source.photos,
  name: source.name ?? "",
  categoryId: source.categoryId ?? "",
  description: source.description ?? "",
  offering: offeringDraftOf(source.offering),
});

const contentSource = (content: ListingContentView): ListingSource => ({
  name: content.name,
  description: content.description,
  categoryId: content.category?.id ?? null,
  photos: content.photos.map((photo) => ({
    photoId: photo.photoId,
    url: photo.display?.url ?? null,
    framing: photo.framing,
  })),
  offering: content.offering,
});

/** The display URLs of a reapplication's (duplicated) photos. */
const reappliedUrls = (
  reapplication: Reapplication,
): ReadonlyMap<string, string> =>
  new Map(
    reapplication.photos.map((photo) => [photo.photoId, photo.displayRef.url]),
  );

async function reappliedPlace(
  container: RequestContainer,
  reapplication: Reapplication,
): Promise<PlaceStateValues | null> {
  const { content } = reapplication;
  const urls = reappliedUrls(reapplication);
  const state =
    content.kind === "registration"
      ? { profile: content.profile, operatingStatus: null }
      : content.kind === "revision"
        ? {
            profile: content.desired.profile,
            operatingStatus: content.desired.operatingStatus,
          }
        : null;
  if (state === null) return null;
  const { profile } = state;
  const values = await placeValuesOf(container, {
    name: profile.name,
    photos: profile.photos.items.map((photo) => ({
      photoId: photo.photoId,
      url: urls.get(photo.photoId) ?? null,
    })),
    description: profile.description,
    address: profile.address,
    location: profile.location,
    businessHours: profile.visitInfo.businessHours,
    contact: profile.visitInfo.contact,
  });
  return { values, operatingStatus: state.operatingStatus ?? "open" };
}

function reappliedListing(
  reapplication: Reapplication,
): ListingFormValues | null {
  const { content } = reapplication;
  const listing =
    content.kind === "listing"
      ? content.content
      : content.kind === "listingRevision"
        ? content.desired
        : null;
  if (listing === null) return null;
  const urls = reappliedUrls(reapplication);
  return listingValuesOf({
    name: listing.name,
    description: listing.description,
    categoryId: listing.categoryId,
    photos: listing.photos.items.map((photo) => ({
      photoId: photo.photoId,
      url: urls.get(photo.photoId) ?? null,
      framing: photo.framing,
    })),
    offering: listing.offering,
  });
}

// --- Targets ----------------------------------------------------------------

type PlaceRead = Readonly<{
  place: ApplyPlace;
  current: PlaceStateValues;
  hasSteward: boolean;
}>;

/** The place as viewers see it now (`viewPlace`; `NotFoundError` when not viewable). */
async function readPlace(
  container: RequestContainer,
  actor: Actor,
  rawPlaceId: string,
): Promise<PlaceRead> {
  const view = await viewPlace({
    container,
    actor,
    input: { placeId: placeIdOf(rawPlaceId) },
  });
  const { place, photos } = view;
  const photoItems = place.photos.map((photo) => ({
    photoId: photo.photoId,
    url: photos[photo.photoId]?.url ?? null,
  }));
  const values = await placeValuesOf(container, {
    name: place.name,
    photos: photoItems,
    description: place.description,
    address: place.address,
    location: place.location,
    businessHours: place.visitInfo.businessHours,
    contact: place.visitInfo.contact,
  });
  const [cover] = photoItems;
  return {
    place: {
      placeId: place.placeId,
      name: place.name,
      address: Address.text(place.address),
      cover:
        cover === undefined || cover.url === null
          ? null
          : { photoId: cover.photoId, url: cover.url },
      operatingStatus: place.standing.operating,
    },
    current: { values, operatingStatus: place.standing.operating },
    hasSteward: !view.placeIsVacant,
  };
}

/** A place known only by its id and name (not viewable now, or not yet). */
const namedPlace = (
  placeId: string,
  name: string,
  operatingStatus: OperatingStatus = "open",
): ApplyPlace => ({
  placeId,
  name,
  address: "",
  cover: null,
  operatingStatus,
});

async function readPlaceOrNull(
  container: RequestContainer,
  actor: Actor,
  placeId: string,
): Promise<PlaceRead | null> {
  try {
    return await readPlace(container, actor, placeId);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

const subjectName = (app: MyApplicationView): string =>
  app.subjects.find((subject) => subject.name !== null)?.name ?? "";

// --- Screens ----------------------------------------------------------------

/** RQ-02 登録: a new registration, its reapplication, or its resubmission. */
export async function loadRegistrationPage(
  entry: ApplyEntry,
): Promise<ApplyPage<RegistrationFormData>> {
  const { container, actor } = await actorAndContainer();
  const started = await startedFrom(container, actor, entry, "registration");
  if (isRefusal(started)) return { kind: "refused", refusal: started };
  if (started === null) {
    return {
      kind: "form",
      data: {
        mode: { kind: "new" },
        lists: await loadAreaLists(container, null),
        start: EMPTY_PLACE,
      },
    };
  }
  let start: PlaceFormValues;
  if (started.mode.kind === "resubmit") {
    const { content } = started.app;
    if (content.kind !== "registration") throw notFound();
    start = await placeValuesOf(container, profileSource(content.profile));
  } else {
    const reapplied = await reappliedPlace(
      container,
      await prepareReapplication({
        container,
        actor,
        input: { applicationId: started.app.id },
      }),
    );
    if (reapplied === null) throw notFound();
    start = reapplied.values;
  }
  return {
    kind: "form",
    data: {
      mode: started.mode,
      lists: await loadAreaLists(container, start.town),
      start,
    },
  };
}

const EMPTY_PLACE: PlaceFormValues = {
  photos: [],
  name: "",
  town: null,
  addressRest: "",
  latitude: "",
  longitude: "",
  businessHours: "",
  description: "",
  contact: "",
};

/** RQ-02 修正: the place's revision, its reapplication, or its resubmission. */
export async function loadPlaceRevisionPage(
  rawPlaceId: string,
  entry: ApplyEntry,
): Promise<ApplyPage<PlaceRevisionFormData>> {
  const { container, actor } = await actorAndContainer();
  const started = await startedFrom(container, actor, entry, "revision");
  if (isRefusal(started)) return { kind: "refused", refusal: started };
  const placeId = placeIdOf(rawPlaceId);
  if (started?.mode.kind === "resubmit") {
    const { content } = started.app;
    if (content.kind !== "revision" || content.placeId !== placeId) {
      throw notFound();
    }
    // The place as it is now: the laid-on content with each changed item
    // put back to its current value.
    const preview = content.preview;
    const start: PlaceStateValues = {
      values: await placeValuesOf(container, profileSource(preview.profile)),
      operatingStatus: preview.operatingStatus,
    };
    let currentProfile = profileSource(preview.profile);
    let currentStatus = preview.operatingStatus;
    for (const change of content.changes) {
      switch (change.field) {
        case "operatingStatus":
          currentStatus = change.current;
          break;
        case "photos":
          currentProfile = {
            ...currentProfile,
            photos: change.current.map((photo) => ({
              photoId: photo.photoId,
              url: photo.display?.url ?? null,
            })),
          };
          break;
        default:
          currentProfile = {
            ...currentProfile,
            [change.field]: change.current,
          };
      }
    }
    const current: PlaceStateValues = {
      values: await placeValuesOf(container, currentProfile),
      operatingStatus: currentStatus,
    };
    const cover = current.values.photos[0];
    return {
      kind: "form",
      data: {
        mode: started.mode,
        place: {
          placeId,
          name: currentProfile.name,
          address: Address.text(currentProfile.address),
          cover: cover === undefined || cover.url === "" ? null : cover,
          operatingStatus: currentStatus,
        },
        lists: await loadAreaLists(container, start.values.town),
        current,
        start,
      },
    };
  }
  if (started !== null) {
    const content = started.app.content;
    if (content.kind !== "revision" || content.placeId !== placeId) {
      throw notFound();
    }
  }
  const { refusal } = await checkRefusal(container, actor, {
    kind: "revision",
    placeId,
  });
  if (refusal !== null) return { kind: "refused", refusal };
  const read = await readPlace(container, actor, placeId);
  const reapplied =
    started === null
      ? null
      : await reappliedPlace(
          container,
          await prepareReapplication({
            container,
            actor,
            input: { applicationId: started.app.id },
          }),
        );
  const start = reapplied ?? read.current;
  return {
    kind: "form",
    data: {
      mode: started?.mode ?? { kind: "new" },
      place: read.place,
      lists: await loadAreaLists(container, start.values.town),
      current: read.current,
      start,
    },
  };
}

/** RQ-03: a claim on a place, its reapplication (a companion claim's too), or its resubmission. */
export async function loadStewardshipPage(
  rawPlaceId: string,
  entry: ApplyEntry,
): Promise<ApplyPage<StewardshipFormData>> {
  const { container, actor } = await actorAndContainer();
  const started = await startedFrom(container, actor, entry, "stewardship");
  if (isRefusal(started)) return { kind: "refused", refusal: started };
  const placeId = placeIdOf(rawPlaceId);
  let start: ClaimValues = { relationship: "", evidence: "" };
  let registrationId: ApplicationId | null = null;
  if (started !== null) {
    const { content } = started.app;
    if (content.kind !== "stewardship" || content.placeId !== placeId) {
      throw notFound();
    }
    start = { relationship: content.relationship, evidence: content.evidence };
    registrationId = started.app.registrationId;
  }
  const notYet = started?.app.subjects.some((subject) => subject.notYet);
  const target =
    registrationId !== null && notYet === true
      ? ({ registrationId } as const)
      : ({ placeId } as const);
  if (started?.mode.kind !== "resubmit") {
    const { refusal, eligibility } = await checkRefusal(
      container,
      actor,
      "registrationId" in target
        ? { kind: "stewardship", registrationId: target.registrationId }
        : { kind: "stewardship", placeId },
    );
    if (refusal !== null) return { kind: "refused", refusal };
    if (started !== null) {
      const reapplication = await prepareReapplication({
        container,
        actor,
        input: { applicationId: started.app.id },
      });
      if (reapplication.content.kind === "stewardship") {
        start = {
          relationship: reapplication.content.claim.relationship,
          evidence: reapplication.content.claim.evidence,
        };
      }
    }
    if ("registrationId" in target) {
      return {
        kind: "form",
        data: {
          mode: started?.mode ?? { kind: "new" },
          place: {
            kind: "notYet",
            placeId,
            name: started === null ? "" : subjectName(started.app),
          },
          target,
          start,
        },
      };
    }
    const read = await readPlace(container, actor, placeId);
    return {
      kind: "form",
      data: {
        mode: started?.mode ?? { kind: "new" },
        place: {
          kind: "place",
          place: read.place,
          hasSteward: eligibility.placeHasSteward ?? read.hasSteward,
        },
        target,
        start,
      },
    };
  }
  // A resubmission: the place need not be viewable, and one that does not
  // exist yet is named from its registration.
  const read =
    notYet === true ? null : await readPlaceOrNull(container, actor, placeId);
  return {
    kind: "form",
    data: {
      mode: started.mode,
      place:
        read === null
          ? { kind: "notYet", placeId, name: subjectName(started.app) }
          : { kind: "place", place: read.place, hasSteward: read.hasSteward },
      target,
      start,
    },
  };
}

/** RQ-04 新しい掲載: a listing application, its reapplication, or its resubmission. */
export async function loadNewListingPage(
  rawPlaceId: string,
  entry: ApplyEntry,
): Promise<ApplyPage<NewListingFormData>> {
  const { container, actor } = await actorAndContainer();
  const started = await startedFrom(container, actor, entry, "listing");
  if (isRefusal(started)) return { kind: "refused", refusal: started };
  const placeId = placeIdOf(rawPlaceId);
  if (started !== null) {
    const { content } = started.app;
    if (content.kind !== "listing" || content.placeId !== placeId) {
      throw notFound();
    }
  }
  const categories = await loadCategoryOptions();
  if (started?.mode.kind === "resubmit") {
    const { content } = started.app;
    if (content.kind !== "listing") throw notFound();
    const read = await readPlaceOrNull(container, actor, placeId);
    return {
      kind: "form",
      data: {
        mode: started.mode,
        place: read?.place ?? namedPlace(placeId, subjectName(started.app)),
        categories,
        start: listingValuesOf(contentSource(content.content)),
      },
    };
  }
  const { refusal } = await checkRefusal(container, actor, {
    kind: "listing",
    placeId,
  });
  if (refusal !== null) return { kind: "refused", refusal };
  const read = await readPlace(container, actor, placeId);
  const start =
    started === null
      ? EMPTY_LISTING_FORM
      : (reappliedListing(
          await prepareReapplication({
            container,
            actor,
            input: { applicationId: started.app.id },
          }),
        ) ?? EMPTY_LISTING_FORM);
  return {
    kind: "form",
    data: {
      mode: started?.mode ?? { kind: "new" },
      place: read.place,
      categories,
      start,
    },
  };
}

/** RQ-04 修正: a listing revision, its reapplication, or its resubmission. */
export async function loadListingRevisionPage(
  rawListingId: string,
  entry: ApplyEntry,
): Promise<ApplyPage<ListingRevisionFormData>> {
  const { container, actor } = await actorAndContainer();
  const started = await startedFrom(container, actor, entry, "listingRevision");
  if (isRefusal(started)) return { kind: "refused", refusal: started };
  const listingId = listingIdOf(rawListingId);
  if (started !== null) {
    const { content } = started.app;
    if (content.kind !== "listingRevision" || content.listingId !== listingId) {
      throw notFound();
    }
  }
  const categories = await loadCategoryOptions();
  if (started?.mode.kind === "resubmit") {
    const { content } = started.app;
    if (content.kind !== "listingRevision") throw notFound();
    const { revision } = content;
    if (revision.listing === "deleted") {
      return {
        kind: "refused",
        refusal: { kind: "unavailable", subject: "listing" },
      };
    }
    const start = listingValuesOf(contentSource(revision.preview));
    let current = start;
    let currentCategoryName = revision.preview.category?.name ?? null;
    for (const change of revision.changes) {
      switch (change.field) {
        case "name":
          current = { ...current, name: change.current ?? "" };
          break;
        case "description":
          current = { ...current, description: change.current ?? "" };
          break;
        case "category":
          current = { ...current, categoryId: change.current?.id ?? "" };
          currentCategoryName = change.current?.name ?? null;
          break;
        case "photos":
          current = {
            ...current,
            photos: change.current.map((photo) => ({
              photoId: photo.photoId,
              url: photo.display?.url ?? null,
              framing: photo.framing,
            })),
          };
          break;
        case "offering":
          current = { ...current, offering: offeringDraftOf(change.current) };
          break;
      }
    }
    const read = await readPlaceOrNull(container, actor, content.placeId);
    const [cover] = current.photos;
    return {
      kind: "form",
      data: {
        mode: started.mode,
        listing: {
          listingId,
          name: current.name,
          cover:
            cover === undefined || cover.url === null
              ? null
              : { photoId: cover.photoId, url: cover.url },
        },
        place:
          read?.place ??
          namedPlace(
            content.placeId,
            started.app.subjects.find((s) => s.ref.kind === "place")?.name ??
              "",
          ),
        categories,
        current,
        currentCategoryName,
        start,
      },
    };
  }
  const { refusal } = await checkRefusal(container, actor, {
    kind: "listingRevision",
    listingId,
  });
  if (refusal !== null) return { kind: "refused", refusal };
  const view = await viewListing({
    container,
    input: { listingId, otherListingsLimit: 1 },
  });
  const { listing, photos } = view;
  const current = listingValuesOf({
    name: listing.name,
    description: listing.description,
    categoryId: listing.category.id,
    photos: listing.photos.map((photo) => ({
      photoId: photo.photoId,
      url: photos[photo.photoId]?.url ?? null,
      framing: photo.framing,
    })),
    offering: listing.offering,
  });
  const read = await readPlace(container, actor, listing.place.placeId);
  const start =
    started === null
      ? current
      : (reappliedListing(
          await prepareReapplication({
            container,
            actor,
            input: { applicationId: started.app.id },
          }),
        ) ?? current);
  const [cover] = current.photos;
  const apply: ApplyListing = {
    listingId,
    name: listing.name,
    cover:
      cover === undefined || cover.url === null
        ? null
        : { photoId: cover.photoId, url: cover.url },
  };
  return {
    kind: "form",
    data: {
      mode: started?.mode ?? { kind: "new" },
      listing: apply,
      place: read.place,
      categories,
      current,
      currentCategoryName: listing.category.name,
      start,
    },
  };
}
