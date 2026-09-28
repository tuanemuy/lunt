import {
  Application,
  type ApplicationKind,
} from "@repo/core/domain/application/application";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import type { Version } from "@repo/core/domain/common/version";
import { displayRefsOf } from "../place/photos";
import type { ActorServiceArgs } from "../types";
import { requireHandledBy } from "./applicant";
import { type CompanionView, companionView } from "./companion";
import {
  type ApplicationContentView,
  companionOf,
  contentView,
  photoIdsOf,
  readContentSource,
  registrationIdOf,
} from "./detail";
import { requireApplication } from "./review";
import {
  type ApplicantView,
  type ApplicationStatusView,
  applicantView,
  nameSubjects,
  readRegistrations,
  type SubjectView,
} from "./views";

export type GetMyApplicationInput = Readonly<{ applicationId: ApplicationId }>;

/** One application as its applicant reads it (MY-05). */
export type MyApplicationView = Readonly<{
  id: ApplicationId;
  kind: ApplicationKind;
  /** The version a withdrawal or resubmission starts from. */
  version: Version;
  submittedAt: Date;
  applicant: ApplicantView;
  subjects: readonly SubjectView[];
  /**
   * Under review (with the return it answers and the reply, after a
   * resubmission), returned with the request, rejected with the reason,
   * lapsed with the broken premises, approved, withdrawn.
   */
  status: ApplicationStatusView;
  content: ApplicationContentView;
  /** A registration's companion claim (the active one, else the newest). */
  companion: CompanionView | null;
  /** A companion claim's registration. */
  registrationId: ApplicationId | null;
  /** Where an approved application landed (`Application.reflectedRef`); `null` until approved. */
  reflected: ContentRef | null;
}>;

/**
 * The applicant reads one application (APP-01, APP-02, APP-05, APP-06;
 * MY-05): kind, subjects (named, 「まだない対象」 marked), applicant, the
 * content with photos in every status, the status and its outcome, a
 * revision's items against the target now and the target with them laid
 * on (only the proposed values when the listing is gone), the companion
 * claim or registration, and where an approval landed — even when that
 * target can no longer be viewed. Retired categories read as their active
 * successors. Every steward of the place reads an application made as
 * its steward alike.
 *
 * - `NotFoundError`; `ForbiddenError` for anyone else, or a former
 *   steward (nothing of the application is returned).
 */
export async function getMyApplication({
  container,
  actor,
  input,
}: ActorServiceArgs<GetMyApplicationInput>): Promise<MyApplicationView> {
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireApplication(ctx, input.applicationId);
    const app = found.entity;
    await requireHandledBy(ctx, actor, app);
    return {
      app,
      source: await readContentSource(ctx, app),
      registrations: await readRegistrations(ctx, [app]),
    };
  });
  const { app, source } = read;
  const [subjects, refs] = await Promise.all([
    nameSubjects(container.contentDirectory, [app], read.registrations),
    displayRefsOf(container.photoStorage, photoIdsOf(source)),
  ]);
  const named = subjects.get(app.id) ?? [];
  return {
    id: app.id,
    kind: app.target.kind,
    version: app.version,
    submittedAt: app.submittedAt,
    applicant: applicantView(app, named),
    subjects: named,
    status: app.status,
    content: contentView(source, refs),
    companion: companionView(companionOf(source)),
    registrationId: registrationIdOf(source),
    reflected:
      app.status.kind === "approved" ? Application.reflectedRef(app) : null,
  };
}
