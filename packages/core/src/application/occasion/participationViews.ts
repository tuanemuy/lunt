import type { DateRange } from "@repo/core/domain/common/dateRange";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { ListingId, OccasionId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { Publication } from "@repo/core/domain/common/publication";
import type { Version } from "@repo/core/domain/common/version";
import type { Listing } from "@repo/core/domain/listing/listing";
import type { HoldingStatus } from "@repo/core/domain/occasion/holdingStatus";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type { Participation } from "@repo/core/domain/occasion/participation";
import type { OccasionRepositories } from "@repo/core/domain/occasion/ports/unitOfWork";
import type { OccasionName } from "@repo/core/domain/occasion/values";
import type { Place } from "@repo/core/domain/place/place";
import { SystemError, SystemErrorCode } from "../errors";
import {
  type AttachedListingView,
  attachedListingViews,
} from "./attachedListings";
import { splitDates } from "./participations";

/**
 * An occasion's name, period and states, as the participation and
 * region-link reads show it. The publication (with its `reason`), the
 * operator suspension and the holding status are independent.
 */
export type OccasionStateView = Readonly<{
  id: OccasionId;
  name: OccasionName | null;
  period: DateRange | null;
  publication: Publication;
  suspended: boolean;
  /** `null` while no period is set (a draft). */
  holdingStatus: HoldingStatus | null;
}>;

export const occasionStateView = (
  occasion: Occasion,
  today: LocalDate,
): OccasionStateView => ({
  id: occasion.id,
  name: occasion.content.name,
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

export const participationView = (
  p: Participation,
  period: DateRange | null,
  listings: ReadonlyMap<ListingId, Listing>,
  place: Place | null,
  today: LocalDate,
): ParticipationView => ({
  version: p.version,
  participatedAt: p.participatedAt,
  listings: attachedListingViews(p.details.listingIds, listings, place, today),
  dates: p.details.dates,
  ...splitDates(p, period),
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
