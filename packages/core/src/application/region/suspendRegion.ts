import type { RegionId } from "@repo/core/domain/common/ids";
import { Region } from "@repo/core/domain/region/region";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireRegion } from "./regions";

export type SuspendRegionInput = Readonly<{ regionId: RegionId }>;

/**
 * An operator suspends a region, with or without stewards and whatever
 * its publication (MOD-07). The publication state, affiliations and
 * occasion links are left as they are — `VisibilityPolicy` hides it.
 *
 * - `region.suspended`.
 * - `ForbiddenError` without `operate_service`.
 * - `NotFoundError` without the region.
 * - `BusinessRuleError` `REGION_ALREADY_SUSPENDED`.
 * - `ConflictError` when a concurrent save commits first.
 */
export async function suspendRegion({
  container,
  actor,
  input,
}: ActorServiceArgs<SuspendRegionInput>): Promise<Region> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const read = await requireRegion(ctx, input.regionId);
    const { entity, eventDrafts } = Region.suspend(read.entity, now);
    await ctx.regionRepository.save(entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
}
