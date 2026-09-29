import type { RegionId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type { Version } from "@repo/core/domain/common/version";
import { Region } from "@repo/core/domain/region/region";
import { authorizeOnTarget } from "../authority/access";
import { claimNewPhotos } from "../place/photos";
import type { ActorServiceArgs } from "../types";
import {
  assertEditedVersion,
  buildRegionContent,
  type RegionContentFields,
  type RegionWithRequirements,
  requireRegion,
  withRequirements,
} from "./regions";

export type UpdateRegionContentInput = Readonly<{
  regionId: RegionId;
  /** The version the edit started from. */
  version: Version;
  /** The whole content; photos kept and newly added, in display order. */
  content: RegionContentFields;
}>;

/**
 * The region's operator (its steward, or an operator while it has none —
 * `manage_target`) replaces its content (REG-06, REG-13, MOD-03), also
 * while suspended. A published region must keep its publish requirements;
 * a draft or unpublished one is not checked. The publication and the
 * suspension do not change — adding photos does not re-publish a region
 * unpublished by a takedown. Newly added photos become the region's;
 * dropped ones are released (`photos.released`). Unchanged content writes
 * nothing.
 *
 * - `ForbiddenError` (`manage_target`), also when a steward is appointed
 *   or removed before the commit.
 * - `NotFoundError` without the region.
 * - `ConflictError` when `version` is not the stored one, or on an
 *   optimistic-lock conflict of the region or a photo.
 * - `BusinessRuleError` `REGION_PUBLISH_CONDITION_UNMET` (with the missing
 *   requirements), `AREA_TOWN_NOT_FOUND`, `REGION_INVALID_*`,
 *   `REGION_DUPLICATE_PHOTO`, `COMMON_INVALID_TAGLINE`, `MEDIA_PHOTO_*`.
 */
export async function updateRegionContent({
  container,
  actor,
  input,
}: ActorServiceArgs<UpdateRegionContentInput>): Promise<RegionWithRequirements> {
  const content = await buildRegionContent(container, input.content);
  const now = container.clock.now();
  const region = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "region",
      id: input.regionId,
    });
    const read = await requireRegion(ctx, input.regionId);
    assertEditedVersion(read.entity, input.version);
    const { entity, eventDrafts } = Region.updateContent(
      read.entity,
      content,
      now,
    );
    if (entity === read.entity) return entity;
    const current = new Set(PhotoSet.photoIds(read.entity.content.photos));
    await claimNewPhotos(
      ctx,
      PhotoSet.photoIds(entity.content.photos).filter((id) => !current.has(id)),
      Region.ref(entity),
      actor,
    );
    await ctx.regionRepository.save(entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
  return withRequirements(region);
}
