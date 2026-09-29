import type { WithEventDrafts } from "@repo/core/domain/common/event";
import { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { RegionErrorCode } from "./errorCode";
import {
  type AffiliationDissolveCause,
  type AffiliationDissolvedEvent,
  type AffiliationEstablishedEvent,
  RegionEvents,
} from "./events";

/** A place's membership of a region; `affiliatedAt` is when it was established. */
export type Affiliation = Readonly<{
  regionId: RegionId;
  affiliatedAt: Date;
}>;

/**
 * One place's affiliations (所属) and the representative region its
 * manager chose. Keyed by `PlaceId`. Invariants: no region twice,
 * `affiliations` in first-affiliated order (`affiliatedAt`, then
 * `RegionId`), and `chosenRepresentative` is `null` or one of them.
 */
export type PlaceAffiliations = Readonly<{
  placeId: PlaceId;
  affiliations: readonly Affiliation[];
  chosenRepresentative: RegionId | null;
  version: Version;
  updatedAt: Date;
}>;

/** The at-rest form, in primitives. */
export type PlaceAffiliationsSnapshot = Readonly<{
  placeId: string;
  affiliations: readonly Readonly<{ regionId: string; affiliatedAt: Date }>[];
  chosenRepresentative: string | null;
  updatedAt: Date;
  version: number;
}>;

const byCodePoint = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** First-affiliated order: `affiliatedAt` ascending, then `RegionId`. */
const firstAffiliatedOrder = (a: Affiliation, b: Affiliation): number =>
  a.affiliatedAt.getTime() - b.affiliatedAt.getTime() ||
  byCodePoint(a.regionId, b.regionId);

const rule = (code: RegionErrorCode, message: string) =>
  new BusinessRuleError(code, message);

const has = (a: PlaceAffiliations, regionId: RegionId): boolean =>
  a.affiliations.some((affiliation) => affiliation.regionId === regionId);

const touched = (
  a: PlaceAffiliations,
  change: Pick<PlaceAffiliations, "affiliations" | "chosenRepresentative">,
  now: Date,
): PlaceAffiliations => ({
  placeId: a.placeId,
  affiliations: change.affiliations,
  chosenRepresentative: change.chosenRepresentative,
  version: Version.next(a.version),
  updatedAt: now,
});

/** A place with no affiliation; used when its first affiliation is established. */
function empty(placeId: PlaceId, now: Date): PlaceAffiliations {
  return {
    placeId,
    affiliations: [],
    chosenRepresentative: null,
    version: Version.initial(),
    updatedAt: now,
  };
}

/**
 * Establishes an affiliation (an affiliation application approved) at
 * `now`. `REGION_ALREADY_AFFILIATED` when already affiliated. The chosen
 * representative is kept.
 */
function affiliate(
  a: PlaceAffiliations,
  regionId: RegionId,
  now: Date,
): WithEventDrafts<PlaceAffiliations, AffiliationEstablishedEvent> {
  if (has(a, regionId)) {
    throw rule(
      RegionErrorCode.AlreadyAffiliated,
      "The place is already affiliated with the region",
    );
  }
  const affiliations = [
    ...a.affiliations,
    { regionId, affiliatedAt: now },
  ].sort(firstAffiliatedOrder);
  return {
    entity: touched(
      a,
      { affiliations, chosenRepresentative: a.chosenRepresentative },
      now,
    ),
    eventDrafts: [
      RegionEvents.affiliationEstablished(a.placeId, regionId, now),
    ],
  };
}

/**
 * The one dissolution both a leave and an exclusion go through:
 * `REGION_NOT_AFFILIATED` unless affiliated; a dissolved chosen
 * representative is cleared; the other affiliations stay as they are.
 */
function dissolve(
  a: PlaceAffiliations,
  regionId: RegionId,
  cause: AffiliationDissolveCause,
  now: Date,
): WithEventDrafts<PlaceAffiliations, AffiliationDissolvedEvent> {
  if (!has(a, regionId)) {
    throw rule(
      RegionErrorCode.NotAffiliated,
      "The place is not affiliated with the region",
    );
  }
  return {
    entity: touched(
      a,
      {
        affiliations: a.affiliations.filter(
          (affiliation) => affiliation.regionId !== regionId,
        ),
        chosenRepresentative:
          a.chosenRepresentative === regionId ? null : a.chosenRepresentative,
      },
      now,
    ),
    eventDrafts: [
      RegionEvents.affiliationDissolved(a.placeId, regionId, cause, now),
    ],
  };
}

/** Dissolves on an approved leave application (`cause: "left"`). */
const leave = (a: PlaceAffiliations, regionId: RegionId, now: Date) =>
  dissolve(a, regionId, "left", now);

/** Dissolves by the region's operator, without approval or reason (`cause: "excluded"`). */
const exclude = (a: PlaceAffiliations, regionId: RegionId, now: Date) =>
  dissolve(a, regionId, "excluded", now);

/** The chosen representative, else the first affiliated region, else `null`. */
function representative(a: PlaceAffiliations): RegionId | null {
  return a.chosenRepresentative ?? a.affiliations[0]?.regionId ?? null;
}

/**
 * Makes an affiliated region the chosen representative, whatever its
 * publication or suspension. `REGION_NOT_AFFILIATED` unless affiliated;
 * `REGION_REPRESENTATIVE_ALREADY_CHOSEN` when it already is the
 * representative (chosen, or the first affiliated when none is chosen).
 */
function chooseRepresentative(
  a: PlaceAffiliations,
  regionId: RegionId,
  now: Date,
): WithEventDrafts<PlaceAffiliations, never> {
  if (!has(a, regionId)) {
    throw rule(
      RegionErrorCode.NotAffiliated,
      "The place is not affiliated with the region",
    );
  }
  if (representative(a) === regionId) {
    throw rule(
      RegionErrorCode.RepresentativeAlreadyChosen,
      "The region already is the representative",
    );
  }
  return {
    entity: touched(
      a,
      { affiliations: a.affiliations, chosenRepresentative: regionId },
      now,
    ),
    eventDrafts: [],
  };
}

/**
 * The region viewers are shown: the representative while it is in
 * `viewableRegionIds`, else the first affiliated viewable one, else `null`.
 */
function displayedRegion(
  a: PlaceAffiliations,
  viewableRegionIds: ReadonlySet<RegionId>,
): RegionId | null {
  const chosen = representative(a);
  if (chosen !== null && viewableRegionIds.has(chosen)) return chosen;
  return (
    a.affiliations.find((affiliation) =>
      viewableRegionIds.has(affiliation.regionId),
    )?.regionId ?? null
  );
}

/** The affiliated region ids in first-affiliated order. */
const regionIds = (a: PlaceAffiliations): readonly RegionId[] =>
  a.affiliations.map((affiliation) => affiliation.regionId);

function storedDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) throw new Error("Invalid stored date");
  return value;
}

