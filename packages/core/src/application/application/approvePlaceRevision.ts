import { Place } from "@repo/core/domain/place/place";
import { requirePlace } from "../place/places";
import type { ActorServiceArgs } from "../types";
import {
  type ApprovalOutcome,
  type ApproveApplicationInput,
  approveApplication,
} from "./approval";

export type ApprovePlaceRevisionInput = ApproveApplicationInput;

/**
 * An operator approves a revision of a place without a steward (SHP-11,
 * CM-01): only the application's items are laid onto the place as it is
 * now (`Place.applyRevision`), its added photos become the place's, and
 * photos the revision drops are released (`photos.released`). A changed
 * operating status stores `place.operating_status_changed`. A suspended
 * place is revised all the same. When the place has gained a steward
 * since, the application lapses instead (returned, not thrown).
 *
 * - `NotFoundError` (none, or not a revision); `ForbiddenError`.
 * - The status code when not under review; `ConflictError` when the
 *   application changed since `version`, or the place changed between the
 *   read and the commit.
 */
export async function approvePlaceRevision({
  container,
  actor,
  input,
}: ActorServiceArgs<ApprovePlaceRevisionInput>): Promise<ApprovalOutcome> {
  return approveApplication({
    container,
    actor,
    input,
    kind: "revision",
    reflect: async (ctx, app, _premise, now) => {
      const place = await requirePlace(ctx, app.target.placeId);
      const { entity, eventDrafts } = Place.applyRevision(
        place.entity,
        app.content,
        now,
      );
      if (entity !== place.entity) {
        await ctx.placeRepository.save(entity, place.expectedVersion);
      }
      return { eventDrafts };
    },
  });
}
