import {
  Application,
  ApplicationCase,
  type ApplicationKind,
} from "@repo/core/domain/application/application";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import { Address } from "@repo/core/domain/common/address";
import type {
  ApplicationId,
  ListingId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import type { Version } from "@repo/core/domain/common/version";
import { VisibilityPolicy } from "@repo/core/domain/discovery/visibilityPolicy";
import type { Listing } from "@repo/core/domain/listing/listing";
import { PlaceMatchCriteria } from "@repo/core/domain/place/matching";
import { Place } from "@repo/core/domain/place/place";
import type { PlaceName } from "@repo/core/domain/place/profile";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import { displayRefsOf } from "../place/photos";
import type { ActorServiceArgs } from "../types";
import { type CompanionView, companionView } from "./companion";
import {
  type ApplicationContentView,
  type ContentSource,
  companionOf,
  contentView,
  photoIdsOf,
  readContentSource,
  registrationIdOf,
} from "./detail";
import {
  type OpenReviewPermission,
  requireApplication,
  reviewPermission,
} from "./review";
import {
  type ApplicantView,
  type ApplicationStatusView,
  applicantView,
  nameSubjects,
  readSummaryReads,
  type SubjectView,
} from "./views";

const SIMILAR_PLACES = 20;

export type GetApplicationForReviewInput = Readonly<{
  applicationId: ApplicationId;
}>;

/**
 * Whether viewers can see a subject now — for display only, approval
 * never depends on it: `notYet` for 「まだない対象」 (never judged),
 * `missing` for a deleted listing.
 */
export type SubjectViewability =
  | "viewable"
  | "notViewable"
  | "notYet"
  | "missing";

/**
 * Why viewers cannot see a subject, as far as CM-01 tells it: the subject
 * is suspended by the operators (運営による非公開), and — for a listing —
 * its place is. Both `false`: another reason (a listing not published, a
 * place that is gone, …).
 */
export type HiddenBy = Readonly<{
  suspended: boolean;
  placeSuspended: boolean;
}>;

export type ReviewSubjectView = SubjectView &
  (
    | Readonly<{ viewability: Exclude<SubjectViewability, "notViewable"> }>
    | Readonly<{ viewability: "notViewable"; hiddenBy: HiddenBy }>
  );

/** An existing place close to a registration's name or address (suspended ones included). */
export type SimilarPlaceView = Readonly<{
  placeId: PlaceId;
  name: PlaceName;
  address: Address;
  suspended: boolean;
}>;

/** The facts the reviewer checks per kind. */
export type ReviewFacts =
  | Readonly<{
      kind: "registration";
      /** Most relevant first; the registration's own place left out. */
      similarPlaces: readonly SimilarPlaceView[];
    }>
  | Readonly<{ kind: "stewardship"; placeHasSteward: boolean }>
  | Readonly<{ kind: "none" }>;

/** One application as its reviewer reads it (CM-01). */
export type ApplicationForReview = Readonly<{
  id: ApplicationId;
  kind: ApplicationKind;
  /** The version a decision is sent with. */
  version: Version;
  submittedAt: Date;
  /** An individual with their account's email address (`null` once withdrawn). */
  applicant: ApplicantView;
  subjects: readonly ReviewSubjectView[];
  /**
   * The status; under review after a resubmission it carries the return
   * it answers and the reply. A steward-seat decision carries `reviewAs`.
   */
  status: ApplicationStatusView;
  content: ApplicationContentView;
  /**
   * What the actor may do now: decide as the approver or as the overdue
   * proxy, or only look (`awaitingStewards`: the stewards' period has not
   * elapsed; `registrationPending`: the companion registration is not
   * decided). Decisions re-judge it at their own time.
   */
  permission: OpenReviewPermission;
  facts: ReviewFacts;
  /** A registration's companion claim (the active one, else the newest). */
  companion: CompanionView | null;
  /** A companion claim's registration. */
  registrationId: ApplicationId | null;
  /** Where an approved application landed; `null` until approved. */
  reflected: ContentRef | null;
}>;

/** Viewability of the subjects read as aggregates for the content view. */
function readViewability(
  source: ContentSource,
): ReadonlyMap<string, SubjectViewability> {
  const judged = new Map<string, SubjectViewability>();
  const place = (id: PlaceId, found: Place | null) =>
    judged.set(
      ContentRef.key({ kind: "place", id }),
      found !== null && VisibilityPolicy.isPlaceViewable(found)
        ? "viewable"
        : "notViewable",
    );
  if (source.kind === "revision") {
    place(source.app.target.placeId, source.place);
  }
  if (source.kind === "listingRevision") {
    place(source.app.placeId, source.place);
    judged.set(
      ContentRef.key({ kind: "listing", id: source.app.target.listingId }),
      source.listing === null
        ? "missing"
        : VisibilityPolicy.isListingViewable(source.listing, source.place)
          ? "viewable"
          : "notViewable",
    );
  }
  return judged;
}

const OTHER_REASON: HiddenBy = { suspended: false, placeSuspended: false };

/**
 * `HiddenBy` of each place and listing the application is about (its
 * proposed listing included), from the aggregates `source` read or read
 * here. What does not exist (yet) is absent.
 */
async function readHiddenBy(
  ctx: Pick<UnitOfWorkContext, "placeRepository" | "listingRepository">,
  app: Application,
  source: ContentSource,
): Promise<ReadonlyMap<string, HiddenBy>> {
  const places = new Map<PlaceId, Place | null>();
  const listings = new Map<ListingId, Listing | null>();
  if (source.kind === "revision") {
    places.set(source.app.target.placeId, source.place);
  }
  if (source.kind === "listingRevision") {
    places.set(source.app.placeId, source.place);
    listings.set(source.app.target.listingId, source.listing);
  }
  const placeOf = async (id: PlaceId): Promise<Place | null> => {
    if (places.has(id)) return places.get(id) ?? null;
    const found = (await ctx.placeRepository.findById(id))?.entity ?? null;
    places.set(id, found);
    return found;
  };
  const listingOf = async (id: ListingId): Promise<Listing | null> =>
    listings.has(id)
      ? (listings.get(id) ?? null)
      : ((await ctx.listingRepository.findById(id))?.entity ?? null);
  const refs = [
    ...Application.subjects(app),
    ...ApplicationCase.contentNames(app).map(({ ref }) => ref),
  ];
  const judged = new Map<string, HiddenBy>();
  for (const ref of refs) {
    if (ref.kind === "place") {
      const place = await placeOf(ref.id);
      if (place === null) continue;
      judged.set(ContentRef.key(ref), {
        suspended: Place.isSuspended(place),
        placeSuspended: false,
      });
    } else if (ref.kind === "listing") {
      const listing = await listingOf(ref.id);
      if (listing === null) continue;
      const place = await placeOf(listing.placeId);
      judged.set(ContentRef.key(ref), {
        suspended: listing.suspension.suspended,
        placeSuspended: place !== null && Place.isSuspended(place),
      });
    }
  }
  return judged;
}

async function readFacts(
  ctx: Pick<UnitOfWorkContext, "placeRepository">,
  source: ContentSource,
): Promise<ReviewFacts> {
  switch (source.kind) {
    case "registration": {
      const { content, reservedPlaceId } = source.app;
      const page = await ctx.placeRepository.match(
        PlaceMatchCriteria.create({
          name: content.name,
          address: Address.text(content.address),
          includeSuspended: true,
        }),
        { page: 1, limit: SIMILAR_PLACES + 1 },
      );
      return {
        kind: "registration",
        similarPlaces: page.items
          .filter((place) => place.id !== reservedPlaceId)
          .slice(0, SIMILAR_PLACES)
          .map((place) => ({
            placeId: place.id,
            name: place.profile.name,
            address: place.profile.address,
            suspended: Place.isSuspended(place),
          })),
      };
    }
    case "stewardship":
      return {
        kind: "stewardship",
        placeHasSteward: !Stewardship.isVacant(source.stewardship),
      };
    default:
      return { kind: "none" };
  }
}

/**
 * The reviewer reads one application (APP-07, APP-08, SHP-09–SHP-11,
 * LST-14; CM-01): its content with photos in any status, the status (with
 * the answered return and the reply after a resubmission), what the actor
 * may do now (`ReviewPermission`, judged on the facts now — `awaitingStewards`
 * and `registrationPending` are answers, not errors), whether each
 * subject can be viewed (for display only; 「まだない対象」 is shown as not
 * existing yet), a revision's items against the target now and the target
 * with them laid on (only the proposed values when the listing is gone),
 * and per kind: places similar to a registration (suspended included) and
 * its companion claim; whether a claimed place already has stewards and
 * the claim's registration. Retired categories read as their active
 * successors. An individual applicant comes with their account's email
 * address, read through the Account port (`AccountRepository`), `null`
 * once they have withdrawn.
 *
 * - `NotFoundError`; `ForbiddenError` when the actor is neither the
 *   approver nor an operator who may stand in.
 */
export async function getApplicationForReview({
  container,
  actor,
  input,
}: ActorServiceArgs<GetApplicationForReviewInput>): Promise<ApplicationForReview> {
  const now = container.clock.now();
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireApplication(ctx, input.applicationId);
    const app = found.entity;
    const permission = await reviewPermission(
      ctx,
      actor,
      app,
      container.reviewPolicy,
      now,
    );
    const source = await readContentSource(ctx, app);
    return {
      app,
      permission,
      source,
      facts: await readFacts(ctx, source),
      hiddenBy: await readHiddenBy(ctx, app, source),
      reads: await readSummaryReads(ctx, [app]),
    };
  });
  const { app, source } = read;
  const judged = readViewability(source);
  const [subjects, refs] = await Promise.all([
    nameSubjects(container.contentDirectory, [app], read.reads.registrations),
    displayRefsOf(container.photoStorage, photoIdsOf(source)),
  ]);
  const named = subjects.get(app.id) ?? [];
  const withViewability = await Promise.all(
    named.map(async (subject): Promise<ReviewSubjectView> => {
      if (subject.notYet) return { ...subject, viewability: "notYet" };
      const key = ContentRef.key(subject.ref);
      const viewability =
        judged.get(key) ??
        ((await container.referenceQueries.isViewable(subject.ref))
          ? "viewable"
          : "notViewable");
      return viewability === "notViewable"
        ? {
            ...subject,
            viewability,
            hiddenBy: read.hiddenBy.get(key) ?? OTHER_REASON,
          }
        : { ...subject, viewability };
    }),
  );
  return {
    id: app.id,
    kind: app.target.kind,
    version: app.version,
    submittedAt: app.submittedAt,
    applicant: applicantView(app, named, read.reads.emails),
    subjects: withViewability,
    status: app.status,
    content: contentView(source, refs),
    permission: read.permission,
    facts: read.facts,
    companion: companionView(companionOf(source)),
    registrationId: registrationIdOf(source),
    reflected:
      app.status.kind === "approved" ? Application.reflectedRef(app) : null,
  };
}
