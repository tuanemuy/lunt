import type { OccasionId, RegionId } from "@repo/core/domain/common/ids";
import { RegionLink } from "@repo/core/domain/occasion/regionLink";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import {
  type RegionLinkView,
  regionLinkView,
  requireRegionLink,
} from "./regionLinks";

export type RestoreRegionLinkInput = Readonly<{
  regionId: RegionId;
  occasionId: OccasionId;
}>;

/**
 * The region's operator revokes a detach; the link is `linked` again with
 * its first `linkedAt` (`spec/usecases/occasion.md` 「restoreRegionLink」;
 * REG-11, REG-13 / RM-03). No domain event.
 *
 * - `ForbiddenError` (`manage_target` on the region).
 * - `NotFoundError` `REGION_LINK_NOT_FOUND` when there is no link.
 * - `BusinessRuleError` `OCCASION_REGION_LINK_NOT_DETACHED`.
 * - `ConflictError` when another save of the link commits first.
 */
export async function restoreRegionLink({
  container,
  actor,
  input,
}: ActorServiceArgs<RestoreRegionLinkInput>): Promise<RegionLinkView> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "region",
      id: input.regionId,
    });
    const read = await requireRegionLink(ctx, input);
    const { entity } = RegionLink.restore(read.entity, now);
    await ctx.regionLinkRepository.save(entity, read.expectedVersion);
    return regionLinkView(entity);
  });
}
