import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { tintStyle } from "../mapStyle";

const style: StyleSpecification = {
  version: 8,
  sources: {
    openmaptiles: { type: "vector", url: "https://tiles.example/planet" },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#fff" },
    },
    {
      id: "highway_major_inner",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      paint: { "line-color": "#fff", "line-width": 2 },
    },
    {
      id: "label_city",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      layout: { "text-field": ["get", "name:latin"], "text-size": 14 },
      paint: { "text-color": "#000" },
    },
    {
      id: "road_shield",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      layout: { "icon-image": "shield", "text-field": ["get", "ref"] },
    },
    {
      id: "highway-shield-non-us",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      layout: { "text-field": ["to-string", ["get", "ref"]] },
    },
    {
      id: "unknown_layer",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      paint: { "fill-color": "#123456" },
    },
  ],
};

describe("tintStyle", () => {
  const tinted = tintStyle(style);
  const layer = (id: string) => tinted.layers.find((each) => each.id === id);

  it("paints the ground and roads in the MapCanvas colours, keeping other paint", () => {
    expect(layer("background")).toMatchObject({
      paint: { "background-color": "#F3F1EB" },
    });
    expect(layer("highway_major_inner")).toMatchObject({
      paint: { "line-color": "#FFFEFA", "line-width": 2 },
    });
  });

  it("labels in Japanese first and keeps the rest of the layout", () => {
    expect(layer("label_city")).toMatchObject({
      layout: {
        "text-field": ["coalesce", ["get", "name:ja"], ["get", "name"]],
        "text-size": 14,
      },
      paint: { "text-color": "#273B33", "text-halo-color": "#FFFEFA" },
    });
  });

  it("keeps a label that is not a name, and an unknown layer, as they are", () => {
    expect(layer("road_shield")).toMatchObject({
      layout: { "icon-image": "shield", "text-field": ["get", "ref"] },
    });
    expect(layer("unknown_layer")).toEqual(
      style.layers.find((each) => each.id === "unknown_layer"),
    );
  });

  it("hides road numbers", () => {
    expect(layer("highway-shield-non-us")).toMatchObject({
      layout: { visibility: "none" },
    });
  });

  it("keeps the sources, so the tiles' attribution still shows", () => {
    expect(tinted.sources).toBe(style.sources);
    expect(style.layers[0]).toMatchObject({
      paint: { "background-color": "#fff" },
    });
  });
});
