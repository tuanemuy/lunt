import type { OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import { Participation } from "@repo/core/domain/occasion/participation";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireParticipation } from "./participations";

export type ExcludeParticipantInput = Readonly<{
  occasionId: OccasionId;
  placeId: PlaceId;
}>;

/**
 * The occasion's operator dissolves a place's participation without
 * approval or reason, whether the place has a steward, however it came to
 * take part and whatever the holding status (`spec/usecases/occasion.md`
 * 「excludeParticipant」; EVT-09, EVT-13 / EM-01). Deletes the
 * participation and emits `occasion.participation_dissolved`
 * (`cause: "excluded"`). Cannot be undone.
 *
 * - `ForbiddenError` (`manage_target` on the occasion).
 * - `NotFoundError` `PARTICIPATION_NOT_FOUND` when already dissolved,
 *   also when a concurrent withdrawal or exclusion commits first.
 */
export async function excludeParticipant({
  container,
  actor,
  input,
}: ActorServiceArgs<ExcludeParticipantInput>): Promise<void> {
  const now = container.clock.now();
  await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "occasion",
      id: input.occasionId,
    });
    const read = await requireParticipation(ctx, input);
    const eventDrafts = Participation.exclude(read.entity, now);
    await ctx.participationRepository.delete(
      read.entity.key,
      read.expectedVersion,
    );
    ctx.collectEvents(eventDrafts);
  });
}
