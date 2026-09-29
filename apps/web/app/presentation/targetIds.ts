// Server-only: import from server-function handlers (dynamically) or
// server-only loaders, never from components.
import { NotFoundError } from "@repo/core/application/errors";
import {
  CategoryId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";

/**
 * A target id taken from the URL or a request. An id that cannot be one
 * names no target, so it reads as the target missing (CS-17) rather than
 * as an input error.
 */
export function parseTargetId<T>(
  create: (raw: string) => T,
  raw: string,
  code: string,
): T {
  try {
    return create(raw);
  } catch {
    throw new NotFoundError(code, `No target has the id ${raw}`);
  }
}

export const placeIdOf = (raw: string): PlaceId =>
  parseTargetId(PlaceId.create, raw, "PLACE_NOT_FOUND");

export const listingIdOf = (raw: string): ListingId =>
  parseTargetId(ListingId.create, raw, "LISTING_NOT_FOUND");

export const categoryIdOf = (raw: string): CategoryId =>
  parseTargetId(CategoryId.create, raw, "LISTING_CATEGORY_NOT_FOUND");

export const regionIdOf = (raw: string): RegionId =>
  parseTargetId(RegionId.create, raw, "REGION_NOT_FOUND");

export const occasionIdOf = (raw: string): OccasionId =>
  parseTargetId(OccasionId.create, raw, "OCCASION_NOT_FOUND");
