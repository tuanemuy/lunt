import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { OccasionId, RegionId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import type { Publication } from "@repo/core/domain/common/publication";
import type { RegionLinkStatus } from "@repo/core/domain/occasion/regionLink";
import type { RegionName } from "@repo/core/domain/region/values";
import { authorizeOnTarget } from "../authority/access";
import { requireExistingTarget } from "../authority/targets";
import {
  coverIdOf,
  coverView,
  displayRefsOf,
  type PhotoView,
} from "../place/photos";
import type { ActorServiceArgs } from "../types";
import { present } from "./participationViews";

export type ListOccasionRegionLinksInput = Readonly<{
  occasionId: OccasionId;
  pagination: Pagination;
}>;

export type OccasionRegionLinkView = Readonly<{
  status: RegionLinkStatus;
  linkedAt: Date;
  region: Readonly<{
    id: RegionId;
    name: RegionName | null;
    /** The region's first photo. */
    cover: PhotoView | null;
    publication: Publication;
    suspended: boolean;
  }>;
}>;

export type OccasionRegionLinksView = Readonly<{
  items: readonly OccasionRegionLinkView[];
  count: number;
}>;

/**
 * The occasion's holding regions in link order — `linked` ones and those
 * the region's operator `detached` — with each region's name, cover,
 * publication and suspension, unpublished and suspended ones included
 * (`spec/usecases/occasion.md` 「listOccasionRegionLinks」; EVT-05, EVT-13
 * / EM-03).
 *
 * - `NotFoundError` (`OCCASION_NOT_FOUND`) without the occasion, checked
 *   before access.
 * - `ForbiddenError` (`manage_target` on the occasion).
 */
export async function listOccasionRegionLinks({
  container,
  actor,
  input,
}: ActorServiceArgs<ListOccasionRegionLinksInput>): Promise<OccasionRegionLinksView> {
  const pagination = Pagination.create(input.pagination);
  await requireExistingTarget(container.stewardedTargetDirectory, {
    kind: "occasion",
    id: input.occasionId,
  });
  const { page, regions } = await container.unitOfWorkProvider.run(
    async (ctx) => {
      await authorizeOnTarget(ctx, actor, "manage_target", {
        kind: "occasion",
        id: input.occasionId,
      });
      const page = await ctx.regionLinkRepository.findByOccasion(
        input.occasionId,
        pagination,
      );
      const batches = await Promise.all(
        IdBatch.chunks(page.items.map((link) => link.key.regionId)).map(
          (batch) => ctx.regionRepository.findByIds(batch),
        ),
      );
      return { page, regions: new Map(batches.flat().map((r) => [r.id, r])) };
    },
  );
  const refs = await displayRefsOf(
    container.photoStorage,
    [...regions.values()].flatMap((region) => {
      const id = coverIdOf(region.content.photos);
      return id === null ? [] : [id];
    }),
  );
  return {
    items: page.items.map((link) => {
      const region = present(regions, link.key.regionId);
      return {
        status: link.status,
        linkedAt: link.linkedAt,
        region: {
          id: region.id,
          name: region.content.name,
          cover: coverView(refs, coverIdOf(region.content.photos)),
          publication: region.publication,
          suspended: region.suspension.suspended,
        },
      };
    }),
    count: page.count,
  };
}
