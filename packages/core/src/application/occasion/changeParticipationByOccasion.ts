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
  placeHasSteward,
  requireParticipation,
} from "./participations";

export type ChangeParticipationByOccasionInput = ParticipationDetailsFields &
  Readonly<{
    occasionId: OccasionId;
    placeId: PlaceId;
    /** The participation's version the edit started from. */
    version: Version;
  }>;

/**
 * The occasion's operator replaces the details of a participating place
 * without a steward, however the participation came about and whatever
 * the holding status (`spec/usecases/occasion.md`
 * 「changeParticipationByOccasion」; EVT-10, EVT-13 / CM-04). A change
 * emits `occasion.participation_changed` (`changedBy: "occasion"`); equal
 * details write nothing.
 *
 * - `NotFoundError` `PARTICIPATION_NOT_FOUND` once dissolved;
 *   checked before access.
 * - `ForbiddenError` (`manage_target` on the occasion).
 * - `BusinessRuleError` `OCCASION_PLACE_HAS_STEWARD` (a steward took
 *   over; decided before the details and the version), then
 *   `OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD`,
 *   `OCCASION_LISTING_NOT_ATTACHABLE`.
 * - `ConflictError` when the edit started from an older version or loses
 *   the optimistic lock.
 */
export async function changeParticipationByOccasion({
  container,
  actor,
  input,
}: ActorServiceArgs<ChangeParticipationByOccasionInput>): Promise<ParticipationContentView> {
  const now = container.clock.now();
  const today = LocalDate.fromInstant(now);
  const key = { occasionId: input.occasionId, placeId: input.placeId };
  return container.unitOfWorkProvider.run(async (ctx) => {
    const read = await requireParticipation(ctx, key);
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "occasion",
      id: input.occasionId,
    });
    const [occasion, hasSteward] = await Promise.all([
      requireOccasion(ctx, input.occasionId),
      placeHasSteward(ctx, input.placeId),
    ]);
    const facts = { placeHasSteward: hasSteward };
    // A steward taking over answers before the details and the version
    // (spec/domains/index.md 「編集の競合」); unchanged details only check it.
    Participation.changeByOccasion(
      read.entity,
      read.entity.details,
      facts,
      now,
    );
    const period = occasion.entity.content.period;
    const details = await participationDetails(
      ctx,
      input,
      { placeId: input.placeId, period, today },
      read.entity.details,
    );
    const { entity, eventDrafts } = Participation.changeByOccasion(
      read.entity,
      details,
      facts,
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
