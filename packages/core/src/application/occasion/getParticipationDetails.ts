import type { OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { ActorServiceArgs } from "../types";
import { readListings } from "./attachedListings";
import { requireOccasion } from "./managedOccasion";
import {
  authorizeAsPlaceOrOccasion,
  type ParticipationSide,
} from "./participationAccess";
import { placeHasSteward, requireParticipantPlace } from "./participations";
import {
  type OccasionStateView,
  occasionStateView,
  type ParticipationView,
  participationView,
} from "./participationViews";

export type GetParticipationDetailsInput = Readonly<{
  occasionId: OccasionId;
  placeId: PlaceId;
}>;

export type ParticipationDetailsView = Readonly<{
  occasion: OccasionStateView;
  placeId: PlaceId;
  placeHasSteward: boolean;
  /** `null` while the place does not take part. */
  participation: ParticipationView | null;
  /** Which stance allowed the read. */
  side: ParticipationSide;
}>;

/**
 * One place's participation in one occasion with what editing it needs:
 * the occasion's period and states, the attached listings with their
 * states (deleted ones included), the out-of-period dates and whether the
 * place has a steward (`spec/usecases/occasion.md`
 * 「getParticipationDetails」; EVT-02, EVT-10 / CM-04). A pair that does
 * not take part answers with `participation: null`.
 *
 * - `ForbiddenError` unless `act_as_place` on the place or
 *   `manage_target` on the occasion allows.
 * - `NotFoundError` `OCCASION_NOT_FOUND` / `PLACE_NOT_FOUND`.
 */
export async function getParticipationDetails({
  container,
  actor,
  input,
}: ActorServiceArgs<GetParticipationDetailsInput>): Promise<ParticipationDetailsView> {
  const today = LocalDate.fromInstant(container.clock.now());
  return container.unitOfWorkProvider.run(async (ctx) => {
    const side = await authorizeAsPlaceOrOccasion(
      ctx,
      actor,
      input.placeId,
      input.occasionId,
    );
    const occasion = (await requireOccasion(ctx, input.occasionId)).entity;
    const place = await requireParticipantPlace(ctx, input.placeId);
    const [found, hasSteward] = await Promise.all([
      ctx.participationRepository.findById(input),
      placeHasSteward(ctx, input.placeId),
    ]);
    const participation = found?.entity ?? null;
    const listings = await readListings(
      ctx,
      participation?.details.listingIds ?? [],
    );
    return {
      occasion: occasionStateView(occasion, today),
      placeId: input.placeId,
      placeHasSteward: hasSteward,
      participation:
        participation === null
          ? null
          : participationView(
              participation,
              occasion.content.period,
              listings,
              place,
              today,
            ),
      side,
    };
  });
}
