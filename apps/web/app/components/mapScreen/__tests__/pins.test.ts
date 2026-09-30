import { describe, expect, it } from "vitest";
import type {
  MapCellItem,
  MapPlaceItem,
  MapRegionItem,
} from "@/presentation/mapView";
import { mapPins, NO_SELECTION, selectionOfPin } from "../pins";

const place = (
  placeId: string,
  latitude: number,
  longitude: number,
  affiliated = false,
): MapPlaceItem => ({
  placeId,
  name: `店 ${placeId}`,
  address: "東京都千代田区大手町1-1-1",
  regionName: null,
  operating: "open",
  photo: null,
  location: { latitude, longitude },
  affiliated,
});

const region: MapRegionItem = {
  regionId: "r1",
  name: "大手町まちあるき",
  tagline: null,
  area: "千代田区・大手町",
  photo: null,
  location: { latitude: 35.685, longitude: 139.766 },
};

const cells: readonly MapCellItem[] = [
  { kind: "single", place: place("a", 35.68, 139.76, true) },
  { kind: "single", place: place("b", 35.69, 139.77) },
  {
    kind: "colocated",
    key: "spot:35.687,139.765",
    location: { latitude: 35.687, longitude: 139.765 },
    places: [place("c", 35.687, 139.765), place("d", 35.687, 139.765)],
  },
  {
    kind: "cluster",
    key: "cluster:3:4",
    count: 5,
    affiliatedCount: 2,
    extent: {
      southWest: { latitude: 35.7, longitude: 139.78 },
      northEast: { latitude: 35.71, longitude: 139.79 },
    },
    anchor: { latitude: 35.705, longitude: 139.785 },
  },
];

describe("mapPins", () => {
  it("draws every cell and region without emphasis while no region is selected", () => {
    const pins = mapPins(cells, [region], NO_SELECTION, null);
    expect(pins[3]?.position).toEqual({ latitude: 35.705, longitude: 139.785 });
    expect(pins.map((pin) => pin.kind)).toEqual([
      "target",
      "target",
      "colocated",
      "cluster",
      "region",
    ]);
    expect(
      pins.every((pin) => pin.kind === "region" || pin.emphasis === undefined),
    ).toBe(true);
  });

  it("tells the selected region's places apart from the others", () => {
    const pins = mapPins(cells, [], { kind: "region", regionId: "r1" }, region);
    const emphasis = pins.map((pin) =>
      pin.kind === "region" ? pin.selected : pin.emphasis,
    );
    expect(emphasis).toEqual(["member", "other", "other", "member", true]);
    expect(pins[3]?.label).toContain("うち大手町まちあるきのお店 2 件");
  });

  it("keeps a spot's pin pressed while one of its places is chosen", () => {
    const spot = cells[2];
    const chosen = spot?.kind === "colocated" ? spot.places[1] : undefined;
    if (spot?.kind !== "colocated" || chosen === undefined) {
      throw new Error("fixture");
    }
    const pins = mapPins(
      cells,
      [],
      { kind: "place", place: chosen, spotKey: spot.key },
      null,
    );
    const pressed = pins.find((pin) => pin.kind === "colocated");
    expect(pressed?.kind === "colocated" && pressed.selected).toBe(true);
  });
});

describe("selectionOfPin", () => {
  const pins = mapPins(cells, [region], NO_SELECTION, null);

  it("selects a place, a spot's list or a region; a cluster only zooms", () => {
    expect(pins.map((pin) => selectionOfPin(pin, cells)?.kind ?? null)).toEqual(
      ["place", "place", "spot", null, "region"],
    );
  });
});
