import type { AuthorityRepositories } from "@repo/core/domain/authority/ports/unitOfWork";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { DateRange } from "@repo/core/domain/common/dateRange";
import type {
  ListingId,
  OccasionId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import type { Version } from "@repo/core/domain/common/version";
import { Listing } from "@repo/core/domain/listing/listing";
import type { ListingRepositories } from "@repo/core/domain/listing/ports/unitOfWork";
import {
  Participation,
  ParticipationDetails,
  type ParticipationDetailsFacts,
  type ParticipationKey,
} from "@repo/core/domain/occasion/participation";
import type { OccasionRepositories } from "@repo/core/domain/occasion/ports/unitOfWork";
import type { Place } from "@repo/core/domain/place/place";
import type { PlaceRepositories } from "@repo/core/domain/place/ports/unitOfWork";
import { ConflictError, NotFoundError } from "../errors";
import { PLACE_NOT_FOUND } from "../place/places";
import { readListings } from "./attachedListings";

export const PARTICIPATION_NOT_FOUND = "PARTICIPATION_NOT_FOUND";
/** The edit started from a version someone else has saved over since. */
export const PARTICIPATION_VERSION_CONFLICT = "PARTICIPATION_VERSION_CONFLICT";

/** Attached listings and participation dates as a request carries them. */
export type ParticipationDetailsFields = Readonly<{
  listingIds: readonly ListingId[];
  dates: readonly LocalDate[];
}>;

/** The place; `NotFoundError` when there is none. */
export async function requireParticipantPlace(
  ctx: PlaceRepositories,
  id: PlaceId,
): Promise<Place> {
  const found = await ctx.placeRepository.findById(id);
  if (found === null) {
    throw new NotFoundError(PLACE_NOT_FOUND, `Place ${id} does not exist`);
  }
  return found.entity;
}

/** The pair's participation; `NotFoundError` once it has been dissolved. */
export async function requireParticipation(
  ctx: Pick<OccasionRepositories, "participationRepository">,
  key: ParticipationKey,
): Promise<Versioned<Participation>> {
  const found = await ctx.participationRepository.findById(key);
  if (found === null) {
    throw new NotFoundError(
      PARTICIPATION_NOT_FOUND,
      `Place ${key.placeId} does not take part in occasion ${key.occasionId}`,
    );
  }
  return found;
}

/** 編集の競合: the version the edit started from must still be the stored one. */
export function assertEditedVersion(p: Participation, edited: Version): void {
  if (p.version !== edited) {
    throw new ConflictError(
      PARTICIPATION_VERSION_CONFLICT,
      `The participation changed since version ${edited} was read`,
    );
  }
}

/** Whether the place has a steward (`Stewardship.isVacant`, vacant when none is stored). */
export async function placeHasSteward(
  ctx: Pick<AuthorityRepositories, "stewardshipRepository">,
  placeId: PlaceId,
): Promise<boolean> {
  const target = { kind: "place", id: placeId } as const;
  const found = await ctx.stewardshipRepository.findById(target);
  return !Stewardship.isVacant(
    Stewardship.orVacant(found?.entity ?? null, target),
  );
}

/**
 * Validates the requested details (`ParticipationDetails.create`) against
 * the period and the attachable listings among the requested ones
 * (`Listing.attachableIds`, the one rule of "attachable").
 */
export async function participationDetails(
  ctx: Pick<ListingRepositories, "listingRepository">,
  fields: ParticipationDetailsFields,
  facts: Readonly<{
    placeId: PlaceId;
    period: DateRange | null;
    today: LocalDate;
  }>,
  current: ParticipationDetails | null,
): Promise<ParticipationDetails> {
  const listings = await readListings(ctx, fields.listingIds);
  const detailsFacts: ParticipationDetailsFacts = {
    period: facts.period,
    attachableListingIds: new Set(
      Listing.attachableIds([...listings.values()], facts.placeId, facts.today),
    ),
  };
  return ParticipationDetails.create(fields, detailsFacts, current);
}

/** A participation's details as a write answers them. */
export type ParticipationContentView = Readonly<{
  occasionId: OccasionId;
  placeId: PlaceId;
  /** The version an edit starts from. */
  version: Version;
  participatedAt: Date;
  /** In attachment order. */
  listingIds: readonly ListingId[];
  /** Ascending. */
  dates: readonly LocalDate[];
  /** The dates viewers are shown (`Participation.visibleDates`). */
  visibleDates: readonly LocalDate[];
  /** The dates outside the current period. */
  outOfPeriodDates: readonly LocalDate[];
}>;

/** The dates viewers are shown and those left outside the period. */
export function splitDates(
  p: Participation,
  period: DateRange | null,
): Readonly<{
  visibleDates: readonly LocalDate[];
  outOfPeriodDates: readonly LocalDate[];
}> {
  const visibleDates = Participation.visibleDates(p, period);
  const visible = new Set(visibleDates);
  return {
    visibleDates,
    outOfPeriodDates: p.details.dates.filter((date) => !visible.has(date)),
  };
}

export function participationContentView(
  p: Participation,
  period: DateRange | null,
): ParticipationContentView {
  return {
    occasionId: p.key.occasionId,
    placeId: p.key.placeId,
    version: p.version,
    participatedAt: p.participatedAt,
    listingIds: p.details.listingIds,
    dates: p.details.dates,
    ...splitDates(p, period),
  };
}