/** Rebuilds a stored aggregate; `RehydrationError` when an invariant fails. */
function reconstruct(snapshot: PlaceAffiliationsSnapshot): PlaceAffiliations {
  try {
    const affiliations = snapshot.affiliations.map(
      (affiliation): Affiliation => ({
        regionId: RegionId.create(affiliation.regionId),
        affiliatedAt: storedDate(affiliation.affiliatedAt),
      }),
    );
    const ids = new Set(
      affiliations.map((affiliation) => affiliation.regionId),
    );
    if (ids.size !== affiliations.length) {
      throw new Error("A region appears more than once");
    }
    const sorted = [...affiliations].sort(firstAffiliatedOrder);
    if (!sorted.every((affiliation, i) => affiliation === affiliations[i])) {
      throw new Error("Affiliations are not in first-affiliated order");
    }
    const chosen =
      snapshot.chosenRepresentative === null
        ? null
        : RegionId.create(snapshot.chosenRepresentative);
    if (chosen !== null && !ids.has(chosen)) {
      throw new Error("The chosen representative is not affiliated");
    }
    return {
      placeId: PlaceId.create(snapshot.placeId),
      affiliations,
      chosenRepresentative: chosen,
      version: Version.create(snapshot.version),
      updatedAt: storedDate(snapshot.updatedAt),
    };
  } catch (error) {
    throw new RehydrationError(
      "Stored place affiliations violate invariants",
      error,
    );
  }
}

function snapshot(a: PlaceAffiliations): PlaceAffiliationsSnapshot {
  return {
    placeId: a.placeId,
    affiliations: a.affiliations.map((affiliation) => ({
      regionId: affiliation.regionId,
      affiliatedAt: affiliation.affiliatedAt,
    })),
    chosenRepresentative: a.chosenRepresentative,
    updatedAt: a.updatedAt,
    version: a.version,
  };
}

export const PlaceAffiliations = {
  empty,
  affiliate,
  leave,
  exclude,
  chooseRepresentative,
  has,
  representative,
  displayedRegion,
  regionIds,
  /** `affiliatedAt` ascending, then `RegionId` — 「最初に所属した順」. */
  firstAffiliatedOrder,
  reconstruct,
  snapshot,
};
