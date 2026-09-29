import { Address } from "@repo/core/domain/common/address";
import { GeoPoint } from "@repo/core/domain/common/geo";
import type { PhotoId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { PublishConditionUnmetError } from "@repo/core/domain/common/publication";
import { Tagline } from "@repo/core/domain/common/tagline";
import { RegionDescription, RegionName } from "./values";

export type RegionPhoto = Readonly<{ photoId: PhotoId }>;

/**
 * Name, address, location (one point, no shape), photos, introduction and
 * catch-copy. Any field may be empty (`null` / no photos) until the region
 * is published.
 */
export type RegionContent = Readonly<{
  name: RegionName | null;
  address: Address | null;
  location: GeoPoint | null;
  photos: PhotoSet<RegionPhoto>;
  description: RegionDescription | null;
  tagline: Tagline | null;
}>;

/** Content meeting the publish requirements: name, address, location and a photo. */
export type PublishableRegionContent = RegionContent &
  Readonly<{
    name: RegionName;
    address: Address;
    location: GeoPoint;
    photos: PhotoSet<RegionPhoto> &
      Readonly<{ items: readonly [RegionPhoto, ...RegionPhoto[]] }>;
  }>;

/** A publish requirement, in the order `missingRequirements` reports them. */
export type RegionRequirement = "name" | "address" | "location" | "photos";

export type RegionContentInput = Readonly<{
  name: string | null;
  /** Resolved by the usecase through `AreaCatalog.findTown` + `Town.toAddress`. */
  address: Address | null;
  location: GeoPoint | null;
  photoIds: readonly PhotoId[];
  description: string | null;
  tagline: string | null;
}>;

const blankToNull = (input: string | null): string | null =>
  input === null || input.trim().length === 0 ? null : input;

/**
 * Builds every field through its value object: `REGION_INVALID_NAME`,
 * `REGION_INVALID_DESCRIPTION`, `COMMON_INVALID_TAGLINE`,
 * `REGION_DUPLICATE_PHOTO`. Blank text is "not entered" (`null`).
 */
function create(input: RegionContentInput): RegionContent {
  const name = blankToNull(input.name);
  const description = blankToNull(input.description);
  const tagline = blankToNull(input.tagline);
  return {
    name: name === null ? null : RegionName.create(name),
    address: input.address,
    location: input.location,
    photos: PhotoSet.of(
      input.photoIds.map((photoId): RegionPhoto => ({ photoId })),
      "REGION",
    ),
    description:
      description === null ? null : RegionDescription.create(description),
    tagline: tagline === null ? null : Tagline.create(tagline),
  };
}

function missingRequirements(
  content: RegionContent,
): readonly RegionRequirement[] {
  const missing: RegionRequirement[] = [];
  if (content.name === null) missing.push("name");
  if (content.address === null) missing.push("address");
  if (content.location === null) missing.push("location");
  if (PhotoSet.isEmpty(content.photos)) missing.push("photos");
  return missing;
}

const isPublishable = (
  content: RegionContent,
): content is PublishableRegionContent =>
  missingRequirements(content).length === 0;

/**
 * The one place the publish requirements are enforced. Throws
 * `REGION_PUBLISH_CONDITION_UNMET` carrying `missingRequirements`.
 */
function toPublishable(content: RegionContent): PublishableRegionContent {
  if (isPublishable(content)) return content;
  const [first, ...rest] = missingRequirements(content);
  throw new PublishConditionUnmetError<"REGION", RegionRequirement>("REGION", [
    first ?? "photos",
    ...rest,
  ]);
}

const nullableEquals = <T>(
  a: T | null,
  b: T | null,
  same: (x: T, y: T) => boolean,
): boolean => (a === null || b === null ? a === b : same(a, b));

/** Every field equal; photos in order and with the same `takenDown`. */
const equals = (a: RegionContent, b: RegionContent): boolean =>
  a.name === b.name &&
  nullableEquals(a.address, b.address, Address.equals) &&
  nullableEquals(a.location, b.location, GeoPoint.equals) &&
  a.description === b.description &&
  a.tagline === b.tagline &&
  a.photos.takenDown === b.photos.takenDown &&
  a.photos.items.length === b.photos.items.length &&
  a.photos.items.every(
    (photo, i) => photo.photoId === b.photos.items[i]?.photoId,
  );

export const RegionContent = {
  create,
  missingRequirements,
  isPublishable,
  toPublishable,
  equals,
};
