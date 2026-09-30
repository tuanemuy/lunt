import { AreaSelection } from "@repo/core/domain/area/areaSelection";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import { CategoryId } from "@repo/core/domain/common/ids";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import { CategoryName } from "@repo/core/domain/listing/values";
import { occasionFactory } from "@repo/core/domain/occasion/testing/samples";
import { Place } from "@repo/core/domain/place/place";
import {
  SampleAddress,
  samplePlace,
  samplePlaceId,
} from "@repo/core/domain/place/testing/samples";
import { RegionContent } from "@repo/core/domain/region/content";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "../../error";
import { BrowseCriteria } from "../browseCriteria";
import { DiscoveryErrorCode } from "../errorCode";
import { ExplorationFocus } from "../explorationFocus";
import { Geo, MapGrid } from "../geo";
import { MapClustering, type MapSpot } from "../mapClustering";
import { RegionFootprint } from "../regionFootprint";
import { Vicinity } from "../vicinity";

const o = occasionFactory(0x0e_0000);
const T = new Date("2026-09-01T00:00:00Z");
const at = (latitude: number, longitude: number) =>
  GeoPoint.create(latitude, longitude);
const DEGREES_PER_METRE = 180 / (Math.PI * 6_371_000);
const northOf = (origin: GeoPoint, metres: number) =>
  at(origin.latitude + metres * DEGREES_PER_METRE, origin.longitude);

const region = (location: GeoPoint, address = SampleAddress.umeda()) =>
  Region.publish(
    Region.register(
      {
        id: o.region(),
        content: RegionContent.create({
          name: "谷中",
          address,
          location,
          photoIds: [o.photo()],
          description: null,
          tagline: null,
        }),
      },
      T,
    ).entity,
    T,
  ).entity;

const place = (
  n: number,
  location: GeoPoint,
  spec: Readonly<{
    address?: ReturnType<typeof SampleAddress.otemachi>;
    closed?: boolean;
    suspended?: boolean;
  }> = {},
) => {
  const registered = samplePlace(samplePlaceId(n), {
    location,
    ...(spec.address === undefined ? {} : { address: spec.address }),
  });
  const operating =
    spec.closed === true
      ? Place.changeOperatingStatus(registered, "permanentlyClosed", T).entity
      : registered;
  return spec.suspended === true
    ? Place.suspend(operating, T).entity
    : operating;
};

const rejectsWith = (code: string, fn: () => unknown) => {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(isBusinessRuleError(caught)).toBe(true);
  expect((caught as { code: string }).code).toBe(code);
};

describe("Geo for vicinities", () => {
  const center = at(35.7, 139.8);

  it("within includes the radius itself and excludes anything farther", () => {
    const circle = Vicinity.create(center, 1000);
    expect(Geo.within(circle, northOf(center, 1000))).toBe(true);
    expect(Geo.within(circle, northOf(center, 1001))).toBe(false);
  });

  it("boundsOf holds the circle's northmost, southmost, eastmost and westmost points", () => {
    const circle = Vicinity.create(center, 3000);
    const box = Geo.boundsOf(circle);
    const d = 3000 / 6_371_000;
    expect(box.northEast.latitude).toBeCloseTo(
      center.latitude + (d * 180) / Math.PI,
      9,
    );
    expect(box.southWest.latitude).toBeCloseTo(
      center.latitude - (d * 180) / Math.PI,
      9,
    );
    const dLng =
      (Math.asin(Math.sin(d) / Math.cos((center.latitude * Math.PI) / 180)) *
        180) /
      Math.PI;
    expect(box.northEast.longitude).toBeCloseTo(center.longitude + dLng, 9);
    expect(box.southWest.longitude).toBeCloseTo(center.longitude - dLng, 9);
    expect(
      Geo.distanceMeters(center, at(center.latitude, box.northEast.longitude)),
    ).toBe(3000);
  });

  it("JAPAN spans latitude 20–46 and longitude 122–154", () => {
    expect(Geo.JAPAN).toEqual(GeoBounds.create(at(20, 122), at(46, 154)));
  });
});

describe("Vicinity", () => {
  it("refuses a radius that is not a positive finite number", () => {
    for (const radius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      rejectsWith(DiscoveryErrorCode.InvalidVicinity, () =>
        Vicinity.create(at(35, 139), radius),
      );
    }
  });

  it("includesRegion looks at every footprint point", () => {
    const center = at(35.7, 139.8);
    const circle = Vicinity.create(center, 1000);
    const far = region(northOf(center, 5000));
    const near = place(1, northOf(center, 800), { closed: true });
    expect(
      Vicinity.includesRegion(circle, RegionFootprint.of(far, [], "reference")),
    ).toBe(false);
    expect(
      Vicinity.includesRegion(
        circle,
        RegionFootprint.of(far, [near], "reference"),
      ),
    ).toBe(true);
    expect(
      Vicinity.includesRegion(
        circle,
        RegionFootprint.of(far, [near], "discovery"),
      ),
    ).toBe(false);
  });
});

