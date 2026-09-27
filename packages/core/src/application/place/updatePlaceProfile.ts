import type { PlaceId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type { Version } from "@repo/core/domain/common/version";
import { Place } from "@repo/core/domain/place/place";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { claimNewPhotos } from "./photos";
import { assertEditedVersion, requirePlace } from "./places";
import { buildPlaceProfile, type PlaceProfileFields } from "./profileInput";

export type UpdatePlaceProfileInput = Readonly<{
  placeId: PlaceId;
  /** The version the edit started from. */
  version: Version;
  /** The whole profile; photos kept and newly added, in display order. */
  profile: PlaceProfileFields;
}>;

/**
 * Replaces a place's profile without an application (SHP-06, SHP-13,
 * MOD-06): its steward, or an operator while it has none
 * (`manage_target`). Also while suspended. The operating status does not
 * change. Newly added photos become the place's; dropped ones are
 * released (`photos.released`). An unchanged profile writes nothing.
 *
 * - `ForbiddenError` (`manage_target`), also when a steward is appointed
 *   or removed before the commit.
 * - `NotFoundError` without the place.
 * - `ConflictError` when `version` is not the stored one, or on an
 *   optimistic-lock conflict of the place or a photo.
 * - `BusinessRuleError` `PLACE_INVALID_NAME`, `PLACE_DUPLICATE_PHOTO`,
 *   `AREA_TOWN_NOT_FOUND`, `MEDIA_PHOTO_*`.
 */
export async function updatePlaceProfile({
  container,
  actor,
  input,
}: ActorServiceArgs<UpdatePlaceProfileInput>): Promise<Place> {
  const profile = await buildPlaceProfile(container, input.profile);
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "place",
      id: input.placeId,
    });
    const read = await requirePlace(ctx, input.placeId);
    assertEditedVersion(read.entity, input.version);
    const { entity, eventDrafts } = Place.updateProfile(
      read.entity,
      profile,
      now,
    );
    if (entity === read.entity) return entity;
    const current = new Set(PhotoSet.photoIds(read.entity.profile.photos));
    await claimNewPhotos(
      ctx,
      PhotoSet.photoIds(entity.profile.photos).filter((id) => !current.has(id)),
      Place.ref(entity),
      actor,
    );
    await ctx.placeRepository.save(entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
}
