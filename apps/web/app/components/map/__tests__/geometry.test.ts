import { describe, expect, it } from "vitest";
import {
  centerOf,
  clampBounds,
  pinCount,
  pinLayer,
  pinSelected,
  viewportKey,
  visibleBounds,
} from "../geometry";
import type { MapPin } from "../types";

const at = { latitude: 35.69, longitude: 139.76 };
const extent = {
  southWest: { latitude: 35.6, longitude: 139.7 },
  northEast: { latitude: 35.8, longitude: 139.9 },
};

describe("clampBounds", () => {
  it("keeps a range inside the world as it is", () => {
    expect(clampBounds(139.7, 35.6, 139.9, 35.8)).toEqual(extent);
  });

  it("clamps a zoomed-out view to valid coordinates", () => {
    expect(clampBounds(-250, -95, 260, 91)).toEqual({
      southWest: { latitude: -90, longitude: -180 },
      northEast: { latitude: 90, longitude: 180 },
    });
  });
});

describe("centerOf", () => {
  it("is the middle of the range", () => {
    const center = centerOf(extent);
    expect(center.latitude).toBeCloseTo(35.7);
    expect(center.longitude).toBeCloseTo(139.8);
  });
});

describe("viewportKey", () => {
  it("is equal for equal values and differs when the value changes", () => {
    const a = viewportKey({ kind: "bounds", bounds: extent });
    expect(viewportKey({ kind: "bounds", bounds: { ...extent } })).toBe(a);
    expect(
      viewportKey({ kind: "bounds", bounds: extent, maxZoom: 12 }),
    ).not.toBe(a);
    expect(viewportKey({ kind: "center", center: at, zoom: 14 })).not.toBe(
      viewportKey({ kind: "center", center: at, zoom: 15 }),
    );
  });
});

describe("pins", () => {
  const place: MapPin = {
    kind: "target",
    target: "place",
    key: "p",
    position: at,
    label: "喫茶 日々",
    selected: true,
  };
  const cluster: MapPin = {
    kind: "cluster",
    key: "c",
    position: at,
    label: "店舗 3 件",
    count: 3,
    extent,
  };
  const region: MapPin = {
    kind: "region",
    key: "r",
    position: at,
    label: "まち こもれび商店街",
    name: "こもれび商店街",
    selected: false,
  };

  it("show 1 for a single target, the count for a group, and no count for a region", () => {
    expect(pinCount(place)).toBe(1);
    expect(pinCount(cluster)).toBe(3);
    expect(pinCount(region)).toBeNull();
  });

  it("make a cluster a plain button and the others toggles", () => {
    expect(pinSelected(cluster)).toBeUndefined();
    expect(pinSelected(place)).toBe(true);
    expect(pinSelected(region)).toBe(false);
  });

  it("draw the selected pin above the rest, and places above regions", () => {
    expect(pinLayer(place)).toBeGreaterThan(pinLayer(cluster));
    expect(pinLayer(cluster)).toBeGreaterThan(pinLayer(region));
  });
});

describe("visibleBounds", () => {
  it("spans the whole world's longitudes at zoom 0 on a 512 px map", () => {
    const bounds = visibleBounds({ latitude: 0, longitude: 0 }, 0, {
      width: 512,
      height: 512,
    });
    expect(bounds.southWest.longitude).toBeCloseTo(-180);
    expect(bounds.northEast.longitude).toBeCloseTo(180);
    expect(bounds.northEast.latitude).toBeCloseTo(85.0511, 3);
  });

  it("halves the span with each zoom level, around the centre", () => {
    const size = { width: 400, height: 300 };
    const wide = visibleBounds(at, 14, size);
    const near = visibleBounds(at, 15, size);
    const span = (bounds: typeof wide) =>
      bounds.northEast.longitude - bounds.southWest.longitude;
    expect(span(near)).toBeCloseTo(span(wide) / 2);
    expect(centerOf(near).longitude).toBeCloseTo(at.longitude);
    expect(centerOf(near).latitude).toBeCloseTo(at.latitude, 3);
  });
});
