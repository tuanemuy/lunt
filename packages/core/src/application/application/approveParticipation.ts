import { Participation } from "@repo/core/domain/occasion/participation";
import type { ActorServiceArgs } from "../types";
import {
  type ApprovalOutcome,
  type ApproveApplicationInput,
  approveApplication,
} from "./approval";

export type ApproveParticipationInput = ApproveApplicationInput;

/**
 * The occasion's steward — the operator by absence proxy for an occasion
 * without one, or by overdue proxy once the review period has passed —
 * approves a participation application (EVT-08, EVT-13, APP-08; CM-01):
 * the place takes part with the application's listings and days
 * (`Participation.establish`, not checked again — a listing suspended or
 * a day left outside a shortened period since stays, and viewers are not
 * shown it), `occasion.participation_established` is stored with
 * `application.approved`, and the occasion is returned as the reflected
 * target. No place or listing state changes; a suspended occasion is
 * joined all the same. When the place has no steward, the occasion ended
 * or was cancelled, or the place already takes part, the application
 * lapses instead (returned, not thrown).
 *
 * - `NotFoundError` (none, or not a participation); `ForbiddenError`.
 * - The status code when not under review; `APPLICATION_AWAITING_STEWARDS`;
 *   `ConflictError` when the application changed since `version`, or a
 *   participation of the place was stored before the commit (a direct
 *   addition racing).
 */
export async function approveParticipation({
  container,
  actor,
  input,
}: ActorServiceArgs<ApproveParticipationInput>): Promise<ApprovalOutcome> {
  return approveApplication({
    container,
    actor,
    input,
    kind: "participation",
    load: async () => null,
    reflect: async (ctx, app, _loaded, now) => {
      const { entity, eventDrafts } = Participation.establish(
        {
          key: {
            occasionId: app.target.occasionId,
            placeId: app.target.placeId,
          },
          details: app.content,
        },
        now,
      );
      await ctx.participationRepository.insert(entity);
      return { eventDrafts };
    },
  });
}
