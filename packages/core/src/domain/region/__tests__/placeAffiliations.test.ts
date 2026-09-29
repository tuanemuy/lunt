import { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { isRehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import {
  catchError,
  expectBusinessError,
} from "../../common/__tests__/expectBusinessError";
import {
  PlaceAffiliations,
  type PlaceAffiliationsSnapshot,
} from "../placeAffiliations";

const place = PlaceId.create("place-1");
const [X, Y, Z] = ["region-x", "region-y", "region-z"].map(RegionId.create) as [
  RegionId,
  RegionId,
  RegionId,
];
const at = (minute: number) => new Date(Date.UTC(2026, 8, 1, 0, minute, 0, 0));

/** Affiliated with `regions` in order, one minute apart from minute 1. */
const affiliated = (...regions: readonly RegionId[]): PlaceAffiliations =>
  regions.reduce(
    (a, regionId, i) =>
      PlaceAffiliations.affiliate(a, regionId, at(i + 1)).entity,
    PlaceAffiliations.empty(place, at(0)),
  );

const choose = (a: PlaceAffiliations, regionId: RegionId) =>
  PlaceAffiliations.chooseRepresentative(a, regionId, at(50)).entity;

describe("PlaceAffiliations.empty", () => {
  it("has no affiliations and no representative", () => {
    const a = PlaceAffiliations.empty(place, at(0));
    expect(a).toEqual({
      placeId: place,
      affiliations: [],
      chosenRepresentative: null,
      version: 0,
      updatedAt: at(0),
    });
    expect(PlaceAffiliations.representative(a)).toBeNull();
    expect(PlaceAffiliations.displayedRegion(a, new Set([X]))).toBeNull();
  });
});

describe("PlaceAffiliations.affiliate", () => {
  it("adds the affiliation at now, bumps the version and emits the event", () => {
    const { entity, eventDrafts } = PlaceAffiliations.affiliate(
      PlaceAffiliations.empty(place, at(0)),
      X,
      at(1),
    );
    expect(entity.affiliations).toEqual([{ regionId: X, affiliatedAt: at(1) }]);
    expect(entity).toMatchObject({ version: 1, updatedAt: at(1) });
    expect(PlaceAffiliations.has(entity, X)).toBe(true);
    expect(eventDrafts).toEqual([
      {
        type: "region.affiliation_established",
        payload: { placeId: place, regionId: X },
        occurredAt: at(1),
        aggregateId: place,
      },
    ]);
  });

  it("refuses a region already affiliated", () => {
    expectBusinessError(
      () => PlaceAffiliations.affiliate(affiliated(X), X, at(9)),
      "REGION_ALREADY_AFFILIATED",
    );
  });

  it("keeps first-affiliated order, ties by RegionId", () => {
    const sameTime = [Z, X, Y].reduce(
      (a, regionId) => PlaceAffiliations.affiliate(a, regionId, at(5)).entity,
      PlaceAffiliations.empty(place, at(0)),
    );
    expect(PlaceAffiliations.regionIds(sameTime)).toEqual([X, Y, Z]);
    expect(PlaceAffiliations.regionIds(affiliated(Z, X))).toEqual([Z, X]);
  });

  it("keeps the chosen representative", () => {
    const a = choose(affiliated(X, Y), Y);
    const next = PlaceAffiliations.affiliate(a, Z, at(60)).entity;
    expect(next.chosenRepresentative).toBe(Y);
  });
});

describe("PlaceAffiliations.leave / exclude", () => {
  it.each([
    ["leave", PlaceAffiliations.leave, "left"],
    ["exclude", PlaceAffiliations.exclude, "excluded"],
  ] as const)(
    "%s dissolves one affiliation with its cause",
    (_, dissolve, cause) => {
      const a = affiliated(X, Y);
      const { entity, eventDrafts } = dissolve(a, X, at(10));
      expect(entity.affiliations).toEqual([
        { regionId: Y, affiliatedAt: at(2) },
      ]);
      expect(entity.version).toBe(a.version + 1);
      expect(eventDrafts).toEqual([
        {
          type: "region.affiliation_dissolved",
          payload: { placeId: place, regionId: X, cause },
          occurredAt: at(10),
          aggregateId: place,
        },
      ]);
    },
  );

  it("refuses a region not affiliated", () => {
    expectBusinessError(
      () => PlaceAffiliations.exclude(affiliated(X), Y, at(10)),
      "REGION_NOT_AFFILIATED",
    );
    expectBusinessError(
      () =>
        PlaceAffiliations.leave(
          PlaceAffiliations.empty(place, at(0)),
          X,
          at(10),
        ),
      "REGION_NOT_AFFILIATED",
    );
  });

  it("clears the chosen representative only when it is the dissolved one", () => {
    const a = choose(affiliated(X, Y, Z), Y);
    const cleared = PlaceAffiliations.exclude(a, Y, at(60)).entity;
    expect(cleared.chosenRepresentative).toBeNull();
    expect(PlaceAffiliations.representative(cleared)).toBe(X);
    const kept = PlaceAffiliations.exclude(a, X, at(60)).entity;
    expect(kept.chosenRepresentative).toBe(Y);
  });

  it("leaves an empty aggregate after the last dissolution", () => {
    const a = PlaceAffiliations.leave(affiliated(X), X, at(10)).entity;
    expect(a.affiliations).toEqual([]);
    expect(PlaceAffiliations.representative(a)).toBeNull();
  });

  it("re-affiliating makes a new affiliation at the new time", () => {
    const a = PlaceAffiliations.exclude(affiliated(X, Y), X, at(10)).entity;
    const again = PlaceAffiliations.affiliate(a, X, at(20)).entity;
    expect(again.affiliations).toEqual([
      { regionId: Y, affiliatedAt: at(2) },
      { regionId: X, affiliatedAt: at(20) },
    ]);
    expect(PlaceAffiliations.representative(again)).toBe(Y);
  });
});

describe("PlaceAffiliations.chooseRepresentative", () => {
  it("chooses an affiliated region without events", () => {
    const a = affiliated(X, Y);
    const { entity, eventDrafts } = PlaceAffiliations.chooseRepresentative(
      a,
      Y,
      at(30),
    );
    expect(entity.chosenRepresentative).toBe(Y);
    expect(entity.affiliations).toBe(a.affiliations);
    expect(entity).toMatchObject({ version: a.version + 1, updatedAt: at(30) });
    expect(eventDrafts).toEqual([]);
    expect(PlaceAffiliations.representative(entity)).toBe(Y);
    expect(choose(entity, X).chosenRepresentative).toBe(X);
  });

  it("refuses a region not affiliated", () => {
    expectBusinessError(
      () => PlaceAffiliations.chooseRepresentative(affiliated(X), Y, at(30)),
      "REGION_NOT_AFFILIATED",
    );
  });

  it("refuses the current representative, chosen or first affiliated", () => {
    expectBusinessError(
      () => PlaceAffiliations.chooseRepresentative(affiliated(X, Y), X, at(30)),
      "REGION_REPRESENTATIVE_ALREADY_CHOSEN",
    );
    expectBusinessError(
      () =>
        PlaceAffiliations.chooseRepresentative(
          choose(affiliated(X, Y), Y),
          Y,
          at(60),
        ),
      "REGION_REPRESENTATIVE_ALREADY_CHOSEN",
    );
  });
});

describe("PlaceAffiliations.representative / displayedRegion", () => {
  it("representative is the chosen one, else the first affiliated", () => {
    expect(PlaceAffiliations.representative(affiliated(X, Y))).toBe(X);
    expect(PlaceAffiliations.representative(choose(affiliated(X, Y), Y))).toBe(
      Y,
    );
  });

  it("shows the representative while viewable", () => {
    const a = choose(affiliated(X, Y, Z), Y);
    expect(PlaceAffiliations.displayedRegion(a, new Set([X, Y, Z]))).toBe(Y);
  });

  it("otherwise shows the first affiliated viewable region", () => {
    const a = choose(affiliated(X, Y, Z), Y);
    expect(PlaceAffiliations.displayedRegion(a, new Set([Z]))).toBe(Z);
    expect(PlaceAffiliations.displayedRegion(a, new Set([Z, X]))).toBe(X);
    expect(
      PlaceAffiliations.displayedRegion(affiliated(X, Y), new Set([Y])),
    ).toBe(Y);
  });

  it("shows none when no affiliated region is viewable", () => {
    expect(
      PlaceAffiliations.displayedRegion(affiliated(X), new Set<RegionId>()),
    ).toBeNull();
    expect(
      PlaceAffiliations.displayedRegion(affiliated(X), new Set([Y])),
    ).toBeNull();
  });
});

describe("PlaceAffiliations.reconstruct / snapshot", () => {
  it("round-trips", () => {
    for (const a of [
      PlaceAffiliations.empty(place, at(0)),
      affiliated(X, Y),
      choose(affiliated(X, Y, Z), Z),
    ]) {
      expect(
        PlaceAffiliations.reconstruct(PlaceAffiliations.snapshot(a)),
      ).toEqual(a);
    }
  });

  const base = PlaceAffiliations.snapshot(choose(affiliated(X, Y), Y));
  it.each([
    [
      "a region twice",
      {
        ...base,
        affiliations: [
          { regionId: X, affiliatedAt: at(1) },
          { regionId: X, affiliatedAt: at(2) },
        ],
        chosenRepresentative: null,
      },
    ],
    [
      "affiliations out of order",
      {
        ...base,
        affiliations: [
          { regionId: Y, affiliatedAt: at(2) },
          { regionId: X, affiliatedAt: at(1) },
        ],
      },
    ],
    ["a chosen region not affiliated", { ...base, chosenRepresentative: Z }],
    ["an invalid date", { ...base, updatedAt: new Date(Number.NaN) }],
    ["a blank place id", { ...base, placeId: " " }],
  ] as const satisfies readonly (readonly [
    string,
    PlaceAffiliationsSnapshot,
  ])[])("rejects %s", (_, snapshot) => {
    expect(
      isRehydrationError(
        catchError(() => PlaceAffiliations.reconstruct(snapshot)),
      ),
    ).toBe(true);
  });
});
