import { DateRange } from "@repo/core/domain/common/dateRange";
import type {
  EventDraft,
  WithEventDrafts,
} from "@repo/core/domain/common/event";
import { ListingId, OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { OccasionErrorCode } from "./errorCode";
import {
  OccasionEvents,
  type ParticipationChangedBy,
  type ParticipationChangedEvent,
  type ParticipationDissolvedEvent,
  type ParticipationEstablishedEvent,
  participationAggregateId,
} from "./events";

/** A participation's identity: one occasion and one place. */
export type ParticipationKey = Readonly<{
  occasionId: OccasionId;
  placeId: PlaceId;
}>;

export const ParticipationKey = {
  equals: (a: ParticipationKey, b: ParticipationKey): boolean =>
    a.occasionId === b.occasionId && a.placeId === b.placeId,
  /** `"{occasionId}:{placeId}"`, the events' `aggregateId`. */
  toString: (key: ParticipationKey): string =>
    participationAggregateId(key.occasionId, key.placeId),
};

/**
 * The listings attached (in attach order, no repeats) and the days the
 * place takes part (ascending, no repeats). Both may be empty.
 */
export type ParticipationDetails = Readonly<{
  listingIds: readonly ListingId[];
  dates: readonly LocalDate[];
}>;

export type ParticipationDetailsInput = Readonly<{
  listingIds: readonly ListingId[];
  dates: readonly LocalDate[];
}>;

/** The facts `ParticipationDetails.create` checks against, read by the usecase. */
export type ParticipationDetailsFacts = Readonly<{
  period: DateRange | null;
  /** `Listing.attachableIds` of the input's listings — the only rule of "attachable". */
  attachableListingIds: ReadonlySet<ListingId>;
}>;

const uniqueInOrder = <T>(items: readonly T[]): readonly T[] => [
  ...new Set(items),
];

/**
 * Builds details: repeats dropped, days sorted. Every day must lie in
 * `facts.period` (`OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD`, also for
 * days carried over from `current`, and for any day when there is no
 * period). Every listing must be attachable or already in `current`
 * (`OCCASION_LISTING_NOT_ATTACHABLE`).
 */
function createDetails(
  input: ParticipationDetailsInput,
  facts: ParticipationDetailsFacts,
  current: ParticipationDetails | null,
): ParticipationDetails {
  const dates = [...uniqueInOrder(input.dates)].sort(LocalDate.compare);
  const { period } = facts;
  if (
    dates.some((date) => period === null || !DateRange.contains(period, date))
  ) {
    throw new BusinessRuleError(
      OccasionErrorCode.ParticipationDateOutOfPeriod,
      "A participation date lies outside the holding period",
    );
  }
  const attached = new Set(current?.listingIds ?? []);
  const listingIds = uniqueInOrder(input.listingIds);
  if (
    listingIds.some(
      (id) => !facts.attachableListingIds.has(id) && !attached.has(id),
    )
  ) {
    throw new BusinessRuleError(
      OccasionErrorCode.ListingNotAttachable,
      "A listing cannot be attached to the participation",
    );
  }
  return { listingIds, dates };
}

/** The days within `period`; none without a period. */
const datesWithin = (
  details: ParticipationDetails,
  period: DateRange | null,
): readonly LocalDate[] =>
  period === null
    ? []
    : details.dates.filter((date) => DateRange.contains(period, date));

const detailsEqual = (
  a: ParticipationDetails,
  b: ParticipationDetails,
): boolean =>
  a.listingIds.length === b.listingIds.length &&
  a.listingIds.every((id, i) => id === b.listingIds[i]) &&
  a.dates.length === b.dates.length &&
  a.dates.every((date, i) => date === b.dates[i]);

export const ParticipationDetails = {
  create: createDetails,
  datesWithin,
  equals: detailsEqual,
  empty: (): ParticipationDetails => ({ listingIds: [], dates: [] }),
};

/**
 * A place taking part in an occasion. Exists only while it lasts: a
 * withdrawal or an exclusion deletes it, and taking part again makes a
 * new one.
 */
export type Participation = Readonly<{
  key: ParticipationKey;
  details: ParticipationDetails;
  participatedAt: Date;
  version: Version;
  updatedAt: Date;
}>;

/** The at-rest form of a participation, in primitives. */
export type ParticipationSnapshot = Readonly<{
  occasionId: string;
  placeId: string;
  listingIds: readonly string[];
  /** `YYYY-MM-DD`. */
  dates: readonly string[];
  participatedAt: Date;
  updatedAt: Date;
  version: number;
}>;

type Params = Readonly<{
  key: ParticipationKey;
  details: ParticipationDetails;
}>;

const create = (
  params: Params,
  now: Date,
): WithEventDrafts<Participation, ParticipationEstablishedEvent> => ({
  entity: {
    key: params.key,
    details: params.details,
    participatedAt: now,
    version: Version.initial(),
    updatedAt: now,
  },
  eventDrafts: [
    OccasionEvents.participationEstablished(
      params.key.occasionId,
      params.key.placeId,
      now,
    ),
  ],
});

/**
 * An approved participation application. `details` were checked at
 * submission and are not checked again.
 */
function establish(
  params: Params,
  now: Date,
): WithEventDrafts<Participation, ParticipationEstablishedEvent> {
  return create(params, now);
}

const placeHasSteward = (): BusinessRuleError<OccasionErrorCode> =>
  new BusinessRuleError(
    OccasionErrorCode.PlaceHasSteward,
    "The place has a steward",
  );

/**
 * The occasion's operator adds a place without a steward, whatever the
 * holding status. `OCCASION_ALREADY_PARTICIPATING` when `existing`,
 * `OCCASION_PLACE_HAS_STEWARD`, `OCCASION_PLACE_NOT_VIEWABLE`, in that
 * order.
 */
function addDirectly(
  existing: Participation | null,
  params: Params,
  facts: Readonly<{ placeHasSteward: boolean; placeViewable: boolean }>,
  now: Date,
): WithEventDrafts<Participation, ParticipationEstablishedEvent> {
  if (existing !== null) {
    throw new BusinessRuleError(
      OccasionErrorCode.AlreadyParticipating,
      "The place already takes part in the occasion",
    );
  }
  if (facts.placeHasSteward) throw placeHasSteward();
  if (!facts.placeViewable) {
    throw new BusinessRuleError(
      OccasionErrorCode.PlaceNotViewable,
      "The place is not viewable",
    );
  }
  return create(params, now);
}

function change(
  p: Participation,
  details: ParticipationDetails,
  changedBy: ParticipationChangedBy,
  now: Date,
): WithEventDrafts<Participation, ParticipationChangedEvent> {
  if (detailsEqual(p.details, details)) return { entity: p, eventDrafts: [] };
  return {
    entity: {
      ...p,
      details,
      version: Version.next(p.version),
      updatedAt: now,
    },
    eventDrafts: [
      OccasionEvents.participationChanged(
        p.key.occasionId,
        p.key.placeId,
        changedBy,
        now,
      ),
    ],
  };
}

/** The place's steward replaces the details; equal details change nothing. */
function changeByPlace(
  p: Participation,
  details: ParticipationDetails,
  now: Date,
): WithEventDrafts<Participation, ParticipationChangedEvent> {
  return change(p, details, "place", now);
}

/**
 * The occasion's operator replaces the details of a place without a
 * steward (`OCCASION_PLACE_HAS_STEWARD` otherwise), however the
 * participation came about; equal details change nothing.
 */
function changeByOccasion(
  p: Participation,
  details: ParticipationDetails,
  facts: Readonly<{ placeHasSteward: boolean }>,
  now: Date,
): WithEventDrafts<Participation, ParticipationChangedEvent> {
  if (facts.placeHasSteward) throw placeHasSteward();
  return change(p, details, "occasion", now);
}

/** The place's steward withdraws; the usecase deletes the participation. */
const withdraw = (
  p: Participation,
  now: Date,
): readonly EventDraft<ParticipationDissolvedEvent>[] => [
  OccasionEvents.participationDissolved(
    p.key.occasionId,
    p.key.placeId,
    "withdrawn",
    now,
  ),
];

/** The occasion's operator excludes the place; the usecase deletes it. */
const exclude = (
  p: Participation,
  now: Date,
): readonly EventDraft<ParticipationDissolvedEvent>[] => [
  OccasionEvents.participationDissolved(
    p.key.occasionId,
    p.key.placeId,
    "excluded",
    now,
  ),
];

/** The days viewers are shown: those within the current period. */
const visibleDates = (
  p: Participation,
  period: DateRange | null,
): readonly LocalDate[] => datesWithin(p.details, period);

function reconstruct(snapshot: ParticipationSnapshot): Participation {
  try {
    const listingIds = snapshot.listingIds.map(ListingId.create);
    if (new Set(listingIds).size !== listingIds.length) {
      throw new Error("Attached listings repeat");
    }
    const dates = snapshot.dates.map(LocalDate.parse);
    if (!dates.every((date, i) => i === 0 || (dates[i - 1] ?? date) < date)) {
      throw new Error("Participation dates are not ascending and unique");
    }
    return {
      key: {
        occasionId: OccasionId.create(snapshot.occasionId),
        placeId: PlaceId.create(snapshot.placeId),
      },
      details: { listingIds, dates },
      participatedAt: snapshot.participatedAt,
      version: Version.create(snapshot.version),
      updatedAt: snapshot.updatedAt,
    };
  } catch (error) {
    throw new RehydrationError(
      "Stored participation violates invariants",
      error,
    );
  }
}

const snapshot = (p: Participation): ParticipationSnapshot => ({
  occasionId: p.key.occasionId,
  placeId: p.key.placeId,
  listingIds: [...p.details.listingIds],
  dates: [...p.details.dates],
  participatedAt: p.participatedAt,
  updatedAt: p.updatedAt,
  version: p.version,
});

export const Participation = {
  establish,
  addDirectly,
  changeByPlace,
  changeByOccasion,
  withdraw,
  exclude,
  visibleDates,
  reconstruct,
  snapshot,
};
