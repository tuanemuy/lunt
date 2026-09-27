import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { BusinessRuleError } from "@repo/core/domain/error";

declare const geoPointBrand: unique symbol;
declare const geoBoundsBrand: unique symbol;

/** Latitude in [-90, 90], longitude in [-180, 180]. */
export type GeoPoint = Readonly<{ latitude: number; longitude: number }> & {
  readonly [geoPointBrand]: true;
};

/**
 * Axis-aligned rectangle whose south-west corner is at or below / left of
 * its north-east corner. Rectangles crossing the 180° meridian are not
 * representable.
 */
export type GeoBounds = Readonly<{
  southWest: GeoPoint;
  northEast: GeoPoint;
}> & { readonly [geoBoundsBrand]: true };

const inRange = (value: number, min: number, max: number): boolean =>
  Number.isFinite(value) && value >= min && value <= max;

export const GeoPoint = {
  create: (latitude: number, longitude: number): GeoPoint => {
    if (!inRange(latitude, -90, 90) || !inRange(longitude, -180, 180)) {
      throw new BusinessRuleError(
        CommonErrorCode.InvalidGeoPoint,
        `Invalid coordinates: ${latitude}, ${longitude}`,
      );
    }
    return { latitude, longitude } as GeoPoint;
  },
  equals: (a: GeoPoint, b: GeoPoint): boolean =>
    a.latitude === b.latitude && a.longitude === b.longitude,
};

export const GeoBounds = {
  create: (southWest: GeoPoint, northEast: GeoPoint): GeoBounds => {
    if (
      southWest.latitude > northEast.latitude ||
      southWest.longitude > northEast.longitude
    ) {
      throw new BusinessRuleError(
        CommonErrorCode.InvalidGeoBounds,
        "South-west corner must not be north or east of the north-east corner",
      );
    }
    return { southWest, northEast } as GeoBounds;
  },
  /** Edges are inclusive. */
  contains: (bounds: GeoBounds, point: GeoPoint): boolean =>
    point.latitude >= bounds.southWest.latitude &&
    point.latitude <= bounds.northEast.latitude &&
    point.longitude >= bounds.southWest.longitude &&
    point.longitude <= bounds.northEast.longitude,
};
