import {
  Application,
  ApplicationCase,
  type ApplicationKind,
} from "@repo/core/domain/application/application";
import type { AnyApplication } from "@repo/core/domain/application/kind";
import type { SubjectName } from "@repo/core/domain/application/subject";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import type { ApplicationLabel } from "@repo/core/domain/notification/mail";
import type { UnitOfWorkContext } from "../execution/unitOfWork";

type SubjectKind = ApplicationLabel["subjects"][number]["kind"];

/**
 * An application's label before content names are known. A subject that
 * does not exist yet takes its name from an application's content
 * (`from: "content"`); any other is named by `ContentDirectory` at display
 * time (`from: "directory"`) — Application's 「申請の対象の名称」, as
 * `Application.namedSubjects` applies it.
 */
export type PendingApplicationLabel = Readonly<{
  applicationKind: ApplicationKind;
  subjects: readonly Readonly<{
    kind: SubjectKind;
    ref: ContentRef;
    name: SubjectName;
  }>[];
}>;

async function readApplications(
  ctx: UnitOfWorkContext,
  ids: readonly ApplicationId[],
): Promise<ReadonlyMap<ApplicationId, AnyApplication>> {
  const unique = [...new Set(ids)];
  const found = new Map<ApplicationId, AnyApplication>();
  for (let start = 0; start < unique.length; start += IdBatch.maxSize) {
    const batch = unique.slice(start, start + IdBatch.maxSize);
    const apps: readonly AnyApplication[] =
      await ctx.applicationRepository.findByIds(batch);
    for (const app of apps) found.set(app.id, app);
  }
  return found;
}

/**
 * Applications' kinds and subjects, read inside `run` through
 * `ApplicationRepository.findByIds` (100 at a time), together with the
 * registrations companion claims were filed with, whose content names
 * their place. An application that does not exist is left out; its label
 * reads as `null`.
 */
export async function readApplicationLabels(
  ctx: UnitOfWorkContext,
  ids: readonly ApplicationId[],
): Promise<ReadonlyMap<ApplicationId, PendingApplicationLabel>> {
  const applications = await readApplications(ctx, ids);
  const registrationIds = [...applications.values()].flatMap((app) => {
    const registrationId = Application.registrationOf(app);
    return registrationId === null || applications.has(registrationId)
      ? []
      : [registrationId];
  });
  const registrations = await readApplications(ctx, registrationIds);
  const labels = new Map<ApplicationId, PendingApplicationLabel>();
  for (const [id, app] of applications) {
    const registrationId = Application.registrationOf(app);
    const registration =
      registrationId === null
        ? null
        : (applications.get(registrationId) ??
          registrations.get(registrationId) ??
          null);
    labels.set(id, {
      applicationKind: Application.kindOf(app),
      subjects: labelSubjects(app, registration),
    });
  }
  return labels;
}

type LabelSubject = PendingApplicationLabel["subjects"][number];

/**
 * `Application.namedSubjects`, then what the application's content names
 * that its subjects leave out — a listing application's new listing,
 * which Application's 「申請の対象の名称」 names from the content although
 * `Application.subjects` holds only its place.
 */
function labelSubjects(
  app: AnyApplication,
  registration: AnyApplication | null,
): readonly LabelSubject[] {
  const named: LabelSubject[] = Application.namedSubjects(
    app,
    registration,
  ).map(({ subject, name }) => ({ kind: subject.kind, ref: subject, name }));
  for (const entry of ApplicationCase.contentNames(app)) {
    const { ref } = entry;
    if (ref.kind === "article") continue;
    if (named.some((subject) => ContentRef.equals(subject.ref, ref))) continue;
    named.push({
      kind: ref.kind,
      ref,
      name: { from: "content", value: entry.name },
    });
  }
  return named;
}
