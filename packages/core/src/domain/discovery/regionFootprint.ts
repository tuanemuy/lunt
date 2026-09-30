import type { Address } from "@repo/core/domain/common/address";
import type { GeoPoint } from "@repo/core/domain/common/geo";
import type { Place } from "@repo/core/domain/place/place";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import type { Scene } from "./scene";
import { Standing } from "./standing";
import { VisibilityPolicy } from "./visibilityPolicy";

export type FootprintPoint = Readonly<{ address: Address; location: GeoPoint }>;

/** The region's own point first, then its shown affiliated places'. */
export type RegionFootprint = readonly [FootprintPoint, ...FootprintPoint[]];

/**
 * The region itself, then each of `places` (its affiliated places, in the
 * given order) that is viewable and admitted by `scene`. Area and vicinity
 * tests and the distance to a region use `reference` (closed places count,
 * V-16); a region's map extent uses `discovery`.
 */
const of = (
  region: PublishedRegion,
  places: readonly Pick<Place, "profile" | "suspension" | "operatingStatus">[],
  scene: Scene,
): RegionFootprint => [
  { address: region.content.address, location: region.content.location },
  ...places
    .filter(
      (place) =>
        VisibilityPolicy.isPlaceViewable(place) &&
        VisibilityPolicy.admits(scene, Standing.ofPlace(place)),
    )
    .map((place) => ({
      address: place.profile.address,
      location: place.profile.location,
    })),
];

/**
 * The only definition of which affiliated places a region's area and
 * vicinity tests, distance and map extent rest on
 * (`spec/domains/discovery.md` 「RegionFootprint」).
 */
export const RegionFootprint = {
  of,
  locations: (
    footprint: RegionFootprint,
  ): readonly [GeoPoint, ...GeoPoint[]] => {
    const [first, ...rest] = footprint;
    return [first.location, ...rest.map((point) => point.location)];
  },
};
