import type {
  EventDraft,
  WithEventDrafts,
} from "@repo/core/domain/common/event";
import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import {
  CategoryId,
  ListingId,
  PhotoId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import {
  PhotosReleasedEvent,
  PhotosTakenDownEvent,
} from "@repo/core/domain/common/photoEvents";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import {
  type DraftPublication,
  Publication,
  type PublishedPublication,
  type UnpublishedPublication,
  type UnpublishReason,
} from "@repo/core/domain/common/publication";
import { Suspension } from "@repo/core/domain/common/suspension";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { CategoryCatalog } from "./categoryCatalog";
import { ListingContent, type PublishableListingContent } from "./content";
import { ListingErrorCode } from "./errorCode";
import {
  type ListingDeletedEvent,
  ListingEvents,
  type ListingSuspendedEvent,
  type ListingUnpublishedEvent,
  type ListingUnsuspendedEvent,
} from "./events";
import {
  ManualEnd,
  Offering,
  type OfferingPeriod,
  OfferingPeriod as OfferingPeriodValue,
  type OfferingPhase,
  OfferingStatus,
  OpenDates,
} from "./offering";
import { ListingPatch } from "./patch";
import {
  Framing,
  ListingDescription,
  ListingName,
  type ListingPhoto,
} from "./values";

type ListingBase = Readonly<{
  id: ListingId;
  /** Fixed at creation. */
  placeId: PlaceId;
  suspension: Suspension;
  version: Version;
  /** When the content or a state last changed. */
  updatedAt: Date;
}>;

export type DraftListing = ListingBase &
  Readonly<{ publication: DraftPublication; content: ListingContent }>;

export type PublishedListing = ListingBase &
  Readonly<{
    publication: PublishedPublication;
    content: PublishableListingContent;
    manualEnd: ManualEnd;
  }>;

export type UnpublishedListing = ListingBase &
  Readonly<{
    publication: UnpublishedPublication;
    content: ListingContent;
    manualEnd: ManualEnd;
  }>;

/**
 * A listing (掲載) of one place. One variant per publication state, so a
 * published listing lacking the publish condition cannot be represented.
 */
export type Listing = DraftListing | PublishedListing | UnpublishedListing;

/** Published (not suspended), draft (not suspended), or hidden (suspended or unpublished). */
export type PublicationShelf = "published" | "draft" | "hidden";

/** A management list filter: `null` does not filter on that axis. */
export type ListingShelf = Readonly<{
  publication: PublicationShelf | null;
  phase: OfferingPhase | null;
}>;

export type FramingSnapshot = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type OfferingSnapshot =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "period"; start: string | null; end: string | null }>
  | Readonly<{ kind: "dates"; dates: readonly string[] }>;

export type ListingContentSnapshot = Readonly<{
  name: string | null;
  description: string | null;
  categoryId: string | null;
  photos: readonly Readonly<{
    photoId: string;
    framing: FramingSnapshot | null;
  }>[];
  photosTakenDown: boolean;
  offering: OfferingSnapshot;
}>;

/** The at-rest form of a listing, in primitives. */
export type ListingSnapshot = Readonly<{
  id: string;
  placeId: string;
  publication: Readonly<{
    status: string;
    firstPublishedAt: Date | null;
    reason: string | null;
  }>;
  suspended: boolean;
  /** `null` for a draft, which has no manual end. */
  manualEnded: boolean | null;
  content: ListingContentSnapshot;
  updatedAt: Date;
  version: number;
}>;

type Result<L extends Listing = Listing> = WithEventDrafts<
  L,
  | PhotosReleasedEvent
  | PhotosTakenDownEvent
  | ListingUnpublishedEvent
  | ListingSuspendedEvent
  | ListingUnsuspendedEvent
>;

const SUBJECT = "LISTING";

const rule = (code: ListingErrorCode, message: string) =>
  new BusinessRuleError(code, message);

const exposure = (listing: Listing) => ({
  publication: listing.publication,
  suspension: listing.suspension,
});

