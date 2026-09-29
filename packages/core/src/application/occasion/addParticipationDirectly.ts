import type { OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { VisibilityPolicy } from "@repo/core/domain/discovery/visibilityPolicy";
import {
  Participation,
  ParticipationDetails,
} from "@repo/core/domain/occasion/participation";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requireOccasion } from "./managedOccasion";
import {
  type ParticipationContentView,
  type ParticipationDetailsFields,
  participationContentView,
  participationDetails,
  placeHasSteward,
  requireParticipantPlace,
} from "./participations";

export type AddParticipationDirectlyInput = ParticipationDetailsFields &
  Readonly<{ occasionId: OccasionId; placeId: PlaceId }>;

/**
 * The occasion's operator makes a viewable place without a steward a
 * participant, with listings and dates, without approval and whatever the
 * holding status (`spec/usecases/occasion.md` 「addParticipationDirectly」;
 * EVT-10, EVT-13 / CM-04). Emits `occasion.participation_established`.
 * Not an idempotent create: the key is the pair, so a resend after it
 * took part answers `OCCASION_ALREADY_PARTICIPATING`.
 *
 * - `ForbiddenError` (`manage_target` on the occasion).
 * - `NotFoundError` `OCCASION_NOT_FOUND` / `PLACE_NOT_FOUND`.
 * - `BusinessRuleError` `OCCASION_ALREADY_PARTICIPATING`,
 *   `OCCASION_PLACE_HAS_STEWARD`, `OCCASION_PLACE_NOT_VIEWABLE`, then
 *   `OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD`,
 *   `OCCASION_LISTING_NOT_ATTACHABLE`.
 * - `ConflictError` when an approval for the same pair commits first.
 */
export async function addParticipationDirectly({
  container,
  actor,
  input,
}: ActorServiceArgs<AddParticipationDirectlyInput>): Promise<ParticipationContentView> {
  const now = container.clock.now();
  const today = LocalDate.fromInstant(now);
  const key = { occasionId: input.occasionId, placeId: input.placeId };
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "occasion",
      id: input.occasionId,
    });
    const occasion = (await requireOccasion(ctx, input.occasionId)).entity;
    const place = await requireParticipantPlace(ctx, input.placeId);
    const [existing, hasSteward] = await Promise.all([
      ctx.participationRepository.findById(key),
      placeHasSteward(ctx, input.placeId),
    ]);
    const facts = {
      placeHasSteward: hasSteward,
      placeViewable: VisibilityPolicy.isPlaceViewable(place),
    };
    // The pair's and the place's facts answer before the details are
    // checked (F-18: a resend after it took part is
    // OCCASION_ALREADY_PARTICIPATING even when its input no longer holds).
    Participation.addDirectly(
      existing?.entity ?? null,
      { key, details: ParticipationDetails.empty() },
      facts,
      now,
    );
    const period = occasion.content.period;
    const details = await participationDetails(
      ctx,
      input,
      { placeId: input.placeId, period, today },
      null,
    );
    const { entity, eventDrafts } = Participation.addDirectly(
      existing?.entity ?? null,
      { key, details },
      facts,
      now,
    );
    await ctx.participationRepository.insert(entity);
    ctx.collectEvents(eventDrafts);
    return participationContentView(entity, period);
  });
}
