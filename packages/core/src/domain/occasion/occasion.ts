import { Address } from "@repo/core/domain/common/address";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import { DateRange } from "@repo/core/domain/common/dateRange";
import type { WithEventDrafts } from "@repo/core/domain/common/event";
import { GeoPoint } from "@repo/core/domain/common/geo";
import { OccasionId, PhotoId } from "@repo/core/domain/common/ids";
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
import type { SearchableText } from "@repo/core/domain/common/searchKeyword";
import { Suspension } from "@repo/core/domain/common/suspension";
import { Tagline } from "@repo/core/domain/common/tagline";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import {
  OccasionContent,
  type OccasionPhoto,
  type OccasionRequirement,
  type PublishableOccasionContent,
} from "./content";
import { OccasionErrorCode } from "./errorCode";
import {
  type OccasionCancelledEvent,
  OccasionEvents,
  type OccasionPeriodChangedEvent,
  type OccasionSuspendedEvent,
  type OccasionUnpublishedEvent,
  type OccasionUnsuspendedEvent,
} from "./events";
import { Cancellation, HoldingStatus } from "./holdingStatus";
import { OccasionDescription, OccasionName } from "./values";

type OccasionBase = Readonly<{
  id: OccasionId;
  suspension: Suspension;
  cancellation: Cancellation;
  version: Version;
  /** When the content or a state last changed. */
  updatedAt: Date;
}>;

export type DraftOccasion = OccasionBase &
  Readonly<{ publication: DraftPublication; content: OccasionContent }>;

export type PublishedOccasion = OccasionBase &
  Readonly<{
    publication: PublishedPublication;
    content: PublishableOccasionContent;
  }>;

export type UnpublishedOccasion = OccasionBase &
  Readonly<{ publication: UnpublishedPublication; content: OccasionContent }>;

/**
 * An occasion (イベント). One variant per publication state, so a published
 * occasion lacking a publish requirement cannot be represented. The
 * cancellation and the operator suspension are independent of the
 * publication state and of each other.
 */
export type Occasion = DraftOccasion | PublishedOccasion | UnpublishedOccasion;

/** `Address` in primitives. */
export type AddressSnapshot = Readonly<{
  areaCode: string;
  prefecture: string;
  municipality: string;
  town: string;
  rest: string;
}>;

export type OccasionContentSnapshot = Readonly<{
  name: string | null;
  /** Days as `YYYY-MM-DD`. */
  period: Readonly<{ start: string; end: string }> | null;
  venue: Readonly<{
    address: AddressSnapshot | null;
    location: Readonly<{ latitude: number; longitude: number }> | null;
  }>;
  /** Display order; the first is the cover. */
  photoIds: readonly string[];
  photosTakenDown: boolean;
  description: string | null;
  tagline: string | null;
}>;

/** The at-rest form of an occasion, in primitives. */
export type OccasionSnapshot = Readonly<{
  id: string;
  publication: Readonly<{
    status: string;
    firstPublishedAt: Date | null;
    reason: string | null;
  }>;
  suspended: boolean;
  cancelled: boolean;
  content: OccasionContentSnapshot;
  updatedAt: Date;
  version: number;
}>;

const SUBJECT = "OCCASION";

const exposure = (occasion: Occasion) => ({
  publication: occasion.publication,
  suspension: occasion.suspension,
});

const isPublished = (occasion: Occasion): occasion is PublishedOccasion =>
  occasion.publication.status === "published";

const touched = <O extends Occasion>(occasion: O, now: Date): O => ({
  ...occasion,
  version: Version.next(occasion.version),
  updatedAt: now,
});

/**
 * `content` in place of the occasion's, keeping its state. A published
 * occasion's content must meet the publish requirements.
 */
function withContent(occasion: Occasion, content: OccasionContent): Occasion {
  switch (occasion.publication.status) {
    case "draft":
      return { ...occasion, publication: occasion.publication, content };
    case "published":
      return {
        ...occasion,
        publication: occasion.publication,
        content: OccasionContent.toPublishable(content),
      };
    case "unpublished":
      return { ...occasion, publication: occasion.publication, content };
  }
}

/**
 * A draft, not suspended and not cancelled. The publish requirements are
 * not checked.
 */
