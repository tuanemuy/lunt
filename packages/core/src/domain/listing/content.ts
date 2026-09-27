import { CategoryId, PhotoId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { PublishConditionUnmetError } from "@repo/core/domain/common/publication";
import { Offering, OfferingPeriod, OpenDates } from "./offering";
import {
  Framing,
  type Framing as FramingValue,
  ListingDescription,
  ListingName,
  ListingPhoto,
} from "./values";

/**
 * Name, description, category, photos and offering. No price and no
 * tagline (M-16). Any field may be empty until the listing is published.
 */
export type ListingContent = Readonly<{
  name: ListingName | null;
  description: ListingDescription | null;
  categoryId: CategoryId | null;
  photos: PhotoSet<ListingPhoto>;
  offering: Offering;
}>;

/** Content meeting the publish condition: a photo, a name and a category (B-08). */
export type PublishableListingContent = ListingContent &
  Readonly<{
    name: ListingName;
    categoryId: CategoryId;
    photos: PhotoSet<ListingPhoto> &
      Readonly<{ items: readonly [ListingPhoto, ...ListingPhoto[]] }>;
  }>;

/** A publish requirement the content lacks, in this order. */
export type MissingForPublication = "photos" | "name" | "category";

/** Raw offering input from a transport, before value objects. */
export type OfferingInput =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "period"; start: string | null; end: string | null }>
  | Readonly<{ kind: "dates"; dates: readonly string[] }>;

/** Raw content input from a transport; empty strings mean "not entered". */
export type ListingContentInput = Readonly<{
  name: string | null;
  description: string | null;
  categoryId: string | null;
  photos: readonly Readonly<{
    photoId: string;
    framing: FramingValue | null;
  }>[];
  offering: OfferingInput;
}>;

const blankToNull = (input: string | null): string | null =>
  input === null || input.trim().length === 0 ? null : input;

function offeringOf(input: OfferingInput): Offering {
  switch (input.kind) {
    case "none":
      return Offering.none();
    case "period":
      return {
        kind: "period",
        period: OfferingPeriod.create({
          start: input.start === null ? null : LocalDate.parse(input.start),
          end: input.end === null ? null : LocalDate.parse(input.end),
        }),
      };
    case "dates":
      return {
        kind: "dates",
        dates: OpenDates.create(input.dates.map(LocalDate.parse)),
      };
  }
}

/**
 * Builds every field through its value object. Blank name / description
 * become `null`; the photos go through `PhotoSet.of` (`LISTING_DUPLICATE_PHOTO`).
 */
function create(input: ListingContentInput): ListingContent {
  const name = blankToNull(input.name);
  const description = blankToNull(input.description);
  const categoryId = blankToNull(input.categoryId);
  return {
    name: name === null ? null : ListingName.create(name),
    description:
      description === null ? null : ListingDescription.create(description),
    categoryId: categoryId === null ? null : CategoryId.create(categoryId),
    photos: PhotoSet.of(
      input.photos.map(
        (photo): ListingPhoto => ({
          photoId: PhotoId.create(photo.photoId),
          framing:
            photo.framing === null ? null : Framing.create(photo.framing),
        }),
      ),
      "LISTING",
    ),
    offering: offeringOf(input.offering),
  };
}

const empty = (): ListingContent => ({
  name: null,
  description: null,
  categoryId: null,
  photos: PhotoSet.of<ListingPhoto, "LISTING">([], "LISTING"),
  offering: Offering.none(),
});

function missingForPublication(
  content: ListingContent,
): readonly MissingForPublication[] {
  const missing: MissingForPublication[] = [];
  if (PhotoSet.isEmpty(content.photos)) missing.push("photos");
  if (content.name === null) missing.push("name");
  if (content.categoryId === null) missing.push("category");
  return missing;
}

const isPublishable = (
  content: ListingContent,
): content is PublishableListingContent =>
  missingForPublication(content).length === 0;

/**
 * The one place the publish condition lives (M-27). Throws
 * `LISTING_PUBLISH_CONDITION_UNMET` carrying what is missing.
 */
function toPublishable(content: ListingContent): PublishableListingContent {
  if (isPublishable(content)) return content;
  const [first, ...rest] = missingForPublication(content);
  throw new PublishConditionUnmetError<"LISTING", MissingForPublication>(
    "LISTING",
    [first ?? "photos", ...rest],
  );
}

const photosEqual = (
  a: PhotoSet<ListingPhoto>,
  b: PhotoSet<ListingPhoto>,
): boolean =>
  a.items.length === b.items.length &&
  a.items.every((photo, i) => {
    const other = b.items[i];
    return other !== undefined && ListingPhoto.equals(photo, other);
  });

/** Every field equal; photos in order with their framing, `takenDown` ignored. */
const equals = (a: ListingContent, b: ListingContent): boolean =>
  a.name === b.name &&
  a.description === b.description &&
  a.categoryId === b.categoryId &&
  photosEqual(a.photos, b.photos) &&
  Offering.equals(a.offering, b.offering);

export const ListingContent = {
  create,
  empty,
  missingForPublication,
  isPublishable,
  toPublishable,
  equals,
  photosEqual,
};
