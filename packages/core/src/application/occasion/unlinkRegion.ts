import type { OccasionId, RegionId } from "@repo/core/domain/common/ids";
import { RegionLink } from "@repo/core/domain/occasion/regionLink";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireRegionLink } from "./regionLinks";

export type UnlinkRegionInput = Readonly<{
  occasionId: OccasionId;
  regionId: RegionId;
}>;

/**
 * The occasion's operator removes a linked region, viewable or not; it
 * can be linked again afterwards (`spec/usecases/occasion.md`
 * 「unlinkRegion」; EVT-05, EVT-13 / EM-03). No domain event.
 *
 * - `NotFoundError` `REGION_LINK_NOT_FOUND` when there is no link;
 *   checked before access.
 * - `ForbiddenError` (`manage_target` on the occasion).
 * - `BusinessRuleError` `OCCASION_REGION_LINK_DETACHED` for a pair the
 *   region's operator detached.
 * - `ConflictError` when a concurrent detach commits first.
 */
export async function unlinkRegion({
  container,
  actor,
  input,
}: ActorServiceArgs<UnlinkRegionInput>): Promise<void> {
  await container.unitOfWorkProvider.run(async (ctx) => {
    const read = await requireRegionLink(ctx, input);
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "occasion",
      id: input.occasionId,
    });
    await ctx.regionLinkRepository.delete(
      RegionLink.unlink(read.entity),
      read.expectedVersion,
    );
  });
}
