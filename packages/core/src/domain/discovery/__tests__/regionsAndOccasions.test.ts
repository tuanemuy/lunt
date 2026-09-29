import { Stewardship } from "@repo/core/domain/authority/stewardship";
import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { occasionFactory } from "@repo/core/domain/occasion/testing/samples";
import {
  SampleAddress,
  samplePlace,
} from "@repo/core/domain/place/testing/samples";
import { RegionContent } from "@repo/core/domain/region/content";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { type PublishedRegion, Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "../../error";
import type { PlaceEntry } from "../entry";
import { DiscoveryErrorCode } from "../errorCode";
import { Geo, MapGrid } from "../geo";
import { MapClustering } from "../mapClustering";
import { SelectionScope } from "../selectionScope";
import { Standing } from "../standing";
import { ViewProjection } from "../viewProjection";
import { VisibilityPolicy } from "../visibilityPolicy";

const o = occasionFactory(0x0d_0000);
const T = new Date("2026-09-01T00:00:00Z");
const day = (iso: string) => LocalDate.parse(iso);

const region = (name: string): PublishedRegion =>
  Region.publish(
    Region.register(
      {
        id: o.region(),
        content: RegionContent.create({
          name,
          address: SampleAddress.otemachi(),
          location: GeoPoint.create(35.7, 139.7),
          photoIds: [o.photo()],
          description: null,
          tagline: "路地を歩く",
        }),
      },
      T,
    ).entity,
    T,
  ).entity;

const bounds = (south: number, west: number, north: number, east: number) =>
  GeoBounds.create(GeoPoint.create(south, west), GeoPoint.create(north, east));

describe("VisibilityPolicy for regions and occasions", () => {
  it("a region or occasion is viewable only when published and not suspended", () => {
    const R = region("谷中");
    expect(VisibilityPolicy.isRegionViewable(R)).toBe(true);
    expect(VisibilityPolicy.isRegionViewable(Region.suspend(R, T).entity)).toBe(
      false,
    );
    expect(
      VisibilityPolicy.isRegionViewable(Region.unpublish(R, T).entity),
    ).toBe(false);
    const E = o.published();
    expect(VisibilityPolicy.isOccasionViewable(E)).toBe(true);
    expect(VisibilityPolicy.isOccasionViewable(o.cancelled(E))).toBe(true);
    expect(VisibilityPolicy.isOccasionViewable(o.suspended(E))).toBe(false);
    expect(VisibilityPolicy.isOccasionViewable(o.draft())).toBe(false);
    expect(VisibilityPolicy.isOccasionViewable(o.unpublished())).toBe(false);
  });

  it("an occasion is discoverable while upcoming or ongoing; a region always", () => {
    const E = o.published({ period: ["2026-10-01", "2026-10-03"] });
    const on = (iso: string) =>
      VisibilityPolicy.isDiscoverable(Standing.ofOccasion(E, day(iso)));
    expect(on("2026-09-30")).toBe(true);
    expect(on("2026-10-03")).toBe(true);
    expect(on("2026-10-04")).toBe(false);
    expect(
      VisibilityPolicy.isDiscoverable(
        Standing.ofOccasion(
          { content: E.content, cancellation: o.cancelled(E).cancellation },
          day("2026-09-30"),
        ),
      ),
    ).toBe(false);
    expect(VisibilityPolicy.isDiscoverable(Standing.ofRegion())).toBe(true);
    expect(
      VisibilityPolicy.admits(
        "reference",
        Standing.ofOccasion(E, day("2026-10-04")),
      ),
    ).toBe(true);
  });
});

describe("ViewProjection for regions and occasions", () => {
  it("regionsOf puts the displayed region first, then affiliation order, dropping regions not viewable or not affiliated", () => {
    const place = samplePlace(o.place());
    const [X, Y, Z, other] = ["X", "Y", "Z", "W"].map(region);
    if (!X || !Y || !Z || !other) throw new Error("regions");
    const joined = [X, Y, Z].reduce(
      (a, r, i) =>
        PlaceAffiliations.affiliate(a, r.id, new Date(T.getTime() + i)).entity,
      PlaceAffiliations.empty(place.id, T),
    );
    const chosenZ = PlaceAffiliations.chooseRepresentative(
      joined,
      Z.id,
      T,
    ).entity;
    expect(ViewProjection.regionsOf(chosenZ, [X, Y, Z, other])).toEqual([
      Z,
      X,
      Y,
    ]);
    const hiddenZ = Region.unpublish(Z, T).entity;
    expect(ViewProjection.regionsOf(chosenZ, [X, Y, hiddenZ])).toEqual([X, Y]);
    expect(ViewProjection.regionsOf(null, [X])).toEqual([]);
  });

  it("summaries show the cover, names and standing but not the introduction", () => {
    const R = region("谷中");
    expect(ViewProjection.regionSummary(R)).toEqual({
      regionId: R.id,
      cover: {
        source: "own",
        photoId: R.content.photos.items[0].photoId,
        framing: null,
      },
      name: "谷中",
      tagline: R.content.tagline,
      address: R.content.address,
      location: R.content.location,
    });
    const E = o.published({ period: ["2026-10-01", "2026-10-03"] });
    const summary = ViewProjection.occasionSummary(E, day("2026-10-02"));
    expect(summary.standing).toEqual({ kind: "occasion", holding: "ongoing" });
    expect(summary).not.toHaveProperty("description");
  });
});

describe("SelectionScope", () => {
  it("vacantOnly admits vacant stewardships only; openOnly admits upcoming and ongoing occasions only", () => {
    const vacant = Stewardship.vacant({ kind: "place", id: o.place() });
    expect(SelectionScope.admitsPlace(false, vacant)).toBe(true);
    expect(SelectionScope.admitsPlace(true, vacant)).toBe(true);
    const upcoming = { kind: "occasion", holding: "upcoming" } as const;
    const ended = { kind: "occasion", holding: "ended" } as const;
    expect(SelectionScope.admitsOccasion(true, upcoming)).toBe(true);
    expect(SelectionScope.admitsOccasion(true, ended)).toBe(false);
    expect(SelectionScope.admitsOccasion(false, ended)).toBe(true);
  });
});

describe("Geo and MapGrid", () => {
  it("MapGrid takes positive integers only", () => {
    expect(MapGrid.create(4, 3)).toEqual({ columns: 4, rows: 3 });
    for (const [columns, rows] of [
      [0, 4],
      [4, -1],
      [1.5, 4],
    ] as const) {
      let thrown: unknown = null;
      try {
        MapGrid.create(columns, rows);
      } catch (error) {
        thrown = error;
      }
      expect(isBusinessRuleError(thrown) && thrown.code).toBe(
        DiscoveryErrorCode.InvalidMapGrid,
      );
    }
  });

  it("cellOf clamps the east and north edges into the last cell and uses 0 on a zero-width side", () => {
    const grid = MapGrid.create(4, 4);
    const b = bounds(35, 139, 36, 140);
    expect(Geo.cellOf(b, grid, GeoPoint.create(35, 139))).toEqual({
      column: 0,
      row: 0,
    });
    expect(Geo.cellOf(b, grid, GeoPoint.create(36, 140))).toEqual({
      column: 3,
      row: 3,
    });
    expect(
      Geo.cellOf(bounds(35, 139, 36, 139), grid, GeoPoint.create(35.6, 139)),
    ).toEqual({ column: 0, row: 2 });
  });

  it("extentOf is the smallest rectangle, or null without points; distances round to the metre", () => {
    expect(Geo.extentOf([])).toBeNull();
    expect(
      Geo.extentOf([GeoPoint.create(35, 140), GeoPoint.create(36, 139)]),
    ).toEqual(bounds(35, 139, 36, 140));
    const d = Geo.distanceMeters(
      GeoPoint.create(35, 139),
      GeoPoint.create(35, 139.01),
    );
    expect(Number.isInteger(d)).toBe(true);
    expect(d).toBeGreaterThan(900);
    expect(d).toBeLessThan(920);
  });
});

describe("MapClustering", () => {
  const entry = (
    latitude: number,
    longitude: number,
    regions: readonly PublishedRegion[] = [],
    registeredAt = T,
  ): PlaceEntry => ({
    place: samplePlace(
      o.place(),
      { location: { latitude, longitude } },
      registeredAt,
    ),
    regions,
    substituteCover: null,
  });

  it("groups by cell into single, cluster and colocated cells, by row then column, leaving out places outside", () => {
    const R = region("谷中");
    const grid = MapGrid.create(2, 2);
    const b = bounds(0, 0, 10, 10);
    const lone = entry(8, 1);
    const a = entry(1, 1, [R]);
    const c = entry(2, 2);
    const older = entry(1, 8, [], new Date("2026-01-01T00:00:00Z"));
    const newer = entry(1, 8, [], new Date("2026-02-01T00:00:00Z"));
    const outside = entry(20, 20);
    const cells = MapClustering.cells(
      b,
      grid,
      [lone, a, c, older, newer, outside],
      R.id,
    );
    expect(cells).toEqual([
      {
        kind: "cluster",
        column: 0,
        row: 0,
        count: 2,
        affiliatedCount: 1,
        extent: bounds(1, 1, 2, 2),
      },
      {
        kind: "colocated",
        column: 1,
        row: 0,
        location: GeoPoint.create(1, 8),
        places: [newer, older],
      },
      { kind: "single", column: 0, row: 1, place: lone },
    ]);
    expect(MapClustering.cells(b, grid, [a, c], null)[0]).toMatchObject({
      kind: "cluster",
      affiliatedCount: 0,
    });
  });
});
