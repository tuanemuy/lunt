import {
  Application,
  type ApplicationOf,
  ApplicationTarget,
  SubmissionScope,
} from "@repo/core/domain/application/application";
import {
  ApplicationId,
  type ListingId,
  type OccasionId,
  type PlaceId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { participationDetails } from "../occasion/participations";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import { actingFor, applicationIdConflict } from "./applicant";
import {
  occasionViewability,
  readParticipationFacts,
  readSubmissionFindings,
} from "./facts";

export type SubmitParticipationInput = Readonly<{
  /** Minted by the caller and resent unchanged. */
  applicationId: GeneratedId;
  placeId: PlaceId;
  occasionId: OccasionId;
  /** Listings to attach, in the order entered; repeats are dropped. */
  listingIds: readonly ListingId[];
  /** Days to take part; repeats are dropped and the rest sorted. */
  dates: readonly LocalDate[];
}>;

/**
 * A steward applies, as the place, for its participation in an occasion
 * with listings and days attached — any number of each, none included
 * (EVT-01, APP-04; `spec/usecases/application.md` 「submitParticipation」).
 * Only as a steward: `act_as_place` is recorded as a commit condition
 * (D-17), so a stewardship lost before the commit refuses it. Nothing
 * takes part until the approval. Emits `application.submitted` to the
 * occasion's seat.
 *
 * The occasion is read as an aggregate: its holding status today is the
 * `occasionOpen` fact, its viewability (`VisibilityPolicy`) the viewable
 * target, and its period bounds the days. The listings must be the
 * place's attachable ones (`Listing.attachableIds`: published and not
 * suspended, in any offering phase).
 *
 * Checks, in order: the applicant (`ForbiddenError`), the same id (a
 * resend with the same listings and days returns the stored application
 * without checking them again; other content is `ConflictError`), the
 * premises, the viewable occasion, an active application in the same
 * slot, then the content.
 *
 * - `ForbiddenError`: `act_as_place` refused (an individual cannot apply).
 * - `BusinessRuleError`: `APPLICATION_PLACE_HAS_NO_STEWARD`,
 *   `APPLICATION_OCCASION_NOT_OPEN`, `APPLICATION_ALREADY_PARTICIPATING`,
 *   `APPLICATION_TARGET_NOT_VIEWABLE`, `APPLICATION_ALREADY_ACTIVE`,
 *   `OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD`,
 *   `OCCASION_LISTING_NOT_ATTACHABLE`.
 * - `ConflictError`: the id conflict, a slot taken concurrently.
 */
export async function submitParticipation({
  container,
  actor,
  input,
}: ActorServiceArgs<SubmitParticipationInput>): Promise<
  ApplicationOf<"participation">
> {
  const id = ApplicationId.create(input.applicationId);
  const target = ApplicationTarget.byPlace(input.placeId, {
    kind: "participation",
    occasionId: input.occasionId,
  });
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await actingFor(ctx, actor, target.applicant);
    const found = await ctx.applicationRepository.findById(id);
    if (found !== null) {
      const request = {
        target,
        listingIds: input.listingIds,
        dates: input.dates,
      };
      if (!Application.matchesSubmission(found.entity, request)) {
        throw applicationIdConflict(id);
      }
      return found.entity as ApplicationOf<"participation">;
    }
    const occasion =
      (await ctx.occasionRepository.findById(input.occasionId))?.entity ?? null;
    const admission = SubmissionScope.admit(
      target,
      await readSubmissionFindings(
        ctx,
        target,
        await readParticipationFacts(ctx, target, occasion, now),
        occasionViewability(input.occasionId, occasion),
      ),
    );
    if (occasion === null) throw new Error("An admitted occasion exists");
    const content = await participationDetails(
      ctx,
      input,
      {
        placeId: input.placeId,
        period: occasion.content.period,
        today: LocalDate.fromInstant(now),
      },
      null,
    );
    const submitted = Application.submit(
      { id, admission, reserved: {}, content },
      now,
    );
    await ctx.applicationRepository.insert(submitted.entity);
    ctx.collectEvents(submitted.eventDrafts);
    return submitted.entity;
  });
}