const isDraft = (listing: Listing): listing is DraftListing =>
  listing.publication.status === "draft";

const isPublished = (listing: Listing): listing is PublishedListing =>
  listing.publication.status === "published";

/** A draft has no manual end: it reads as not ended. */
const manualEndOf = (listing: Listing): ManualEnd =>
  isDraft(listing) ? ManualEnd.none() : listing.manualEnd;

const touched = <L extends Listing>(listing: L, now: Date): L => ({
  ...listing,
  version: Version.next(listing.version),
  updatedAt: now,
});

/**
 * `content` in place of the listing's, keeping its state. A published
 * listing's content must be publishable.
 */
function withContent(listing: Listing, content: ListingContent): Listing {
  if (isDraft(listing)) return { ...listing, content };
  if (isPublished(listing)) {
    return { ...listing, content: ListingContent.toPublishable(content) };
  }
  return { ...listing, content };
}

const requireCategoryIfSet = (
  catalog: CategoryCatalog,
  content: ListingContent,
): void => {
  if (content.categoryId !== null) {
    CategoryCatalog.requireActive(catalog, content.categoryId);
  }
};

const resolvedCategory = (
  catalog: CategoryCatalog,
  id: CategoryId | null,
): CategoryId | null =>
  id === null ? null : CategoryCatalog.resolve(catalog, id).id;

function createDraft(
  params: Readonly<{
    id: ListingId;
    placeId: PlaceId;
    content: ListingContent;
  }>,
  catalog: CategoryCatalog,
  now: Date,
): WithEventDrafts<DraftListing, never> {
  requireCategoryIfSet(catalog, params.content);
  return {
    entity: {
      id: params.id,
      placeId: params.placeId,
      publication: Publication.draft(),
      content: params.content,
      suspension: Suspension.none,
      version: Version.initial(),
      updatedAt: now,
    },
    eventDrafts: [],
  };
}

/** A published listing from an approved listing application (LST-14). */
function createPublished(
  params: Readonly<{
    id: ListingId;
    placeId: PlaceId;
    content: PublishableListingContent;
  }>,
  catalog: CategoryCatalog,
  now: Date,
): WithEventDrafts<PublishedListing, never> {
  return {
    entity: {
      id: params.id,
      placeId: params.placeId,
      publication: { status: "published", firstPublishedAt: now },
      content: {
        ...params.content,
        categoryId: CategoryCatalog.resolve(catalog, params.content.categoryId)
          .id,
      },
      manualEnd: ManualEnd.none(),
      suspension: Suspension.none,
      version: Version.initial(),
      updatedAt: now,
    },
    eventDrafts: [],
  };
}

/**
 * A draft of the same place carrying `source`'s name, description,
 * category (resolved), photos (order and framing, as the duplicated ids in
 * `photoIds`) and no offering. Throws `LISTING_DUPLICATE_PHOTOS_MISMATCH`
 * unless every source photo has a duplicate.
 */
function duplicate(
  source: Listing,
  params: Readonly<{ id: ListingId; photoIds: ReadonlyMap<PhotoId, PhotoId> }>,
  catalog: CategoryCatalog,
  now: Date,
): WithEventDrafts<DraftListing, never> {
  const items = source.content.photos.items.map((photo): ListingPhoto => {
    const photoId = params.photoIds.get(photo.photoId);
    if (photoId === undefined) {
      throw rule(
        ListingErrorCode.DuplicatePhotosMismatch,
        `No duplicate of photo ${photo.photoId}`,
      );
    }
    return { photoId, framing: photo.framing };
  });
  return {
    entity: {
      id: params.id,
      placeId: source.placeId,
      publication: Publication.draft(),
      content: {
        name: source.content.name,
        description: source.content.description,
        categoryId: resolvedCategory(catalog, source.content.categoryId),
        photos: PhotoSet.of(items, SUBJECT),
        offering: Offering.none(),
      },
      suspension: Suspension.none,
      version: Version.initial(),
      updatedAt: now,
    },
    eventDrafts: [],
  };
}

