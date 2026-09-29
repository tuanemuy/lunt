import { RegionId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { RegionContent } from "@repo/core/domain/region/content";
import { Region } from "@repo/core/domain/region/region";
import { authorizeRole } from "../authority/access";
import { ConflictError } from "../errors";
import { claimNewPhotos } from "../place/photos";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import {
  buildRegionContent,
  type RegionContentFields,
  type RegionWithRequirements,
  withRequirements,
} from "./regions";

export type RegisterRegionInput = Readonly<{
  /** Minted by the caller and resent unchanged on failure. */
  regionId: GeneratedId;
  content: RegionContentFields;
}>;

/** The id is already used by a region with other content. */
export const REGION_ID_CONFLICT = "REGION_ID_CONFLICT";

/**
 * An operator registers a region as a draft, publish requirements
 * unchecked, with or without a region steward (REG-12). The photos become
 * the region's. No event.
 *
 * Idempotent create: the same id with `RegionContent.equals` content
 * returns the stored region without writing; other content is a
 * `ConflictError`.
 *
 * - `ForbiddenError` without `operate_service`.
 * - `BusinessRuleError` `AREA_TOWN_NOT_FOUND`, `REGION_INVALID_NAME`,
 *   `REGION_INVALID_DESCRIPTION`, `COMMON_INVALID_TAGLINE`,
 *   `REGION_DUPLICATE_PHOTO`, `MEDIA_PHOTO_NOT_AVAILABLE`,
 *   `MEDIA_PHOTO_NOT_REGISTRANT`, `MEDIA_PHOTO_ALREADY_OWNED`.
 * - `ConflictError` for the id conflict or a photo's optimistic lock.
 */
export async function registerRegion({
  container,
  actor,
  input,
}: ActorServiceArgs<RegisterRegionInput>): Promise<RegionWithRequirements> {
  const id = RegionId.create(input.regionId);
  const content = await buildRegionContent(container, input.content);
  const now = container.clock.now();
  const region = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const found = await ctx.regionRepository.findById(id);
    if (found !== null) {
      if (RegionContent.equals(found.entity.content, content)) {
        return found.entity;
      }
      throw new ConflictError(
        REGION_ID_CONFLICT,
        `Region id ${id} is already used for another region`,
      );
    }
    const { entity } = Region.register({ id, content }, now);
    await claimNewPhotos(
      ctx,
      PhotoSet.photoIds(content.photos),
      Region.ref(entity),
      actor,
    );
    await ctx.regionRepository.insert(entity);
    return entity;
  });
  return withRequirements(region);
}
