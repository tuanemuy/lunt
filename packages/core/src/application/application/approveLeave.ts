import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { persistAffiliations, readAffiliations } from "../region/affiliations";
import type { ActorServiceArgs } from "../types";
import {
  type ApprovalOutcome,
  type ApproveApplicationInput,
  approveApplication,
} from "./approval";

export type ApproveLeaveInput = ApproveApplicationInput;

/**
 * Whoever may approve the region's affiliations approves a leave
 * application (REG-09, REG-13, APP-08; CM-01): the place leaves the
 * region (`PlaceAffiliations.leave`), `region.affiliation_dissolved`
 * (`cause: "left"`) is stored with `application.approved`, and the region
 * is returned as the reflected target. A left chosen representative is
 * cleared, so the representative becomes the first remaining affiliation;
 * the other affiliations and every publication and offering state stay as
 * they are. An unpublished or suspended region is left all the same. When
 * the place's steward premise or `affiliated` no longer holds, the
 * application lapses instead (returned, not thrown).
 *
 * - `NotFoundError` (none, or not a leave); `ForbiddenError`.
 * - The status code when not under review; `APPLICATION_AWAITING_STEWARDS`;
 *   `ConflictError` when the application changed since `version`, or the
 *   affiliations changed before the commit (an exclusion racing:
 *   `REGION_NOT_AFFILIATED` or the lock).
 */
export async function approveLeave({
  container,
  actor,
  input,
}: ActorServiceArgs<ApproveLeaveInput>): Promise<ApprovalOutcome> {
  return approveApplication({
    container,
    actor,
    input,
    kind: "leave",
    load: (ctx, app, now) => readAffiliations(ctx, app.target.placeId, now),
    reflect: async (ctx, app, read, now) => {
      const { entity, eventDrafts } = PlaceAffiliations.leave(
        read.affiliations,
        app.target.regionId,
        now,
      );
      await persistAffiliations(ctx, entity, read.expectedVersion);
      return { eventDrafts };
    },
  });
}