const sameResolvedCategory = (
  catalog: CategoryCatalog,
  a: CategoryId | null,
  b: CategoryId | null,
): boolean => {
  if (a === null || b === null) return a === b;
  const resolve = (id: CategoryId): CategoryId =>
    CategoryCatalog.find(catalog, id) === undefined
      ? id
      : CategoryCatalog.resolve(catalog, id).id;
  return resolve(a) === resolve(b);
};

/** Whether `candidate` is what `duplicate(source, …)` makes — the replay test of a duplication. */
function isDuplicateOf(
  candidate: Listing,
  source: Listing,
  catalog: CategoryCatalog,
): boolean {
  const a = candidate.content;
  const b = source.content;
  return (
    candidate.placeId === source.placeId &&
    a.name === b.name &&
    a.description === b.description &&
    a.offering.kind === "none" &&
    sameResolvedCategory(catalog, a.categoryId, b.categoryId) &&
    a.photos.items.length === b.photos.items.length &&
    a.photos.items.every((photo, i) =>
      Framing.equals(photo.framing, b.photos.items[i]?.framing ?? null),
    )
  );
}

/**
 * Replaces the content. A published listing must stay publishable
 * (`LISTING_PUBLISH_CONDITION_UNMET`); a chosen category must be active
 * (`LISTING_CATEGORY_NOT_AVAILABLE`). Works in every publication state and
 * while suspended. Unchanged content returns the listing as it is.
 */
function update(
  listing: Listing,
  content: ListingContent,
  catalog: CategoryCatalog,
  now: Date,
): WithEventDrafts<Listing, PhotosReleasedEvent> {
  if (ListingContent.equals(listing.content, content)) {
    return { entity: listing, eventDrafts: [] };
  }
  if (isPublished(listing)) ListingContent.toPublishable(content);
  requireCategoryIfSet(catalog, content);
  const photos = PhotoSet.replace(listing.content.photos, content.photos.items);
  const entity = touched(withContent(listing, { ...content, photos }), now);
  return {
    entity,
    eventDrafts: PhotosReleasedEvent.draftsFor(
      { kind: "listing", id: listing.id },
      PhotoSet.removedPhotoIds(listing.content.photos, photos),
      now,
    ),
  };
}

/**
 * Applies an approved revision: only the fields in `patch` change; the
 * category resolves to an active one. Throws
 * `LISTING_PATCH_PHOTOS_UNAVAILABLE` when no photo would remain.
 */
function applyPatch(
  listing: Listing,
  patch: ListingPatch,
  catalog: CategoryCatalog,
  now: Date,
): WithEventDrafts<Listing, PhotosReleasedEvent> {
  const previewed = FieldPatch.preview(
    ListingPatch.schema,
    listing.content,
    patch,
  );
  if (
    FieldPatch.valueOf(patch, "photos") !== undefined &&
    PhotoSet.isEmpty(previewed.photos)
  ) {
    throw rule(
      ListingErrorCode.PatchPhotosUnavailable,
      "No photo would remain after the revision",
    );
  }
  const content: ListingContent = {
    ...previewed,
    categoryId: resolvedCategory(catalog, previewed.categoryId),
  };
  if (ListingContent.equals(listing.content, content)) {
    return { entity: listing, eventDrafts: [] };
  }
  const entity = touched(withContent(listing, content), now);
  return {
    entity,
    eventDrafts: PhotosReleasedEvent.draftsFor(
      { kind: "listing", id: listing.id },
      PhotoSet.removedPhotoIds(listing.content.photos, content.photos),
      now,
    ),
  };
}

/**
 * Publishes a draft or re-publishes an unpublished listing. The order of
 * checks (suspended, invalid transition, unmet condition) is
 * `Publication.publish`'s. A re-publication keeps the manual end.
 */
