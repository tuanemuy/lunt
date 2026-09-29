import { Address } from "@repo/core/domain/common/address";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import type { WithEventDrafts } from "@repo/core/domain/common/event";
import { GeoPoint } from "@repo/core/domain/common/geo";
import { PhotoId, RegionId } from "@repo/core/domain/common/ids";
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
import { RehydrationError } from "@repo/core/domain/error";
import {
  type PublishableRegionContent,
  RegionContent,
  type RegionPhoto,
  type RegionRequirement,
} from "./content";
import {
  RegionEvents,
  type RegionSuspendedEvent,
  type RegionUnpublishedEvent,
  type RegionUnsuspendedEvent,
} from "./events";
import { RegionDescription, RegionName } from "./values";

type RegionBase = Readonly<{
  id: RegionId;
  suspension: Suspension;
  version: Version;
  /** When the content or a state last changed. */
  updatedAt: Date;
}>;

export type DraftRegion = RegionBase &
  Readonly<{ publication: DraftPublication; content: RegionContent }>;

export type PublishedRegion = RegionBase &
  Readonly<{
    publication: PublishedPublication;
    content: PublishableRegionContent;
  }>;

export type UnpublishedRegion = RegionBase &
  Readonly<{ publication: UnpublishedPublication; content: RegionContent }>;

/**
 * A region (地域): a group of places introduced together, independent of
 * the area master, with no hierarchy and one location point. One variant
 * per publication state, so a published region lacking a publish
 * requirement cannot be represented. Regions are never deleted.
 */
export type Region = DraftRegion | PublishedRegion | UnpublishedRegion;

export type RegionRef = Readonly<{ kind: "region"; id: RegionId }>;

/** The at-rest form of a region, in primitives. */
export type RegionSnapshot = Readonly<{
  id: string;
  publication: Readonly<{
    status: string;
    firstPublishedAt: Date | null;
    reason: string | null;
  }>;
  suspended: boolean;
  content: Readonly<{
    name: string | null;
    address: Readonly<{
      areaCode: string;
      prefecture: string;
      municipality: string;
      town: string;
      rest: string;
    }> | null;
    location: Readonly<{ latitude: number; longitude: number }> | null;
    photoIds: readonly string[];
    photosTakenDown: boolean;
    description: string | null;
    tagline: string | null;
  }>;
  updatedAt: Date;
  version: number;
}>;

const SUBJECT = "REGION";

const exposure = (region: Region) => ({
  publication: region.publication,
  suspension: region.suspension,
});

const isDraft = (region: Region): region is DraftRegion =>
  region.publication.status === "draft";

const isPublished = (region: Region): region is PublishedRegion =>
  region.publication.status === "published";

const touched = <R extends Region>(region: R, now: Date): R => ({
  ...region,
  version: Version.next(region.version),
  updatedAt: now,
});

const refOf = (region: Pick<Region, "id">): RegionRef => ({
  kind: "region",
  id: region.id,
});

/** `content` in place of the region's, keeping its state. */
function withContent(region: Region, content: RegionContent): Region {
  if (isDraft(region)) return { ...region, content };
  if (isPublished(region)) {
    return { ...region, content: RegionContent.toPublishable(content) };
  }
  return { ...region, content };
}

/** A draft, not suspended. The publish requirements are not checked. */
function register(
  params: Readonly<{ id: RegionId; content: RegionContent }>,
  now: Date,
): WithEventDrafts<DraftRegion, never> {
  return {
    entity: {
      id: params.id,
      publication: Publication.draft(),
      content: params.content,
      suspension: Suspension.none,
      version: Version.initial(),
      updatedAt: now,
    },
    eventDrafts: [],
  };
}

/**
 * Replaces the content in any state, suspended or not. A published region
 * must stay publishable (`REGION_PUBLISH_CONDITION_UNMET` with the missing
 * requirements). The photo order goes through `PhotoSet.replace` (the
 * takedown marker survives an unchanged order); photos dropped are
 * released. Content equal to the current one after that returns the region
 * unchanged.
 */
