import { DateRange } from "@repo/core/domain/common/dateRange";
import type { PhotoId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { PublishConditionUnmetError } from "@repo/core/domain/common/publication";
import { Tagline } from "@repo/core/domain/common/tagline";
import {
  type CompleteVenue,
  OccasionDescription,
  OccasionName,
  Venue,
} from "./values";

export type OccasionPhoto = Readonly<{ photoId: PhotoId }>;

/**
 * Name, holding period, venue, photos, description and tagline. Any field
 * may be empty until the occasion is published.
 */
export type OccasionContent = Readonly<{
  name: OccasionName | null;
  period: DateRange | null;
  venue: Venue;
  photos: PhotoSet<OccasionPhoto>;
  description: OccasionDescription | null;
  tagline: Tagline | null;
}>;

/** Content meeting the publish requirements: name, period, venue and a photo. */
export type PublishableOccasionContent = OccasionContent &
  Readonly<{
    name: OccasionName;
    period: DateRange;
    venue: CompleteVenue;
    photos: PhotoSet<OccasionPhoto> &
      Readonly<{ items: readonly [OccasionPhoto, ...OccasionPhoto[]] }>;
  }>;

/** A publish requirement, in this order. */
export type OccasionRequirement = "name" | "period" | "venue" | "photos";

export const OccasionRequirement = {
  all: ["name", "period", "venue", "photos"] as const,
} satisfies { all: readonly OccasionRequirement[] };

/**
 * Content as the usecase hands it over: the venue is already built (the
 * address from Area's `Town.toAddress`); blank strings mean "not entered".
 */
export type OccasionContentInput = Readonly<{
  name: string | null;
  period: Readonly<{ start: LocalDate; end: LocalDate }> | null;
  venue: Venue;
  photoIds: readonly PhotoId[];
  description: string | null;
  tagline: string | null;
}>;

const SUBJECT = "OCCASION";

const blankToNull = (input: string | null): string | null =>
  input === null || input.trim().length === 0 ? null : input;

/**
 * Builds every field through its value object: `OCCASION_INVALID_NAME`,
 * `OCCASION_INVALID_DESCRIPTION`, `COMMON_INVALID_TAGLINE`,
 * `COMMON_INVALID_DATE_RANGE` (an end before the start, even in a draft),
 * `OCCASION_DUPLICATE_PHOTO`.
 */
function create(input: OccasionContentInput): OccasionContent {
  const name = blankToNull(input.name);
  const description = blankToNull(input.description);
  const tagline = blankToNull(input.tagline);
  return {
    name: name === null ? null : OccasionName.create(name),
    period:
      input.period === null
        ? null
        : DateRange.create(input.period.start, input.period.end),
    venue: { address: input.venue.address, location: input.venue.location },
    photos: PhotoSet.of(
      input.photoIds.map((photoId): OccasionPhoto => ({ photoId })),
      SUBJECT,
    ),
    description:
      description === null ? null : OccasionDescription.create(description),
    tagline: tagline === null ? null : Tagline.create(tagline),
  };
}

/**
 * The publish requirements `content` lacks, in `OccasionRequirement`
 * order; empty when it may be published.
 */
function missingRequirements(
  content: OccasionContent,
): readonly OccasionRequirement[] {
  const missing: OccasionRequirement[] = [];
  if (content.name === null) missing.push("name");
  if (content.period === null) missing.push("period");
  if (!Venue.isComplete(content.venue)) missing.push("venue");
  if (PhotoSet.isEmpty(content.photos)) missing.push("photos");
  return missing;
}

const isPublishable = (
  content: OccasionContent,
): content is PublishableOccasionContent =>
  missingRequirements(content).length === 0;

/**
 * The one place the publish requirements live. Throws
 * `OCCASION_PUBLISH_CONDITION_UNMET` carrying what is missing.
 */
function toPublishable(content: OccasionContent): PublishableOccasionContent {
  if (isPublishable(content)) return content;
  const [first, ...rest] = missingRequirements(content);
  throw new PublishConditionUnmetError<"OCCASION", OccasionRequirement>(
    SUBJECT,
    [first ?? "name", ...rest],
  );
}

const photosEqual = (
  a: PhotoSet<OccasionPhoto>,
  b: PhotoSet<OccasionPhoto>,
): boolean =>
  a.takenDown === b.takenDown &&
  a.items.length === b.items.length &&
  a.items.every((photo, i) => photo.photoId === b.items[i]?.photoId);

const periodEquals = (a: DateRange | null, b: DateRange | null): boolean =>
  a === null || b === null ? a === b : DateRange.equals(a, b);

/** Every field equal; photos in order, `takenDown` included. */
const equals = (a: OccasionContent, b: OccasionContent): boolean =>
  a.name === b.name &&
  periodEquals(a.period, b.period) &&
  Venue.equals(a.venue, b.venue) &&
  photosEqual(a.photos, b.photos) &&
  a.description === b.description &&
  a.tagline === b.tagline;

export const OccasionContent = {
  create,
  missingRequirements,
  isPublishable,
  toPublishable,
  equals,
  periodEquals,
};
