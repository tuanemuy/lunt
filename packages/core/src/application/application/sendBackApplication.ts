import { Application } from "@repo/core/domain/application/application";
import { ReturnRequest } from "@repo/core/domain/application/texts";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { Version } from "@repo/core/domain/common/version";
import type { ActorServiceArgs } from "../types";
import {
  type ReviewedApplication,
  requireApplication,
  requireReturn,
  reviewed,
  reviewPermission,
} from "./review";

export type SendBackApplicationInput = Readonly<{
  applicationId: ApplicationId;
  /** The version the approver read the application at (CM-01). */
  version: Version;
  /** 追加で必要な確認. */
  request: string;
}>;

/**
 * The approver returns an application under review with what they still
 * need confirmed (APP-07, CM-01); it waits for the applicant's
 * resubmission and `application.returned` is stored. Any kind. An
 * operator standing in for absent stewards returns as the approver; an
 * overdue proxy cannot return.
 *
 * - `NotFoundError`; `ForbiddenError` (not an approver, nor an operator
 *   who may stand in).
 * - The status code when not under review (`APPLICATION_RETURNED`,
 *   `APPLICATION_ALREADY_…`), `APPLICATION_AWAITING_STEWARDS`,
 *   `APPLICATION_REGISTRATION_PENDING`,
 *   `APPLICATION_OVERDUE_PROXY_CANNOT_RETURN`.
 * - `ConflictError` when the application changed since `version`.
 * - `APPLICATION_INVALID_RETURN_REQUEST`: blank request (judged after
 *   the common checks above).
 */
export async function sendBackApplication({
  container,
  actor,
  input,
}: ActorServiceArgs<SendBackApplicationInput>): Promise<ReviewedApplication> {
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
    const app = requireReturn(found.entity, permission, input.version);
    const request = ReturnRequest.create(input.request);
    const { entity, eventDrafts } = Application.sendBack(
      app,
      "approver",
      request,
      now,
    );
    await ctx.applicationRepository.save(entity, found.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return reviewed(entity);
  });
}