function updateContent(
  region: Region,
  content: RegionContent,
  now: Date,
): WithEventDrafts<Region, PhotosReleasedEvent> {
  const photos = PhotoSet.replace(region.content.photos, content.photos.items);
  const replaced: RegionContent = { ...content, photos };
  if (RegionContent.equals(region.content, replaced)) {
    return { entity: region, eventDrafts: [] };
  }
  const entity = touched(withContent(region, replaced), now);
  return {
    entity,
    eventDrafts: PhotosReleasedEvent.draftsFor(
      refOf(region),
      PhotoSet.removedPhotoIds(region.content.photos, photos),
      now,
    ),
  };
}

/**
 * Publishes a draft or re-publishes an unpublished region. The order of
 * checks (`REGION_SUSPENDED`, `COMMON_PUBLICATION_INVALID_TRANSITION`,
 * `REGION_PUBLISH_CONDITION_UNMET`) is `Publication.publish`'s.
 */
function publish(
  region: Region,
  now: Date,
): WithEventDrafts<PublishedRegion, never> {
  const publication = Publication.publish(
    exposure(region),
    RegionContent.missingRequirements(region.content),
    now,
    SUBJECT,
  );
  return {
    entity: {
      id: region.id,
      suspension: region.suspension,
      publication,
      content: RegionContent.toPublishable(region.content),
      version: Version.next(region.version),
      updatedAt: now,
    },
    eventDrafts: [],
  };
}

function unpublishedFrom(
  region: Region,
  reason: UnpublishReason,
  content: RegionContent,
  now: Date,
): UnpublishedRegion {
  return {
    id: region.id,
    suspension: region.suspension,
    publication: Publication.unpublish(exposure(region), reason, SUBJECT),
    content,
    version: Version.next(region.version),
    updatedAt: now,
  };
}

/**
 * Unpublishes by the manager (`byManager`): `REGION_SUSPENDED` while
 * suspended, `COMMON_PUBLICATION_INVALID_TRANSITION` unless published.
 */
function unpublish(
  region: Region,
  now: Date,
): WithEventDrafts<UnpublishedRegion, RegionUnpublishedEvent> {
  return {
    entity: unpublishedFrom(region, "byManager", region.content, now),
    eventDrafts: [RegionEvents.unpublished(region.id, "byManager", now)],
  };
}

/** Suspends; the publication state is kept. `REGION_ALREADY_SUSPENDED` when already suspended. */
function suspend(
  region: Region,
  now: Date,
): WithEventDrafts<Region, RegionSuspendedEvent> {
  const suspension = Suspension.suspend(region.suspension, SUBJECT);
  return {
    entity: touched({ ...region, suspension }, now),
    eventDrafts: [RegionEvents.suspended(region.id, now)],
  };
}

/** Lifts a suspension; the publication state is kept. `REGION_NOT_SUSPENDED` when not suspended. */
function unsuspend(
  region: Region,
  now: Date,
): WithEventDrafts<Region, RegionUnsuspendedEvent> {
  const suspension = Suspension.unsuspend(region.suspension, SUBJECT);
  return {
    entity: touched({ ...region, suspension }, now),
    eventDrafts: [RegionEvents.unsuspended(region.id, now)],
  };
}

/**
 * Removes photos on a takedown claim (`spec/domains/index.md`
 * 「申立てに基づく写真の削除」). A published region left without photos
 * becomes `unpublished` (`photoTakedown`), suspended or not. Throws
 * `REGION_PHOTO_NOT_FOUND` (removing none) when an id is not the region's.
 */
function takeDownPhotos(
  region: Region,
  photoIds: readonly [PhotoId, ...PhotoId[]],
  now: Date,
): WithEventDrafts<
  Region,
  PhotosTakenDownEvent | RegionUnpublishedEvent | PhotosReleasedEvent
> {
  const photos = PhotoSet.takeDown(region.content.photos, photoIds, SUBJECT);
  const content: RegionContent = { ...region.content, photos };
  const owner = refOf(region);
  const becomesUnpublished = isPublished(region) && PhotoSet.isEmpty(photos);
  const entity: Region = becomesUnpublished
    ? unpublishedFrom(region, "photoTakedown", content, now)
    : touched(withContent(region, content), now);
  return {
    entity,
    eventDrafts: [
      PhotosTakenDownEvent.draft(
        { owner, photoIds, unpublished: becomesUnpublished },
        now,
      ),
      ...(becomesUnpublished
        ? [RegionEvents.unpublished(region.id, "photoTakedown", now)]
        : []),
      PhotosReleasedEvent.draft(owner, photoIds, now),
    ],
  };
}

