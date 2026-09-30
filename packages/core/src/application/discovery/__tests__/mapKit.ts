import type {
  DiscoveryWorld,
  PlaceSpec,
} from "@repo/core/adapters/do/__conformance__/discoveryFixtures";
import {
  insertPlaces,
  newPlace,
} from "@repo/core/adapters/do/__conformance__/placeFixtures";
import { GeoBounds, GeoPoint } from "@repo/core/domain/common/geo";
import type { Place } from "@repo/core/domain/place/place";
import type { BrowseCriteriaInput } from "../criteria";
import type { BoundsInput } from "../views";
import type { DiscoveryKit } from "./kit";

/*
 * Positions and places for the map and region usecase tests: `BOUNDS`
 * holds every default fixture spot and, with a 4 × 4 grid, has 0.05°
 * cells.
 */

export const at = (latitude: number, longitude: number): GeoPoint =>
  GeoPoint.create(latitude, longitude);

export const boundsInput = (bounds: GeoBounds): BoundsInput => ({
  southWest: bounds.southWest,
  northEast: bounds.northEast,
});

export const BOUNDS = GeoBounds.create(at(35.6, 139.7), at(35.8, 139.9));

export const GRID = { columns: 4, rows: 4 } as const;

/** A spot inside cell (`column`, `row`) of `BOUNDS` × `GRID`. */
export const inCell = (column: number, row: number, dx = 0.025, dy = 0.025) =>
  at(35.6 + 0.05 * row + dy, 139.7 + 0.05 * column + dx);

const DEGREES_PER_METRE = 180 / (Math.PI * 6_371_000);

/** `metres` due north (south when negative) of `origin`. */
export const northOf = (origin: GeoPoint, metres: number) =>
  at(origin.latitude + metres * DEGREES_PER_METRE, origin.longitude);

export const NO_CRITERIA: BrowseCriteriaInput = { areas: [], categoryIds: [] };

/** The area of `SampleAddress.otemachi` (大手町) as the transport sends it. */
export const OTEMACHI = { unit: "area", areaCode: "1000004" } as const;

export const criteriaInput = (
  spec: Partial<BrowseCriteriaInput>,
): BrowseCriteriaInput => ({ ...NO_CRITERIA, ...spec });

export const placeAt = (
  w: DiscoveryWorld,
  location: GeoPoint,
  spec: PlaceSpec = {},
): Promise<Place> =>
  w.place({
    ...spec,
    profile: {
      ...spec.profile,
      location: { latitude: location.latitude, longitude: location.longitude },
    },
  });

/** A place registered at `registeredAt`, at `location`. */
export async function registeredAt(
  k: DiscoveryKit,
  registered: Date,
  location: GeoPoint,
): Promise<Place> {
  const place = newPlace(
    k.w.f.place(),
    {
      location: { latitude: location.latitude, longitude: location.longitude },
    },
    registered,
  );
  await insertPlaces(
    { uow: k.container.unitOfWorkProvider, savedEvents: k.storedEvents },
    place,
  );
  return place;
}
