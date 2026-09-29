import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { persistAffiliations, readAffiliations } from "../region/affiliations";
import type { ActorServiceArgs } from "../types";
import {
  type ApprovalOutcome,
  type ApproveApplicationInput,
  approveApplication,
} from "./approval";

export type ApproveAffiliationInput = ApproveApplicationInput;

/**
 * The region's steward — the operator by absence proxy for a region
 * without one, or by overdue proxy once the review period has passed —
 * approves an affiliation application (REG-09, REG-13, APP-08; CM-01):
 * the place joins the region (`PlaceAffiliations.affiliate`, the first
 * affiliation inserting the place's record), `region.affiliation_established`
 * is stored with `application.approved`, and the region is returned as
 * the reflected target. The place's other affiliations, its chosen
 * representative and every publication and offering state stay as they
 * are; a suspended region is joined all the same. When the place's
 * steward premise or `notAffiliated` no longer holds, the application
 * lapses instead (returned, not thrown).
 *
 * - `NotFoundError` (none, or not an affiliation); `ForbiddenError`.
 * - The status code when not under review; `APPLICATION_AWAITING_STEWARDS`
 *   (the operator before the review period passed on a region with
 *   stewards); `ConflictError` when the application changed since
 *   `version`, or the affiliations changed before the commit (an approval
 *   racing on the same place: `REGION_ALREADY_AFFILIATED` or the lock).
 */
export async function approveAffiliation({
  container,
  actor,
  input,
}: ActorServiceArgs<ApproveAffiliationInput>): Promise<ApprovalOutcome> {
  return approveApplication({
    container,
    actor,
    input,
    kind: "affiliation",
    load: (ctx, app, now) => readAffiliations(ctx, app.target.placeId, now),
    reflect: async (ctx, app, read, now) => {
      const { entity, eventDrafts } = PlaceAffiliations.affiliate(
        read.affiliations,
        app.target.regionId,
        now,
      );
      await persistAffiliations(ctx, entity, read.expectedVersion);
      return { eventDrafts };
    },
  });
}
