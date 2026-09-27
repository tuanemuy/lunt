import { PlaceId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { Place } from "@repo/core/domain/place/place";
import { PlaceProfile } from "@repo/core/domain/place/profile";
import { authorizeRole } from "../authority/access";
import { ConflictError } from "../errors";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import { claimNewPhotos } from "./photos";
import { buildPlaceProfile, type PlaceProfileFields } from "./profileInput";

export type RegisterPlaceByProxyInput = Readonly<{
  /** Minted by the caller and resent unchanged on failure. */
  placeId: GeneratedId;
  profile: PlaceProfileFields;
}>;

/** The id is already used by a place with another profile. */
export const PLACE_ID_CONFLICT = "PLACE_ID_CONFLICT";

/**
 * An operator registers a place without an application (SHP-12). The
 * place is open, not suspended and has no steward; no stewardship is
 * created and no event is emitted. The photos become the place's.
 * Duplicates of existing places are not refused.
 *
 * Idempotent create: the same id with a `PlaceProfile.equals` profile
 * returns the stored place without writing; another profile is a
 * `ConflictError`.
 *
 * - `ForbiddenError` without `operate_service`.
 * - `BusinessRuleError` `PLACE_INVALID_NAME`, `PLACE_DUPLICATE_PHOTO`,
 *   `AREA_TOWN_NOT_FOUND`, `MEDIA_PHOTO_NOT_AVAILABLE`,
 *   `MEDIA_PHOTO_NOT_REGISTRANT`, `MEDIA_PHOTO_ALREADY_OWNED`.
 * - `ConflictError` for the id conflict or a photo's optimistic lock.
 */
export async function registerPlaceByProxy({
  container,
  actor,
  input,
}: ActorServiceArgs<RegisterPlaceByProxyInput>): Promise<Place> {
  const id = PlaceId.create(input.placeId);
  const profile = await buildPlaceProfile(container, input.profile);
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const found = await ctx.placeRepository.findById(id);
    if (found !== null) {
      if (PlaceProfile.equals(found.entity.profile, profile)) {
        return found.entity;
      }
      throw new ConflictError(
        PLACE_ID_CONFLICT,
        `Place id ${id} is already used for another place`,
      );
    }
    const { entity: place } = Place.register({ id, profile }, now);
    await claimNewPhotos(
      ctx,
      PhotoSet.photoIds(profile.photos),
      Place.ref(place),
      actor,
    );
    await ctx.placeRepository.insert(place);
    return place;
  });
}
