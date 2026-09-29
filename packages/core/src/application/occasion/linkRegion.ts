import type { OccasionId, RegionId } from "@repo/core/domain/common/ids";
import { VisibilityPolicy } from "@repo/core/domain/discovery/visibilityPolicy";
import { RegionLink } from "@repo/core/domain/occasion/regionLink";
import { authorizeOnTarget } from "../authority/access";
import { requireRegion } from "../region/regions";
import type { ActorServiceArgs } from "../types";
import { requireOccasion } from "./managedOccasion";
import { type RegionLinkView, regionLinkView } from "./regionLinks";

export type LinkRegionInput = Readonly<{
  occasionId: OccasionId;
  regionId: RegionId;
}>;

/**
 * The occasion's operator links a viewable region as a holding region,
 * without the region's approval (`spec/usecases/occasion.md`
 * 「linkRegion」; EVT-05, EVT-13 / EM-03). Emits `occasion.region_linked`.
 * Not an idempotent create: a resend after it linked answers
 * `OCCASION_REGION_ALREADY_LINKED`.
 *
 * - `ForbiddenError` (`manage_target` on the occasion).
 * - `NotFoundError` `OCCASION_NOT_FOUND` / `REGION_NOT_FOUND`.
 * - `BusinessRuleError` `OCCASION_REGION_ALREADY_LINKED`,
 *   `OCCASION_REGION_LINK_DETACHED`, `OCCASION_REGION_NOT_VIEWABLE`.
 * - `ConflictError` when a link of the same pair commits first.
 */
export async function linkRegion({
  container,
  actor,
  input,
}: ActorServiceArgs<LinkRegionInput>): Promise<RegionLinkView> {
  const now = container.clock.now();
  const key = { occasionId: input.occasionId, regionId: input.regionId };
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "occasion",
      id: input.occasionId,
    });
    await requireOccasion(ctx, input.occasionId);
    const region = (await requireRegion(ctx, input.regionId)).entity;
    const existing = await ctx.regionLinkRepository.findById(key);
    const { entity, eventDrafts } = RegionLink.link(
      existing?.entity ?? null,
      key,
      { regionViewable: VisibilityPolicy.isRegionViewable(region) },
      now,
    );
    await ctx.regionLinkRepository.insert(entity);
    ctx.collectEvents(eventDrafts);
    return regionLinkView(entity);
  });
}