const missingRequirements = (
  content: RegionContent,
): readonly RegionRequirement[] => RegionContent.missingRequirements(content);

/** The fields a region's searchable text is made of. */
export type RegionSearchFields = Readonly<{
  name: string | null;
  tagline: string | null;
  description: string | null;
  address: Address | null;
}>;

/**
 * The text a keyword is matched against: the name (empty when unnamed)
 * as `primary`; the catch-copy, introduction and address text
 * (`Address.text`), when present, as `secondary`. The store's search
 * applies it to stored rows without rebuilding the region.
 */
function searchableTextOf(fields: RegionSearchFields): SearchableText {
  const secondary: string[] = [];
  if (fields.tagline !== null) secondary.push(fields.tagline);
  if (fields.description !== null) secondary.push(fields.description);
  if (fields.address !== null) secondary.push(Address.text(fields.address));
  return { primary: fields.name ?? "", secondary };
}

/** `searchableTextOf` the region's content. */
const searchableText = (region: Region): SearchableText =>
  searchableTextOf(region.content);

function storedText<T extends string>(
  value: string | null,
  create: (input: string) => T,
): T | null {
  if (value === null) return null;
  const built = create(value);
  if (built !== value) throw new Error(`Text is not normalised: ${value}`);
  return built;
}

function storedDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) throw new Error("Invalid stored date");
  return value;
}

function contentFrom(snapshot: RegionSnapshot["content"]): RegionContent {
  const { address, location } = snapshot;
  if (address !== null && address.rest !== address.rest.trim()) {
    throw new Error("Address rest is not trimmed");
  }
  return {
    name: storedText(snapshot.name, RegionName.create),
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
    photos: PhotoSet.reconstruct(
      snapshot.photoIds.map(
        (id): RegionPhoto => ({ photoId: PhotoId.create(id) }),
      ),
      snapshot.photosTakenDown,
      SUBJECT,
    ),
    description: storedText(snapshot.description, RegionDescription.create),
    tagline: storedText(snapshot.tagline, Tagline.create),
  };
}

const isUnpublishReason = (value: string): value is UnpublishReason =>
  value === "byManager" || value === "photoTakedown";

/** Rebuilds a stored region through its value objects; `RehydrationError` on any violation. */
function reconstruct(snapshot: RegionSnapshot): Region {
  try {
    const base = {
      id: RegionId.create(snapshot.id),
      suspension: { suspended: snapshot.suspended },
      version: Version.create(snapshot.version),
      updatedAt: storedDate(snapshot.updatedAt),
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
      throw new Error(`A ${status} region needs its first publication date`);
    }
    storedDate(firstPublishedAt);
    if (status === "published" && reason === null) {
      return {
        ...base,
        publication: { status, firstPublishedAt },
        content: RegionContent.toPublishable(content),
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
    throw new RehydrationError("Stored region violates invariants", error);
  }
}

function snapshot(region: Region): RegionSnapshot {
  const { publication, content } = region;
  return {
    id: region.id,
    publication: {
      status: publication.status,
      firstPublishedAt:
        publication.status === "draft" ? null : publication.firstPublishedAt,
      reason: publication.status === "unpublished" ? publication.reason : null,
    },
    suspended: region.suspension.suspended,
    content: {
      name: content.name,
      address:
        content.address === null
          ? null
          : {
              areaCode: content.address.areaCode,
              prefecture: content.address.prefecture,
              municipality: content.address.municipality,
              town: content.address.town,
              rest: content.address.rest,
            },
      location:
        content.location === null
          ? null
          : {
              latitude: content.location.latitude,
              longitude: content.location.longitude,
            },
      photoIds: PhotoSet.photoIds(content.photos),
      photosTakenDown: content.photos.takenDown,
      description: content.description,
      tagline: content.tagline,
    },
    updatedAt: region.updatedAt,
    version: region.version,
  };
}

export const Region = {
  register,
  updateContent,
  publish,
  unpublish,
  suspend,
  unsuspend,
  takeDownPhotos,
  missingRequirements,
  searchableText,
  searchableTextOf,
  isPublished,
  reconstruct,
  snapshot,
  ref: refOf,
};
