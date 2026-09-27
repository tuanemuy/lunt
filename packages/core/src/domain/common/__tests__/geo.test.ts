import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

describe("GeoPoint.create (latitude -90..90, longitude -180..180)", () => {
  it("accepts the inclusive extremes", () => {
    expect(GeoPoint.create(-90, -180)).toEqual({
      latitude: -90,
      longitude: -180,
    });
    expect(GeoPoint.create(90, 180)).toEqual({ latitude: 90, longitude: 180 });
    expect(GeoPoint.create(35.681236, 139.767125)).toEqual({
      latitude: 35.681236,
      longitude: 139.767125,
    });
  });

  it.each([
    ["latitude above 90", 90.000001, 0],
    ["latitude below -90", -90.000001, 0],
    ["longitude above 180", 0, 180.000001],
    ["longitude below -180", 0, -180.000001],
    ["NaN latitude", Number.NaN, 0],
    ["infinite longitude", 0, Number.POSITIVE_INFINITY],
  ])("rejects %s with COMMON_INVALID_GEO_POINT", (_label, lat, lng) => {
    expectBusinessError(
      () => GeoPoint.create(lat, lng),
      "COMMON_INVALID_GEO_POINT",
    );
  });

  it("accepts exactly the in-range values", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -200, max: 200, noNaN: true }),
        fc.double({ min: -200, max: 200, noNaN: true }),
        (lat, lng) => {
          const valid = lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
          if (valid) {
            expect(GeoPoint.create(lat, lng)).toEqual({
              latitude: lat,
              longitude: lng,
            });
          } else {
            expectBusinessError(
              () => GeoPoint.create(lat, lng),
              "COMMON_INVALID_GEO_POINT",
            );
          }
        },
      ),
    );
  });
});

describe("GeoBounds.create (south-west <= north-east on both axes)", () => {
  const p = GeoPoint.create;

  it("accepts sw <= ne, including a degenerate point rectangle", () => {
    expect(GeoBounds.create(p(35, 139), p(36, 140))).toEqual({
      southWest: { latitude: 35, longitude: 139 },
      northEast: { latitude: 36, longitude: 140 },
    });
    expect(() => GeoBounds.create(p(35, 139), p(35, 139))).not.toThrow();
  });

  it.each([
    ["sw latitude above ne", p(36, 139), p(35, 140)],
    [
      "sw longitude above ne (antimeridian crossing is not representable)",
      p(35, 179),
      p(36, -179),
    ],
  ])("rejects %s with COMMON_INVALID_GEO_BOUNDS", (_label, sw, ne) => {
    expectBusinessError(
      () => GeoBounds.create(sw, ne),
      "COMMON_INVALID_GEO_BOUNDS",
    );
  });

  it("contains is edge-inclusive", () => {
    const bounds = GeoBounds.create(p(35, 139), p(36, 140));
    expect(GeoBounds.contains(bounds, p(35, 139))).toBe(true);
    expect(GeoBounds.contains(bounds, p(36, 140))).toBe(true);
    expect(GeoBounds.contains(bounds, p(35.5, 139.5))).toBe(true);
    expect(GeoBounds.contains(bounds, p(36.1, 139.5))).toBe(false);
    expect(GeoBounds.contains(bounds, p(35.5, 138.9))).toBe(false);
  });
});