function register(
  params: Readonly<{ id: OccasionId; content: OccasionContent }>,
  now: Date,
): WithEventDrafts<DraftOccasion, never> {
  return {
    entity: {
      id: params.id,
      publication: Publication.draft(),
      content: params.content,
      suspension: Suspension.none,
      cancellation: Cancellation.none,
      version: Version.initial(),
      updatedAt: now,
    },
    eventDrafts: [],
  };
}

/**
 * Replaces the content (`OccasionContent`; the photos through
 * `PhotoSet.replace`, which keeps `takenDown` while the photo order is
 * unchanged). A published occasion must keep meeting the publish
 * requirements (`OCCASION_PUBLISH_CONDITION_UNMET`). A new period emits
 * `occasion.period_changed`; photos no longer present are released. The
 * publication, suspension and cancellation are kept. Content equal to the
 * current one after the replacement returns the occasion as it is.
 */
function updateContent(
  occasion: Occasion,
  content: OccasionContent,
  now: Date,
): WithEventDrafts<Occasion, OccasionPeriodChangedEvent | PhotosReleasedEvent> {
  const photos = PhotoSet.replace(
    occasion.content.photos,
    content.photos.items,
  );
  const replaced: OccasionContent = { ...content, photos };
  if (OccasionContent.equals(occasion.content, replaced)) {
    return { entity: occasion, eventDrafts: [] };
  }
  const entity = touched(withContent(occasion, replaced), now);
  return {
    entity,
    eventDrafts: [
      ...(OccasionContent.periodEquals(occasion.content.period, content.period)
        ? []
        : [OccasionEvents.periodChanged(occasion.id, now)]),
      ...PhotosReleasedEvent.draftsFor(
        { kind: "occasion", id: occasion.id },
        PhotoSet.removedPhotoIds(occasion.content.photos, photos),
        now,
      ),
    ],
  };
}

/**
 * Publishes a draft or re-publishes an unpublished occasion, whatever its
 * holding status. Check order (suspended, invalid transition, unmet
 * requirement) is `Publication.publish`'s.
 */
function publish(
  occasion: Occasion,
  now: Date,
): WithEventDrafts<PublishedOccasion, never> {
  const publication = Publication.publish(
    exposure(occasion),
    OccasionContent.missingRequirements(occasion.content),
    now,
    SUBJECT,
  );
  return {
    entity: {
      id: occasion.id,
      suspension: occasion.suspension,
      cancellation: occasion.cancellation,
      publication,
      content: OccasionContent.toPublishable(occasion.content),
      version: Version.next(occasion.version),
      updatedAt: now,
    },
    eventDrafts: [],
  };
}

function unpublishedFrom(
  occasion: Occasion,
  reason: UnpublishReason,
  content: OccasionContent,
  now: Date,
): UnpublishedOccasion {
  return {
    id: occasion.id,
    suspension: occasion.suspension,
    cancellation: occasion.cancellation,
    publication: Publication.unpublish(exposure(occasion), reason, SUBJECT),
    content,
    version: Version.next(occasion.version),
    updatedAt: now,
  };
}

/** Unpublishes by the manager (`byManager`); refused while suspended. */
function unpublish(
  occasion: Occasion,
  now: Date,
): WithEventDrafts<UnpublishedOccasion, OccasionUnpublishedEvent> {
  return {
    entity: unpublishedFrom(occasion, "byManager", occasion.content, now),
    eventDrafts: [OccasionEvents.unpublished(occasion.id, "byManager", now)],
  };
}

/**
 * Calls the occasion off, whatever its period, publication or
 * suspension. `OCCASION_ALREADY_CANCELLED` when it already is.
 */
function cancel(
  occasion: Occasion,
  now: Date,
): WithEventDrafts<Occasion, OccasionCancelledEvent> {
  if (occasion.cancellation.cancelled) {
    throw new BusinessRuleError(
      OccasionErrorCode.AlreadyCancelled,
      "The occasion is already cancelled",
    );
  }
  return {
    entity: touched({ ...occasion, cancellation: Cancellation.cancelled }, now),
    eventDrafts: [OccasionEvents.cancelled(occasion.id, now)],
  };
}

/**
 * Revokes the cancellation, also past the period; the holding status
 * follows the period and the date again. `OCCASION_NOT_CANCELLED` when it
 * is not cancelled.
 */
