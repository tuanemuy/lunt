import type { OccasionId, RegionId } from "@repo/core/domain/common/ids";
import { RegionLink } from "@repo/core/domain/occasion/regionLink";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import {
  type RegionLinkView,
  regionLinkView,
  requireRegionLink,
} from "./regionLinks";

export type DetachRegionLinkInput = Readonly<{
  regionId: RegionId;
  occasionId: OccasionId;
}>;

/**
 * The region's operator detaches an occasion's link, viewable or not; the
 * pair stays `detached` and the occasion's side can neither link nor
 * unlink it (`spec/usecases/occasion.md` 「detachRegionLink」; REG-11,
 * REG-13 / RM-03). Emits `occasion.region_link_detached`.
 *
 * - `NotFoundError` `REGION_LINK_NOT_FOUND` when there is no link, also
 *   when a concurrent unlink commits first;
 *   checked before access.
 * - `ForbiddenError` (`manage_target` on the region).
 * - `BusinessRuleError` `OCCASION_REGION_LINK_ALREADY_DETACHED`.
 * - `ConflictError` when a concurrent detach commits first.
 */
export async function detachRegionLink({
  container,
  actor,
  input,
}: ActorServiceArgs<DetachRegionLinkInput>): Promise<RegionLinkView> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const read = await requireRegionLink(ctx, input);
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "region",
      id: input.regionId,
    });
    const { entity, eventDrafts } = RegionLink.detach(read.entity, now);
    await ctx.regionLinkRepository.save(entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return regionLinkView(entity);
  });
}
