import type { RegionId } from "@repo/core/domain/common/ids";
import { Region } from "@repo/core/domain/region/region";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireRegion } from "./regions";

export type UnsuspendRegionInput = Readonly<{ regionId: RegionId }>;

/**
 * An operator lifts a region's suspension (MOD-07). The publication state
 * is not rewritten: the region shows in the state it has now — a region
 * whose last photo was taken down meanwhile stays `unpublished`
 * (`photoTakedown`).
 *
 * - `region.unsuspended`.
 * - `ForbiddenError` without `operate_service`.
 * - `NotFoundError` without the region.
 * - `BusinessRuleError` `REGION_NOT_SUSPENDED`.
 * - `ConflictError` when a concurrent save commits first.
 */
export async function unsuspendRegion({
  container,
  actor,
  input,
}: ActorServiceArgs<UnsuspendRegionInput>): Promise<Region> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const read = await requireRegion(ctx, input.regionId);
    const { entity, eventDrafts } = Region.unsuspend(read.entity, now);
    await ctx.regionRepository.save(entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
}
