import type {
  ListingId,
  OccasionId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { BusinessRuleError } from "@repo/core/domain/error";
import { OccasionErrorCode } from "@repo/core/domain/occasion/errorCode";
import { Participation } from "@repo/core/domain/occasion/participation";
import { ForbiddenError, NotFoundError } from "../errors";
import { requireOccasion } from "../occasion/managedOccasion";
import {
  participationDetails,
  placeHasSteward,
  requireParticipantPlace,
} from "../occasion/participations";
import type { ServiceArgs } from "../types";

export type DevEstablishParticipationInput = Readonly<{
  occasionId: OccasionId;
  placeId: PlaceId;
  listingIds: readonly ListingId[];
  dates: readonly LocalDate[];
}>;

/** The place has no steward: its participations are added directly. */
export const DEV_PLACE_HAS_NO_STEWARD = "DEV_PLACE_HAS_NO_STEWARD";

/**
 * Development tool: makes a place with a steward a participant the way
 * approving a participation application will (`Participation.establish`,
 * `occasion.participation_established`), so the manual-test seed
 * (`devSeed`) can prepare participations without filing and approving
 * applications (design.md D-22); a place without a steward goes through
 * `addParticipationDirectly` instead. The details are checked as
 * a submission checks them (dates within the period, attachable
 * listings); the approval's premises (holding status, cancellation) are
 * not, so a participation of an occasion that has since ended can be
 * seeded. Refused unless the development tools are on.
 *
 * - `NotFoundError` without the occasion or the place;
 *   `DEV_PLACE_HAS_NO_STEWARD` when the place has no steward.
 * - `BusinessRuleError` `OCCASION_ALREADY_PARTICIPATING`,
 *   `OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD`,
 *   `OCCASION_LISTING_NOT_ATTACHABLE`.
 */
export async function devEstablishParticipation({
  container,
  input,
}: ServiceArgs<DevEstablishParticipationInput>): Promise<void> {
  if (!container.runtime.devTools) {
    throw new ForbiddenError(
      "DEV_TOOLS_DISABLED",
      "Development tools are disabled",
    );
  }
  const now = container.clock.now();
  const key = { occasionId: input.occasionId, placeId: input.placeId };
  await container.unitOfWorkProvider.run(async (ctx) => {
    const occasion = (await requireOccasion(ctx, input.occasionId)).entity;
    await requireParticipantPlace(ctx, input.placeId);
    if (!(await placeHasSteward(ctx, input.placeId))) {
      throw new NotFoundError(
        DEV_PLACE_HAS_NO_STEWARD,
        `Place ${input.placeId} has no steward`,
      );
    }
    if ((await ctx.participationRepository.findById(key)) !== null) {
      throw new BusinessRuleError(
        OccasionErrorCode.AlreadyParticipating,
        "The place already takes part in the occasion",
      );
    }
    const details = await participationDetails(
      ctx,
      input,
      {
        placeId: input.placeId,
        period: occasion.content.period,
        today: LocalDate.fromInstant(now),
      },
      null,
    );
    const { entity, eventDrafts } = Participation.establish(
      { key, details },
      now,
    );
    await ctx.participationRepository.insert(entity);
    ctx.collectEvents(eventDrafts);
  });
}
