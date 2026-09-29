import type { DateRange } from "@repo/core/domain/common/dateRange";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type {
  ListingId,
  OccasionId,
  PhotoId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { Publication } from "@repo/core/domain/common/publication";
import type { Version } from "@repo/core/domain/common/version";
import type { Listing } from "@repo/core/domain/listing/listing";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import type { HoldingStatus } from "@repo/core/domain/occasion/holdingStatus";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type { Participation } from "@repo/core/domain/occasion/participation";
import type { OccasionRepositories } from "@repo/core/domain/occasion/ports/unitOfWork";
import type { OccasionName } from "@repo/core/domain/occasion/values";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { Place } from "@repo/core/domain/place/place";
import { type PlaceName, PlaceProfile } from "@repo/core/domain/place/profile";
import { SystemError, SystemErrorCode } from "../errors";
import { coverIdOf, coverView, type PhotoView } from "../place/photos";
import {
  type AttachedListingView,
  attachedListingViews,
} from "./attachedListings";
import { splitDates } from "./participations";

/**
 * An occasion's name, period and states, as the participation and
 * region-link reads show it, with its cover (first photo). The publication
 * (with its `reason`), the operator suspension and the holding status are
 * independent.
 */
export type OccasionStateView = Readonly<{
  id: OccasionId;
  name: OccasionName | null;
  cover: PhotoView | null;
  period: DateRange | null;
  publication: Publication;
  suspended: boolean;
  /** `null` while no period is set (a draft). */
  holdingStatus: HoldingStatus | null;
}>;

/** The occasion's cover, for `PhotoStorage.displayRefs`. */
export const occasionCoverIds = (
  occasions: Iterable<Occasion>,
): readonly PhotoId[] =>
  [...occasions].flatMap((occasion) => {
    const id = coverIdOf(occasion.content.photos);
    return id === null ? [] : [id];
  });

/** `refs` holds the display ref of the occasion's cover (`occasionCoverIds`). */
export const occasionStateView = (
  occasion: Occasion,
  today: LocalDate,
  refs: ReadonlyMap<PhotoId, PhotoDisplayRef>,
): OccasionStateView => ({
  id: occasion.id,
  name: occasion.content.name,
  cover: coverView(refs, coverIdOf(occasion.content.photos)),
  period: occasion.content.period,
  publication: occasion.publication,
  suspended: occasion.suspension.suspended,
  holdingStatus: Occasion.holdingStatus(occasion, today),
});

/**
 * A participation's details as the management reads show them: every
 * attached listing with its state (deleted ones included), the dates, and
 * which of them the current period leaves out.
 */
export type ParticipationView = Readonly<{
  /** The version an edit starts from. */
  version: Version;
  participatedAt: Date;
  listings: readonly AttachedListingView[];
  /** Ascending. */
  dates: readonly LocalDate[];
  /** The dates viewers are shown (`Participation.visibleDates`). */
  visibleDates: readonly LocalDate[];
  /** The dates outside the current period (after a postponement). */
  outOfPeriodDates: readonly LocalDate[];
}>;

/** `refs` holds the display refs of the attached listings' covers. */
export const participationView = (
  p: Participation,
  period: DateRange | null,
  listings: ReadonlyMap<ListingId, Listing>,
  place: Place | null,
  today: LocalDate,
  refs: ReadonlyMap<PhotoId, PhotoDisplayRef>,
): ParticipationView => ({
  version: p.version,
  participatedAt: p.participatedAt,
  listings: attachedListingViews(
    p.details.listingIds,
    listings,
    place,
    today,
    refs,
  ),
  dates: p.details.dates,
  ...splitDates(p, period),
});

/**
 * A participating place as the participation reads show it: its name,
 * states and cover (first photo).
 */
export type ParticipantPlaceView = Readonly<{
  id: PlaceId;
  name: PlaceName;
  operatingStatus: OperatingStatus;
  /** Suspended by the operator (非公開). */
  suspended: boolean;
  cover: PhotoView | null;
}>;

/** The places' covers, for `PhotoStorage.displayRefs`. */
export const placeCoverIds = (places: Iterable<Place>): readonly PhotoId[] =>
  [...places].flatMap((place) => {
    const id = PlaceProfile.cover(place.profile);
    return id === null ? [] : [id];
  });

/** `refs` holds the display ref of the place's cover (`placeCoverIds`). */
export const participantPlaceView = (
  place: Place,
  refs: ReadonlyMap<PhotoId, PhotoDisplayRef>,
): ParticipantPlaceView => ({
  id: place.id,
  name: place.profile.name,
  operatingStatus: place.operatingStatus,
  suspended: Place.isSuspended(place),
  cover: coverView(refs, PlaceProfile.cover(place.profile)),
});

/** The listings attached to any of `participations`. */
export const attachedIdsOf = (
  participations: readonly Participation[],
): readonly ListingId[] => participations.flatMap((p) => p.details.listingIds);

/** The occasions among `ids`, looked up 100 at a time. */
export async function readOccasions(
  ctx: Pick<OccasionRepositories, "occasionRepository">,
  ids: readonly OccasionId[],
): Promise<ReadonlyMap<OccasionId, Occasion>> {
  const unique = [...new Set(ids)];
  const batches = await Promise.all(
    IdBatch.chunks(unique).map((batch) =>
      ctx.occasionRepository.findByIds(batch),
    ),
  );
  return new Map(batches.flat().map((o) => [o.id, o]));
}

/**
 * `map.get(id)` for an aggregate that is never deleted (an occasion, a
 * region, a place): a missing one is a data-integrity failure.
 */
export function present<K, V>(map: ReadonlyMap<K, V>, id: K): V {
  const value = map.get(id);
  if (value === undefined) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `${String(id)} referred to does not exist`,
    );
  }
  return value;
}
