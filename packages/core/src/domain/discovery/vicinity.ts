import type { GeoPoint } from "@repo/core/domain/common/geo";
import { BusinessRuleError } from "@repo/core/domain/error";
import { DiscoveryErrorCode } from "./errorCode";
import { Geo } from "./geo";
import type { RegionFootprint } from "./regionFootprint";

declare const vicinityBrand: unique symbol;

/** The circle around a viewer's position; the radius is one setting. */
export type Vicinity = Readonly<{ center: GeoPoint; radiusMeters: number }> & {
  readonly [vicinityBrand]: true;
};

export const Vicinity = {
  /** `DISCOVERY_INVALID_VICINITY` unless the radius is positive and finite. */
  create: (center: GeoPoint, radiusMeters: number): Vicinity => {
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
      throw new BusinessRuleError(
        DiscoveryErrorCode.InvalidVicinity,
        `Vicinity radius must be a positive finite number: ${radiusMeters}`,
      );
    }
    return { center, radiusMeters } as Vicinity;
  },
  /**
   * Some point of the footprint (`RegionFootprint.of(…, "reference")`) is
   * within the vicinity — the only test of a region being nearby.
   */
  includesRegion: (vicinity: Vicinity, footprint: RegionFootprint): boolean =>
    footprint.some((point) => Geo.within(vicinity, point.location)),
};
