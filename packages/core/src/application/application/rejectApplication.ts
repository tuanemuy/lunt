import { Application } from "@repo/core/domain/application/application";
import { RejectionReason } from "@repo/core/domain/application/texts";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { Version } from "@repo/core/domain/common/version";
import type { ActorServiceArgs } from "../types";
import {
  type ReviewedApplication,
  requireApplication,
  requireDecision,
  reviewed,
  reviewPermission,
} from "./review";

export type RejectApplicationInput = Readonly<{
  applicationId: ApplicationId;
  /** The version the approver read the application at (CM-01). */
  version: Version;
  /** 否認の理由. */
  reason: string;
}>;

/**
 * The approver — or, once the review period elapsed, an operator standing
 * in (期間超過の代行) — rejects an application under review with a reason
 * (APP-07, APP-08, CM-01). Nothing is reflected; the application keeps
 * its photos. `application.rejected` is stored; a rejected registration's
 * companion claim lapses later through `reassessApplicationPremises`. Any
 * kind. The stance is decided from the facts at this moment, so an
 * operator who opened it as the absence proxy rejects as the overdue
 * proxy once a steward took the seat and the period elapsed.
 *
 * - `NotFoundError`; `ForbiddenError` (not an approver, nor an operator
 *   who may stand in).
 * - The status code when not under review, `APPLICATION_AWAITING_STEWARDS`,
 *   `APPLICATION_REGISTRATION_PENDING`.
 * - `ConflictError` when the application changed since `version`.
 * - `APPLICATION_INVALID_REJECTION_REASON`: blank reason (judged after
 *   the common checks above).
 */
export async function rejectApplication({
  container,
  actor,
  input,
}: ActorServiceArgs<RejectApplicationInput>): Promise<ReviewedApplication> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireApplication(ctx, input.applicationId);
    const permission = await reviewPermission(
      ctx,
      actor,
      found.entity,
      container.reviewPolicy,
      now,
    );
    const { app, as } = requireDecision(
      found.entity,
      permission,
      input.version,
    );
    const reason = RejectionReason.create(input.reason);
    const { entity, eventDrafts } = Application.reject(app, as, reason, now);
    await ctx.applicationRepository.save(entity, found.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return reviewed(entity);
  });
}