function revokeCancellation(
  occasion: Occasion,
  now: Date,
): WithEventDrafts<Occasion, never> {
  if (!occasion.cancellation.cancelled) {
    throw new BusinessRuleError(
      OccasionErrorCode.NotCancelled,
      "The occasion is not cancelled",
    );
  }
  return {
    entity: touched({ ...occasion, cancellation: Cancellation.none }, now),
    eventDrafts: [],
  };
}

function suspend(
  occasion: Occasion,
  now: Date,
): WithEventDrafts<Occasion, OccasionSuspendedEvent> {
  const suspension = Suspension.suspend(occasion.suspension, SUBJECT);
  return {
    entity: touched({ ...occasion, suspension }, now),
    eventDrafts: [OccasionEvents.suspended(occasion.id, now)],
  };
}

function unsuspend(
  occasion: Occasion,
  now: Date,
): WithEventDrafts<Occasion, OccasionUnsuspendedEvent> {
  const suspension = Suspension.unsuspend(occasion.suspension, SUBJECT);
  return {
    entity: touched({ ...occasion, suspension }, now),
    eventDrafts: [OccasionEvents.unsuspended(occasion.id, now)],
  };
}

/**
 * Removes photos on a takedown claim (MOD-02). A published occasion left
 * without photos becomes `unpublished` (`photoTakedown`), suspended or
 * not. Throws `OCCASION_PHOTO_NOT_FOUND` (removing none) when an id is not
 * the occasion's.
 */
function takeDownPhotos(
  occasion: Occasion,
  photoIds: readonly [PhotoId, ...PhotoId[]],
  now: Date,
): WithEventDrafts<
  Occasion,
  PhotosTakenDownEvent | OccasionUnpublishedEvent | PhotosReleasedEvent
> {
  const photos = PhotoSet.takeDown(occasion.content.photos, photoIds, SUBJECT);
  const content: OccasionContent = { ...occasion.content, photos };
  const owner = { kind: "occasion", id: occasion.id } as const;
  const becomesUnpublished = isPublished(occasion) && PhotoSet.isEmpty(photos);
  const entity: Occasion = becomesUnpublished
    ? unpublishedFrom(occasion, "photoTakedown", content, now)
    : touched(withContent(occasion, content), now);
  return {
    entity,
    eventDrafts: [
      PhotosTakenDownEvent.draft(
        { owner, photoIds, unpublished: becomesUnpublished },
        now,
      ),
      ...(becomesUnpublished
        ? [OccasionEvents.unpublished(occasion.id, "photoTakedown", now)]
        : []),
      PhotosReleasedEvent.draft(owner, photoIds, now),
    ],
  };
}

/** `HoldingStatus.of(occasion.content.period, occasion.cancellation, today)`. */
const holdingStatus = (
  occasion: Occasion,
  today: LocalDate,
): HoldingStatus | null =>
  HoldingStatus.of(occasion.content.period, occasion.cancellation, today);

const missingRequirements = (
  content: OccasionContent,
): readonly OccasionRequirement[] =>
  OccasionContent.missingRequirements(content);

/**
 * What one keyword is matched against (`OccasionRepository.searchForOperation`,
 * Discovery's keyword search and selection candidates): the name as
 * `primary` (empty when unnamed); the tagline, description and venue
 * address text as `secondary`, absent ones omitted.
 */
function searchableText(occasion: Occasion): SearchableText {
  const { name, tagline, description, venue } = occasion.content;
  return {
    primary: name ?? "",
    secondary: [
      ...(tagline === null ? [] : [tagline]),
      ...(description === null ? [] : [description]),
      ...(venue.address === null ? [] : [Address.text(venue.address)]),
    ],
  };
}

const same = <T extends string>(parsed: T, raw: string, label: string): T => {
  if (parsed !== raw) throw new Error(`Unnormalised ${label}: ${raw}`);
  return parsed;
};

