import type { OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { Version } from "@repo/core/domain/common/version";
import { Participation } from "@repo/core/domain/occasion/participation";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireOccasion } from "./managedOccasion";
import {
  assertEditedVersion,
  type ParticipationContentView,
  type ParticipationDetailsFields,
  participationContentView,
  participationDetails,
  requireParticipation,
} from "./participations";

export type ChangeParticipationByPlaceInput = ParticipationDetailsFields &
  Readonly<{
    occasionId: OccasionId;
    placeId: PlaceId;
    /** The participation's version the edit started from. */
    version: Version;
  }>;

/**
 * The place's steward replaces the attached listings and dates without
 * approval, whatever the occasion's holding status, publication or
 * suspension (`spec/usecases/occasion.md` 「changeParticipationByPlace」;
 * EVT-02 / CM-04). A change emits `occasion.participation_changed`
 * (`changedBy: "place"`); equal details write nothing.
 *
 * - `NotFoundError` `PARTICIPATION_NOT_FOUND` once dissolved;
 *   checked before access.
 * - `ForbiddenError` (`act_as_place` on the place; no absence proxy).
 * - `BusinessRuleError` `OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD`,
 *   `OCCASION_LISTING_NOT_ATTACHABLE`.
 * - `ConflictError` when the edit started from an older version or loses
 *   the optimistic lock.
 */
export async function changeParticipationByPlace({
  container,
  actor,
  input,
}: ActorServiceArgs<ChangeParticipationByPlaceInput>): Promise<ParticipationContentView> {
  const now = container.clock.now();
  const today = LocalDate.fromInstant(now);
  const key = { occasionId: input.occasionId, placeId: input.placeId };
  return container.unitOfWorkProvider.run(async (ctx) => {
    const read = await requireParticipation(ctx, key);
    await authorizeOnTarget(ctx, actor, "act_as_place", {
      kind: "place",
      id: input.placeId,
    });
    const period = (await requireOccasion(ctx, input.occasionId)).entity.content
      .period;
    const details = await participationDetails(
      ctx,
      input,
      { placeId: input.placeId, period, today },
      read.entity.details,
    );
    const { entity, eventDrafts } = Participation.changeByPlace(
      read.entity,
      details,
      now,
    );
    assertEditedVersion(read.entity, input.version);
    if (entity !== read.entity) {
      await ctx.participationRepository.save(entity, read.expectedVersion);
      ctx.collectEvents(eventDrafts);
    }
    return participationContentView(entity, period);
  });
}
