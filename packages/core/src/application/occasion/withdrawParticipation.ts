import type { OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import { Participation } from "@repo/core/domain/occasion/participation";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireParticipation } from "./participations";

export type WithdrawParticipationInput = Readonly<{
  occasionId: OccasionId;
  placeId: PlaceId;
}>;

/**
 * The place's steward withdraws from the occasion without approval,
 * whatever its holding status, publication or suspension
 * (`spec/usecases/occasion.md` 「withdrawParticipation」; EVT-03 / CM-04).
 * Deletes the participation and emits `occasion.participation_dissolved`
 * (`cause: "withdrawn"`). Cannot be undone.
 *
 * - `ForbiddenError` (`act_as_place` on the place; no absence proxy).
 * - `NotFoundError` `PARTICIPATION_NOT_FOUND` when already dissolved,
 *   also when a concurrent exclusion or withdrawal commits first.
 */
export async function withdrawParticipation({
  container,
  actor,
  input,
}: ActorServiceArgs<WithdrawParticipationInput>): Promise<void> {
  const now = container.clock.now();
  await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "act_as_place", {
      kind: "place",
      id: input.placeId,
    });
    const read = await requireParticipation(ctx, input);
    const eventDrafts = Participation.withdraw(read.entity, now);
    await ctx.participationRepository.delete(
      read.entity.key,
      read.expectedVersion,
    );
    ctx.collectEvents(eventDrafts);
  });
}