describe("RegionFootprint", () => {
  it("starts with the region, keeps viewable places in order, and drops closed ones only in the discovery scene", () => {
    const R = region(at(35.7, 139.8));
    const open = place(1, at(35.71, 139.8));
    const closed = place(2, at(35.72, 139.8), { closed: true });
    const hidden = place(3, at(35.73, 139.8), { suspended: true });
    const locations = (scene: "reference" | "discovery") =>
      RegionFootprint.locations(
        RegionFootprint.of(R, [open, closed, hidden], scene),
      );
    expect(locations("reference")).toEqual([
      R.content.location,
      open.profile.location,
      closed.profile.location,
    ]);
    expect(locations("discovery")).toEqual([
      R.content.location,
      open.profile.location,
    ]);
  });
});

describe("ExplorationFocus", () => {
  const origin = at(35.7, 139.8);
  const codes = new Set([AreaCode.create("1000004")]);

  it("prefers the chosen areas, then the viewer's vicinity, then everywhere", () => {
    expect(ExplorationFocus.of(codes, origin, 1000)).toEqual({
      kind: "areas",
      areaCodes: codes,
    });
    expect(ExplorationFocus.of(null, origin, 1000)).toEqual({
      kind: "vicinity",
      vicinity: Vicinity.create(origin, 1000),
    });
    expect(ExplorationFocus.of(null, null, 1000)).toEqual({
      kind: "everywhere",
    });
  });
});

describe("BrowseCriteria", () => {
  const eat = CategoryId.create("00000000-0000-7000-8000-00000000c001");
  const buy = CategoryId.create("00000000-0000-7000-8000-00000000c002");
  const unknown = CategoryId.create("00000000-0000-7000-8000-00000000c009");
  const catalog = CategoryCatalog.retire(
    CategoryCatalog.establish(
      CategoryCatalog.empty(),
      [
        { id: eat, name: CategoryName.create("食べる") },
        { id: buy, name: CategoryName.create("買う") },
      ],
      T,
    ).entity,
    buy,
    eat,
    T,
  ).entity;
  const otemachi = AreaSelection.area(AreaCode.create("1000004"));
  const expanded = new Set([AreaCode.create("1000004")]);

  it("resolves no condition to null and keeps only active categories with their predecessors", () => {
    expect(
      BrowseCriteria.resolve(
        { areas: [], categoryIds: [] },
        new Set(),
        catalog,
      ),
    ).toEqual(BrowseCriteria.none());
    const resolved = BrowseCriteria.resolve(
      { areas: [otemachi, otemachi], categoryIds: [eat, buy, unknown, eat] },
      expanded,
      catalog,
    );
    expect(resolved.areaCodes).toEqual(expanded);
    expect(resolved.categoryIds).toEqual(new Set([eat, buy]));
    expect(resolved.effective).toEqual({
      areas: [otemachi],
      categoryIds: [eat],
    });
  });

  it("matches a region by any point of its reference footprint", () => {
    const R = region(at(35.7, 139.8), SampleAddress.umeda());
    const inA = place(1, at(35.71, 139.8), {
      address: SampleAddress.otemachi(),
      closed: true,
    });
    const hiddenInA = place(2, at(35.71, 139.8), {
      address: SampleAddress.otemachi(),
      suspended: true,
    });
    const match = (places: readonly Place[]) =>
      BrowseCriteria.matchesRegion(
        expanded,
        RegionFootprint.of(R, places, "reference"),
      );
    expect(match([])).toBe(false);
    expect(match([hiddenInA])).toBe(false);
    expect(match([inA])).toBe(true);
    expect(
      BrowseCriteria.matchesRegion(
        null,
        RegionFootprint.of(R, [], "reference"),
      ),
    ).toBe(true);
    expect(
      BrowseCriteria.matchesRegion(
        new Set(),
        RegionFootprint.of(R, [inA], "reference"),
      ),
    ).toBe(false);
  });
});

describe("MapClustering.group", () => {
  it("groups any representation exactly as cells group entries", () => {
    const b = GeoBounds.create(at(0, 0), at(10, 10));
    const grid = MapGrid.create(2, 2);
    const spots: readonly MapSpot[] = [
      { id: "a", location: at(1, 1), registeredAt: T, affiliated: true },
      { id: "b", location: at(2, 2), registeredAt: T, affiliated: false },
      { id: "c", location: at(1, 8), registeredAt: T, affiliated: false },
      {
        id: "d",
        location: at(1, 8),
        registeredAt: new Date("2026-10-01T00:00:00Z"),
        affiliated: false,
      },
    ];
    expect(MapClustering.group(b, grid, spots, (spot) => spot)).toEqual([
      {
        kind: "cluster",
        column: 0,
        row: 0,
        count: 2,
        affiliatedCount: 1,
        extent: GeoBounds.create(at(1, 1), at(2, 2)),
      },
      {
        kind: "colocated",
        column: 1,
        row: 0,
        location: at(1, 8),
        places: [spots[3], spots[2]],
      },
    ]);
  });
});