function publish(
  listing: Listing,
  now: Date,
): WithEventDrafts<PublishedListing, never> {
  const publication = Publication.publish(
    exposure(listing),
    ListingContent.missingForPublication(listing.content),
    now,
    SUBJECT,
  );
  return {
    entity: {
      id: listing.id,
      placeId: listing.placeId,
      suspension: listing.suspension,
      publication,
      content: ListingContent.toPublishable(listing.content),
      manualEnd: manualEndOf(listing),
      version: Version.next(listing.version),
      updatedAt: now,
    },
    eventDrafts: [],
  };
}

function unpublishedFrom(
  listing: Listing,
  reason: UnpublishReason,
  content: ListingContent,
  now: Date,
): UnpublishedListing {
  return {
    id: listing.id,
    placeId: listing.placeId,
    suspension: listing.suspension,
    publication: Publication.unpublish(exposure(listing), reason, SUBJECT),
    content,
    manualEnd: manualEndOf(listing),
    version: Version.next(listing.version),
    updatedAt: now,
  };
}

/** Unpublishes by the manager (`byManager`); refused while suspended. */
function unpublish(
  listing: Listing,
  now: Date,
): WithEventDrafts<UnpublishedListing, ListingUnpublishedEvent> {
  return {
    entity: unpublishedFrom(listing, "byManager", listing.content, now),
    eventDrafts: [ListingEvents.unpublished(listing.id, "byManager", now)],
  };
}

/** Ends a published listing's offering by hand, whatever its schedule. */
function endOffering(
  listing: Listing,
  now: Date,
): WithEventDrafts<PublishedListing, never> {
  if (!isPublished(listing)) {
    throw rule(ListingErrorCode.NotPublished, "The listing is not published");
  }
  if (listing.manualEnd.ended) {
    throw rule(ListingErrorCode.AlreadyEnded, "The offering is already ended");
  }
  return {
    entity: touched({ ...listing, manualEnd: ManualEnd.ended() }, now),
    eventDrafts: [],
  };
}

/**
 * Lifts a manual end, published or unpublished (LST-08). The status then
 * follows the schedule — a past end date keeps it ended.
 */
function resumeOffering(
  listing: Listing,
  now: Date,
): WithEventDrafts<PublishedListing | UnpublishedListing, never> {
  if (isDraft(listing) || !listing.manualEnd.ended) {
    throw rule(
      ListingErrorCode.NotManuallyEnded,
      "The offering was not ended by hand",
    );
  }
  return {
    entity: touched({ ...listing, manualEnd: ManualEnd.none() }, now),
    eventDrafts: [],
  };
}

function suspend(
  listing: Listing,
  now: Date,
): WithEventDrafts<Listing, ListingSuspendedEvent> {
  const suspension = Suspension.suspend(listing.suspension, SUBJECT);
  return {
    entity: touched({ ...listing, suspension }, now),
    eventDrafts: [ListingEvents.suspended(listing.id, listing.placeId, now)],
  };
}

function unsuspend(
  listing: Listing,
  now: Date,
): WithEventDrafts<Listing, ListingUnsuspendedEvent> {
  const suspension = Suspension.unsuspend(listing.suspension, SUBJECT);
  return {
    entity: touched({ ...listing, suspension }, now),
    eventDrafts: [ListingEvents.unsuspended(listing.id, listing.placeId, now)],
  };
}

/**
 * Removes photos on a takedown claim (MOD-02). A published listing left
 * without photos becomes `unpublished` (`photoTakedown`), suspended or not.
 * Throws `LISTING_PHOTO_NOT_FOUND` (removing none) when an id is not the
 * listing's.
 */
