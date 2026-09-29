import type { RegionId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { Pagination } from "@repo/core/domain/common/pagination";
import type { RegionLinkStatus } from "@repo/core/domain/occasion/regionLink";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import {
  type OccasionStateView,
  occasionStateView,
  present,
  readOccasions,
} from "./participationViews";

export type ListRegionOccasionLinksInput = Readonly<{
  regionId: RegionId;
  pagination: Pagination;
}>;

export type RegionOccasionLinkView = Readonly<{
  status: RegionLinkStatus;
  linkedAt: Date;
  occasion: OccasionStateView;
}>;

export type RegionOccasionLinksView = Readonly<{
  items: readonly RegionOccasionLinkView[];
  count: number;
}>;

/**
 * The occasions linked to the region, newest link first — `linked` ones
 * and those the region detached — with each occasion's name, period,
 * publication, suspension and holding status, unpublished, suspended and
 * cancelled ones included (`spec/usecases/occasion.md`
 * 「listRegionOccasionLinks」; REG-11, REG-13 / RM-03).
 *
 * - `ForbiddenError` (`manage_target` on the region).
 */
export async function listRegionOccasionLinks({
  container,
  actor,
  input,
}: ActorServiceArgs<ListRegionOccasionLinksInput>): Promise<RegionOccasionLinksView> {
  const pagination = Pagination.create(input.pagination);
  const today = LocalDate.fromInstant(container.clock.now());
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "region",
      id: input.regionId,
    });
    const page = await ctx.regionLinkRepository.findByRegion(
      input.regionId,
      pagination,
    );
    const occasions = await readOccasions(
      ctx,
      page.items.map((link) => link.key.occasionId),
    );
    return {
      items: page.items.map((link) => ({
        status: link.status,
        linkedAt: link.linkedAt,
        occasion: occasionStateView(
          present(occasions, link.key.occasionId),
          today,
        ),
      })),
      count: page.count,
    };
  });
}
