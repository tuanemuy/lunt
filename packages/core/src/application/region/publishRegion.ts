import type { RegionId } from "@repo/core/domain/common/ids";
import { Region } from "@repo/core/domain/region/region";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireRegion } from "./regions";

export type PublishRegionInput = Readonly<{ regionId: RegionId }>;

/**
 * The region's operator (`manage_target`) publishes a draft or an
 * unpublished region meeting the publish requirements — name, address,
 * location, a photo (REG-07, REG-12, REG-13, MOD-03). A region unpublished
 * by a takedown comes back this way after photos are saved. No event; no
 * version in the request (the optimistic lock guards concurrent writes).
 *
 * - `ForbiddenError` (`manage_target`).
 * - `NotFoundError` without the region.
 * - `BusinessRuleError`, checked in this order: `REGION_SUSPENDED`,
 *   `COMMON_PUBLICATION_INVALID_TRANSITION`,
 *   `REGION_PUBLISH_CONDITION_UNMET` (with the missing requirements).
 * - `ConflictError` when a concurrent save commits first.
 */
export async function publishRegion({
  container,
  actor,
  input,
}: ActorServiceArgs<PublishRegionInput>): Promise<Region> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "region",
      id: input.regionId,
    });
    const read = await requireRegion(ctx, input.regionId);
    const { entity } = Region.publish(read.entity, now);
    await ctx.regionRepository.save(entity, read.expectedVersion);
    return entity;
  });
}
