import type { PlaceId } from "@repo/core/domain/common/ids";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import type { Version } from "@repo/core/domain/common/version";
import type { Place } from "@repo/core/domain/place/place";
import type { PlaceRepositories } from "@repo/core/domain/place/ports/unitOfWork";
import { ConflictError, NotFoundError } from "../errors";

export const PLACE_NOT_FOUND = "PLACE_NOT_FOUND";
/** The edit started from a version someone else has saved over since. */
export const PLACE_VERSION_CONFLICT = "PLACE_VERSION_CONFLICT";

/** The place with its version token; `NotFoundError` when there is none. */
export async function requirePlace(
  ctx: PlaceRepositories,
  id: PlaceId,
): Promise<Versioned<Place>> {
  const found = await ctx.placeRepository.findById(id);
  if (found === null) {
    throw new NotFoundError(PLACE_NOT_FOUND, `Place ${id} does not exist`);
  }
  return found;
}

/**
 * 編集の競合: the version the edit started from must still be the stored
 * one, or someone else's save would be overwritten.
 */
export function assertEditedVersion(place: Place, edited: Version): void {
  if (place.version !== edited) {
    throw new ConflictError(
      PLACE_VERSION_CONFLICT,
      `Place ${place.id} changed since version ${edited} was read`,
    );
  }
}
