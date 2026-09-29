import type { RegionId } from "@repo/core/domain/common/ids";
import { Region } from "@repo/core/domain/region/region";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireRegion } from "./regions";

export type UnpublishRegionInput = Readonly<{ regionId: RegionId }>;

/**
 * The region's operator (`manage_target`) unpublishes a published region
 * (`byManager`; REG-07, REG-13). Affiliations, occasion links and the
 * places and listings are left as they are.
 *
 * - `region.unpublished` (`reason: "byManager"`).
 * - `ForbiddenError` (`manage_target`).
 * - `NotFoundError` without the region.
 * - `BusinessRuleError`, in this order: `REGION_SUSPENDED`,
 *   `COMMON_PUBLICATION_INVALID_TRANSITION`.
 * - `ConflictError` when a concurrent save commits first.
 */
export async function unpublishRegion({
  container,
  actor,
  input,
}: ActorServiceArgs<UnpublishRegionInput>): Promise<Region> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "region",
      id: input.regionId,
    });
    const read = await requireRegion(ctx, input.regionId);
    const { entity, eventDrafts } = Region.unpublish(read.entity, now);
    await ctx.regionRepository.save(entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
}
