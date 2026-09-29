import type { PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { Pagination } from "@repo/core/domain/common/pagination";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { readListings } from "./attachedListings";
import {
  attachedIdsOf,
  type OccasionStateView,
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
 * each occasion's name, period, publication, suspension and holding status
 * (unpublished, suspended, cancelled and ended ones included) and the
 * participation's listings (deleted ones included), dates and
 * out-of-period dates (`spec/usecases/occasion.md`
 * 「getPlaceParticipations」; EVT-01, EVT-02, EVT-03 / SM-06).
 *
 * - `ForbiddenError` (`act_as_place` on the place; no absence proxy).
 */
export async function getPlaceParticipations({
  container,
  actor,
  input,
}: ActorServiceArgs<GetPlaceParticipationsInput>): Promise<PlaceParticipationsView> {
  const pagination = Pagination.create(input.pagination);
  const today = LocalDate.fromInstant(container.clock.now());
  return container.unitOfWorkProvider.run(async (ctx) => {
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
    return {
      items: page.items.map((p) => {
        const occasion = present(occasions, p.key.occasionId);
        return {
          occasion: occasionStateView(occasion, today),
          participation: participationView(
            p,
            occasion.content.period,
            listings,
            place?.entity ?? null,
            today,
          ),
        };
      }),
      count: page.count,
    };
  });
}
