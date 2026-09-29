import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { Place } from "@repo/core/domain/place/place";
import type { PlaceName } from "@repo/core/domain/place/profile";
import { authorizeOnTarget } from "../authority/access";
import { requireExistingTarget } from "../authority/targets";
import type { ActorServiceArgs } from "../types";

export type ListAffiliatedPlacesInput = Readonly<{
  regionId: RegionId;
  pagination: Pagination;
}>;

export type AffiliatedPlaceView = Readonly<{
  placeId: PlaceId;
  name: PlaceName;
  operatingStatus: OperatingStatus;
  /** 運営による非公開. */
  suspended: boolean;
}>;

export type AffiliatedPlacesView = Readonly<{
  items: readonly AffiliatedPlaceView[];
  /** Every place affiliated with the region, not just this page. */
  count: number;
}>;

/**
 * The region's operator (`manage_target`) reads the places affiliated
 * with it, newest affiliation first, closed and suspended ones included
 * with their state (REG-08, REG-13). Pending affiliation and leave
 * applications are not included.
 *
 * - `NotFoundError` (`REGION_NOT_FOUND`) without the region, checked
 *   before access.
 * - `ForbiddenError` (`manage_target`).
 * - `BusinessRuleError` `COMMON_INVALID_INPUT` for a pagination out of
 *   bounds.
 */
export async function listAffiliatedPlaces({
  container,
  actor,
  input,
}: ActorServiceArgs<ListAffiliatedPlacesInput>): Promise<AffiliatedPlacesView> {
  await requireExistingTarget(container.stewardedTargetDirectory, {
    kind: "region",
    id: input.regionId,
  });
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "region",
      id: input.regionId,
    });
    const pagination = Pagination.create(input.pagination);
    const page = await ctx.placeAffiliationsRepository.findAffiliatedPlaces(
      input.regionId,
      pagination,
    );
    const places = await ctx.placeRepository.findByIds(page.items);
    return { page, places };
  });
  const places = new Map(read.places.map((place) => [place.id, place]));
  return {
    items: read.page.items.flatMap((id): AffiliatedPlaceView[] => {
      const place = places.get(id);
      if (place === undefined) return [];
      return [
        {
          placeId: place.id,
          name: place.profile.name,
          operatingStatus: place.operatingStatus,
          suspended: Place.isSuspended(place),
        },
      ];
    }),
    count: read.page.count,
  };
}
