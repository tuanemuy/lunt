import type { PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { Pagination } from "@repo/core/domain/common/pagination";
import { authorizeOnTarget } from "../authority/access";
import { requireExistingTarget } from "../authority/targets";
import { displayRefsOf } from "../place/photos";
import type { ActorServiceArgs } from "../types";
import { listingCoverIds, readListings } from "./attachedListings";
import {
  attachedIdsOf,
  type OccasionStateView,
  occasionCoverIds,
  occasionStateView,
  type ParticipationView,
  participationView,
  present,
  readOccasions,
} from "./participationViews";

export type GetPlaceParticipationsInput = Readonly<{
  placeId: PlaceId;
  pagination: Pagination;
}>;

export type PlaceParticipationView = Readonly<{
  occasion: OccasionStateView;
  participation: ParticipationView;
}>;

export type PlaceParticipationsView = Readonly<{
  items: readonly PlaceParticipationView[];
  count: number;
}>;

/**
 * The occasions the place takes part in, newest participation first, with
 * each occasion's name, cover, period, publication, suspension and holding
 * status (unpublished, suspended, cancelled and ended ones included) and the
 * participation's listings (deleted ones included), dates and
 * out-of-period dates (`spec/usecases/occasion.md`
 * 「getPlaceParticipations」; EVT-01, EVT-02, EVT-03 / SM-06).
 *
 * - `NotFoundError` (`PLACE_NOT_FOUND`) without the place, checked
 *   before access.
 * - `ForbiddenError` (`act_as_place` on the place; no absence proxy).
 */
export async function getPlaceParticipations({
  container,
  actor,
  input,
}: ActorServiceArgs<GetPlaceParticipationsInput>): Promise<PlaceParticipationsView> {
  const pagination = Pagination.create(input.pagination);
  const today = LocalDate.fromInstant(container.clock.now());
  await requireExistingTarget(container.stewardedTargetDirectory, {
    kind: "place",
    id: input.placeId,
  });
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "act_as_place", {
      kind: "place",
      id: input.placeId,
    });
    const page = await ctx.participationRepository.findByPlace(
      input.placeId,
      pagination,
    );
    const [occasions, place, listings] = await Promise.all([
      readOccasions(
        ctx,
        page.items.map((p) => p.key.occasionId),
      ),
      ctx.placeRepository.findById(input.placeId),
      readListings(ctx, attachedIdsOf(page.items)),
    ]);
    return { page, occasions, place: place?.entity ?? null, listings };
  });
  const { page, occasions, place, listings } = read;
  const refs = await displayRefsOf(container.photoStorage, [
    ...occasionCoverIds(occasions.values()),
    ...listingCoverIds(listings.values()),
  ]);
  return {
    items: page.items.map((p) => {
      const occasion = present(occasions, p.key.occasionId);
      return {
        occasion: occasionStateView(occasion, today, refs),
        participation: participationView(
          p,
          occasion.content.period,
          listings,
          place,
          today,
          refs,
        ),
      };
    }),
    count: page.count,
  };
}
