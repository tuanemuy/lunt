import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { Address } from "@repo/core/domain/common/address";
import type { PlaceId } from "@repo/core/domain/common/ids";
import {
  Pagination,
  type PaginationResult,
} from "@repo/core/domain/common/pagination";
import { ContentRef } from "@repo/core/domain/common/refs";
import { PlaceMatchCriteria } from "@repo/core/domain/place/matching";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { Place } from "@repo/core/domain/place/place";
import { type PlaceName, PlaceProfile } from "@repo/core/domain/place/profile";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { displayRefsOf, type PhotoView, photoView } from "./photos";

export type MatchPlacesForOperationInput = Readonly<{
  /** Either may be blank or `null`, not both. */
  name: string | null;
  address: string | null;
  pagination: Pagination;
}>;

export type OperationPlaceMatch = Readonly<{
  placeId: PlaceId;
  name: PlaceName;
  address: Address;
  /** The place's own first photo; never substituted. */
  cover: PhotoView | null;
  operatingStatus: OperatingStatus;
  suspended: boolean;
  hasSteward: boolean;
}>;

/**
 * An operator finds places by name and / or address, suspended ones
 * included, most relevant first (SHP-09, SHP-12, SHP-13, LST-15, LST-16,
 * MEM-01, MOD-08, MOD-09). Each carries whether it is suspended and
 * whether it has a steward; a place without photos is shown without one.
 *
 * - `ForbiddenError` without `operate_service`.
 * - `BusinessRuleError` `PLACE_INVALID_MATCH_CRITERIA` when both are blank.
 */
export async function matchPlacesForOperation({
  container,
  actor,
  input,
}: ActorServiceArgs<MatchPlacesForOperationInput>): Promise<
  PaginationResult<OperationPlaceMatch>
> {
  const criteria = PlaceMatchCriteria.create({
    name: input.name,
    address: input.address,
    includeSuspended: true,
  });
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const page = await ctx.placeRepository.match(
      criteria,
      Pagination.create(input.pagination),
    );
    const stewardships =
      page.items.length === 0
        ? []
        : await ctx.stewardshipRepository.findByTargets(
            page.items.map(Place.ref),
          );
    const stewarded = new Set(
      stewardships
        .filter((s) => !Stewardship.isVacant(s))
        .map((s) => ContentRef.key(s.target)),
    );
    return { page, stewarded };
  });
  const covers = read.page.items.flatMap((place) => {
    const cover = PlaceProfile.cover(place.profile);
    return cover === null ? [] : [cover];
  });
  const refs = await displayRefsOf(container.photoStorage, covers);
  return {
    count: read.page.count,
    items: read.page.items.map((place) => {
      const cover = PlaceProfile.cover(place.profile);
      return {
        placeId: place.id,
        name: place.profile.name,
        address: place.profile.address,
        cover: cover === null ? null : photoView(refs, cover),
        operatingStatus: place.operatingStatus,
        suspended: Place.isSuspended(place),
        hasSteward: read.stewarded.has(ContentRef.key(Place.ref(place))),
      };
    }),
  };
}