function contentFrom(snapshot: OccasionContentSnapshot): OccasionContent {
  const { address, location } = snapshot.venue;
  return {
    name:
      snapshot.name === null
        ? null
        : same(OccasionName.create(snapshot.name), snapshot.name, "name"),
    period:
      snapshot.period === null
        ? null
        : DateRange.create(
            LocalDate.parse(snapshot.period.start),
            LocalDate.parse(snapshot.period.end),
          ),
    venue: {
      address:
        address === null
          ? null
          : Address.of(
              {
                areaCode: AreaCode.create(address.areaCode),
                prefecture: address.prefecture,
                municipality: address.municipality,
                town: address.town,
              },
              address.rest,
            ),
      location:
        location === null
          ? null
          : GeoPoint.create(location.latitude, location.longitude),
    },
    photos: PhotoSet.reconstruct(
      snapshot.photoIds.map(
        (id): OccasionPhoto => ({ photoId: PhotoId.create(id) }),
      ),
      snapshot.photosTakenDown,
      SUBJECT,
    ),
    description:
      snapshot.description === null
        ? null
        : same(
            OccasionDescription.create(snapshot.description),
            snapshot.description,
            "description",
          ),
    tagline:
      snapshot.tagline === null
        ? null
        : same(Tagline.create(snapshot.tagline), snapshot.tagline, "tagline"),
  };
}

const UNPUBLISH_REASONS: readonly UnpublishReason[] = [
  "byManager",
  "photoTakedown",
];

const isUnpublishReason = (value: string): value is UnpublishReason =>
  UNPUBLISH_REASONS.some((reason) => reason === value);

/** Rebuilds a stored occasion; any broken invariant is a `RehydrationError`. */
function reconstruct(snapshot: OccasionSnapshot): Occasion {
  try {
    const base: OccasionBase = {
      id: OccasionId.create(snapshot.id),
      suspension: { suspended: snapshot.suspended },
      cancellation: { cancelled: snapshot.cancelled },
      version: Version.create(snapshot.version),
      updatedAt: snapshot.updatedAt,
    };
    const content = contentFrom(snapshot.content);
    const { status, firstPublishedAt, reason } = snapshot.publication;
    if (status === "draft") {
      if (firstPublishedAt !== null || reason !== null) {
        throw new Error("A draft has no publication date or reason");
      }
      return { ...base, publication: Publication.draft(), content };
    }
    if (firstPublishedAt === null) {
      throw new Error(`A ${status} occasion needs its publication date`);
    }
    if (status === "published") {
      if (reason !== null) {
        throw new Error("A published occasion has no reason");
      }
      return {
        ...base,
        publication: { status, firstPublishedAt },
        content: OccasionContent.toPublishable(content),
      };
    }
    if (
      status === "unpublished" &&
      reason !== null &&
      isUnpublishReason(reason)
    ) {
      return {
        ...base,
        publication: { status, firstPublishedAt, reason },
        content,
      };
    }
    throw new Error(`Unknown publication ${status} / ${reason}`);
  } catch (error) {
    throw new RehydrationError("Stored occasion violates invariants", error);
  }
}

function snapshot(occasion: Occasion): OccasionSnapshot {
  const { publication, content } = occasion;
  const { address, location } = content.venue;
  return {
    id: occasion.id,
    publication: {
      status: publication.status,
      firstPublishedAt:
        publication.status === "draft" ? null : publication.firstPublishedAt,
      reason: publication.status === "unpublished" ? publication.reason : null,
    },
    suspended: occasion.suspension.suspended,
    cancelled: occasion.cancellation.cancelled,
    content: {
      name: content.name,
      period:
        content.period === null
          ? null
          : { start: content.period.start, end: content.period.end },
      venue: {
        address:
          address === null
            ? null
            : {
                areaCode: address.areaCode,
                prefecture: address.prefecture,
                municipality: address.municipality,
                town: address.town,
                rest: address.rest,
              },
        location:
          location === null
            ? null
            : { latitude: location.latitude, longitude: location.longitude },
      },
      photoIds: PhotoSet.photoIds(content.photos),
      photosTakenDown: content.photos.takenDown,
      description: content.description,
      tagline: content.tagline,
    },
    updatedAt: occasion.updatedAt,
    version: occasion.version,
  };
}

export const Occasion = {
  register,
  updateContent,
  publish,
  unpublish,
  cancel,
  revokeCancellation,
  suspend,
  unsuspend,
  takeDownPhotos,
  holdingStatus,
  missingRequirements,
  searchableText,
  isPublished,
  reconstruct,
  snapshot,
};