function takeDownPhotos(
  listing: Listing,
  photoIds: readonly [PhotoId, ...PhotoId[]],
  now: Date,
): Result {
  const photos = PhotoSet.takeDown(listing.content.photos, photoIds, SUBJECT);
  const content: ListingContent = { ...listing.content, photos };
  const owner = { kind: "listing", id: listing.id } as const;
  const becomesUnpublished = isPublished(listing) && PhotoSet.isEmpty(photos);
  const entity: Listing = becomesUnpublished
    ? unpublishedFrom(listing, "photoTakedown", content, now)
    : touched(withContent(listing, content), now);
  return {
    entity,
    eventDrafts: [
      PhotosTakenDownEvent.draft(
        { owner, photoIds, unpublished: becomesUnpublished },
        now,
      ),
      ...(becomesUnpublished
        ? [ListingEvents.unpublished(listing.id, "photoTakedown", now)]
        : []),
      PhotosReleasedEvent.draft(owner, photoIds, now),
    ],
  };
}

/** The deletion event and the release of every photo (B-27: not restorable). */
function deleteListing(
  listing: Listing,
  now: Date,
): readonly EventDraft<ListingDeletedEvent | PhotosReleasedEvent>[] {
  return [
    ListingEvents.deleted(listing.id, now),
    ...PhotosReleasedEvent.draftsFor(
      { kind: "listing", id: listing.id },
      PhotoSet.photoIds(listing.content.photos),
      now,
    ),
  ];
}

const offeringStatus = (listing: Listing, today: LocalDate): OfferingStatus =>
  OfferingStatus.of(listing.content.offering, manualEndOf(listing), today);

function publicationShelf(listing: Listing): PublicationShelf {
  if (listing.suspension.suspended) return "hidden";
  switch (listing.publication.status) {
    case "published":
      return "published";
    case "draft":
      return "draft";
    case "unpublished":
      return "hidden";
  }
}

const inShelf = (
  listing: Listing,
  shelf: ListingShelf,
  today: LocalDate,
): boolean =>
  (shelf.publication === null ||
    shelf.publication === publicationShelf(listing)) &&
  (shelf.phase === null ||
    shelf.phase === offeringStatus(listing, today).phase);

const isAttachable = (listing: Listing, placeId: PlaceId): boolean =>
  listing.placeId === placeId &&
  listing.publication.status === "published" &&
  !listing.suspension.suspended;

/**
 * The listings that can be attached to a place's participation, in
 * `listings`' order: the place's published listings not suspended, in any
 * offering phase (I-22). The one definition of "attachable".
 */
const attachableIds = (
  listings: readonly Listing[],
  placeId: PlaceId,
  _today: LocalDate,
): readonly ListingId[] =>
  listings
    .filter((listing) => isAttachable(listing, placeId))
    .map((listing) => listing.id);

const same = <T extends string>(parsed: T, raw: string, label: string): T => {
  if (parsed !== raw) throw new Error(`Unnormalised ${label}: ${raw}`);
  return parsed;
};

function offeringFrom(snapshot: OfferingSnapshot): Offering {
  switch (snapshot.kind) {
    case "none":
      return Offering.none();
    case "period": {
      const period: OfferingPeriod = OfferingPeriodValue.create({
        start: snapshot.start === null ? null : LocalDate.parse(snapshot.start),
        end: snapshot.end === null ? null : LocalDate.parse(snapshot.end),
      });
      return { kind: "period", period };
    }
    case "dates": {
      const dates = OpenDates.create(snapshot.dates.map(LocalDate.parse));
      if (!dates.every((date, i) => date === snapshot.dates[i])) {
        throw new Error("Open dates are not sorted and unique");
      }
      if (dates.length !== snapshot.dates.length) {
        throw new Error("Open dates repeat");
      }
      return { kind: "dates", dates };
    }
    default:
      throw new Error("Unknown offering kind");
  }
}

function contentFrom(snapshot: ListingContentSnapshot): ListingContent {
  return {
    name:
      snapshot.name === null
        ? null
        : same(ListingName.create(snapshot.name), snapshot.name, "name"),
    description:
      snapshot.description === null
        ? null
        : same(
            ListingDescription.create(snapshot.description),
            snapshot.description,
            "description",
          ),
    categoryId:
      snapshot.categoryId === null
        ? null
        : CategoryId.create(snapshot.categoryId),
    photos: PhotoSet.reconstruct(
      snapshot.photos.map(
        (photo): ListingPhoto => ({
          photoId: PhotoId.create(photo.photoId),
          framing:
            photo.framing === null ? null : Framing.create(photo.framing),
        }),
      ),
      snapshot.photosTakenDown,
      SUBJECT,
    ),
    offering: offeringFrom(snapshot.offering),
  };
}

