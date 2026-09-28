import {
  type Application,
  Application as Behaviour,
} from "@repo/core/domain/application/application";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { Version } from "@repo/core/domain/common/version";
import type { ActorServiceArgs } from "../types";
import { assertApplicantVersion, requireHandledBy } from "./applicant";
import { requireApplication } from "./review";

export type WithdrawApplicationInput = Readonly<{
  applicationId: ApplicationId;
  /** The version the applicant read the application at. */
  version: Version;
}>;

/**
 * The applicant withdraws an application under review or returned
 * (APP-03, APP-06; `spec/usecases/application.md` 「withdrawApplication」).
 * Final; nothing is reflected, and the application keeps its photos (no
 * `photos.released`). Emits `application.withdrawn` to the approver's
 * seat. Withdrawing a registration leaves its companion claim to the
 * reassessment consumer; withdrawing the claim leaves the registration.
 * A steward's application may be withdrawn by any steward of the place.
 *
 * Checks, in order: the application (`NotFoundError`), the applicant
 * (`ForbiddenError`), the status (`requireActive`'s codes: already
 * approved, rejected, withdrawn, lapsed), the version read
 * (`ConflictError`).
 */
export async function withdrawApplication({
  container,
  actor,
  input,
}: ActorServiceArgs<WithdrawApplicationInput>): Promise<Application> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireApplication(ctx, input.applicationId);
    await requireHandledBy(ctx, actor, found.entity);
    const active = Behaviour.requireActive(found.entity);
    assertApplicantVersion(active, input.version);
    const { entity, eventDrafts } = Behaviour.withdraw(active, now);
    await ctx.applicationRepository.save(entity, found.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
}