const UNPUBLISH_REASONS: readonly string[] = ["byManager", "photoTakedown"];

function reconstruct(snapshot: ListingSnapshot): Listing {
  try {
    const base = {
      id: ListingId.create(snapshot.id),
      placeId: PlaceId.create(snapshot.placeId),
      suspension: { suspended: snapshot.suspended },
      version: Version.create(snapshot.version),
      updatedAt: snapshot.updatedAt,
    };
    const content = contentFrom(snapshot.content);
    const { status, firstPublishedAt, reason } = snapshot.publication;
    if (status === "draft") {
      if (firstPublishedAt !== null || reason !== null) {
        throw new Error("A draft has no publication date or reason");
      }
      if (snapshot.manualEnded !== null) {
        throw new Error("A draft has no manual end");
      }
      return { ...base, publication: Publication.draft(), content };
    }
    if (firstPublishedAt === null || snapshot.manualEnded === null) {
      throw new Error(
        `A ${status} listing needs its publication date and manual end`,
      );
    }
    const manualEnd = { ended: snapshot.manualEnded };
    if (status === "published") {
      if (reason !== null) throw new Error("A published listing has no reason");
      return {
        ...base,
        publication: { status, firstPublishedAt },
        content: ListingContent.toPublishable(content),
        manualEnd,
      };
    }
    if (
      status === "unpublished" &&
      reason !== null &&
      UNPUBLISH_REASONS.includes(reason)
    ) {
      return {
        ...base,
        publication: {
          status,
          firstPublishedAt,
          reason: reason as UnpublishReason,
        },
        content,
        manualEnd,
      };
    }
    throw new Error(`Unknown publication ${status} / ${reason}`);
  } catch (error) {
    throw new RehydrationError("Stored listing violates invariants", error);
  }
}

function offeringSnapshot(offering: Offering): OfferingSnapshot {
  switch (offering.kind) {
    case "none":
      return { kind: "none" };
    case "period":
      return {
        kind: "period",
        start: offering.period.start,
        end: offering.period.end,
      };
    case "dates":
      return { kind: "dates", dates: [...offering.dates] };
  }
}

function snapshot(listing: Listing): ListingSnapshot {
  const { publication } = listing;
  return {
    id: listing.id,
    placeId: listing.placeId,
    publication: {
      status: publication.status,
      firstPublishedAt:
        publication.status === "draft" ? null : publication.firstPublishedAt,
      reason: publication.status === "unpublished" ? publication.reason : null,
    },
    suspended: listing.suspension.suspended,
    manualEnded:
      publication.status === "draft" ? null : manualEndOf(listing).ended,
    content: {
      name: listing.content.name,
      description: listing.content.description,
      categoryId: listing.content.categoryId,
      photos: listing.content.photos.items.map((photo) => ({
        photoId: photo.photoId,
        framing: photo.framing === null ? null : { ...photo.framing },
      })),
      photosTakenDown: listing.content.photos.takenDown,
      offering: offeringSnapshot(listing.content.offering),
    },
    updatedAt: listing.updatedAt,
    version: listing.version,
  };
}

export const Listing = {
  createDraft,
  createPublished,
  duplicate,
  isDuplicateOf,
  update,
  applyPatch,
  publish,
  unpublish,
  endOffering,
  resumeOffering,
  suspend,
  unsuspend,
  takeDownPhotos,
  delete: deleteListing,
  offeringStatus,
  manualEndOf,
  publicationShelf,
  inShelf,
  attachableIds,
  isPublished,
  reconstruct,
  snapshot,
};
