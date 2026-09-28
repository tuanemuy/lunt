import {
  Application,
  ApplicationCase,
  type ApplicationKind,
  type Application as ApplicationValue,
} from "@repo/core/domain/application/application";
import type { AnyApplication } from "@repo/core/domain/application/kind";
import type { AnyApplicationStatus } from "@repo/core/domain/application/status";
import type {
  ContentSubject,
  NamedSubject,
} from "@repo/core/domain/application/subject";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type {
  AccountId,
  ApplicationId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import type { Version } from "@repo/core/domain/common/version";
import type { ContentDirectory } from "@repo/core/domain/moderation/ports/contentDirectory";
import type { UnitOfWorkContext } from "../execution/unitOfWork";

/**
 * A place, listing, region or occasion an application is about, named by
 * 「申請の対象の名称」: from the application's content for what does not
 * exist yet (and keeps that name after approval), otherwise the target's
 * current name (`ContentDirectory`). `name` is `null` for a target the
 * directory no longer has (a deleted listing) — show it without a name.
 * `notYet` marks 「まだない対象」: the reserved place of a registration, or
 * of a companion claim's registration, while that registration is not
 * approved — show it as not existing yet, never as hidden, and offer no
 * link to it. A listing application also lists the listing it asks for,
 * named from its content and `notYet` until approved.
 */
export type SubjectView = Readonly<{
  ref: ContentSubject;
  name: string | null;
  notYet: boolean;
}>;

/**
 * Who applied. An application made as a place's steward shows the place
 * (P-76), named like the subject it always is.
 */
export type ApplicantView =
  | Readonly<{ kind: "individual"; accountId: AccountId }>
  | Readonly<{ kind: "place"; placeId: PlaceId; name: string | null }>;

/**
 * The status as screens show it: under review since when (and, after a
 * resubmission, the return it answers with the reply), returned with the
 * request, approved / rejected with the reason (`reviewAs` only on the
 * region / occasion kinds: `overdue_proxy` marks a decision an operator
 * took in place of the stewards), withdrawn, or lapsed with the premises
 * that broke.
 */
export type ApplicationStatusView = AnyApplicationStatus;

/** One application in a list (MY-04, OM-01, SM / RM / EM lists). */
export type ApplicationSummary = Readonly<{
  id: ApplicationId;
  kind: ApplicationKind;
  applicant: ApplicantView;
  /** Places, listings, regions, occasions in the kind's order. */
  subjects: readonly SubjectView[];
  status: ApplicationStatusView;
  /** The first submission; lists of one's own applications sort by it. */
  submittedAt: Date;
  version: Version;
  /**
   * The registration a stewardship claim was filed with (併せた申請), or
   * `null`. Screens link the two applications with it.
   */
  registrationId: ApplicationId | null;
}>;

type ApplicationReader = Pick<UnitOfWorkContext, "applicationRepository">;

/**
 * The companion registrations `apps` were filed with, read 100 at a time
 * inside the reader's unit of work — the content a not-yet-existing place
 * is named from.
 */
export async function readRegistrations(
  ctx: ApplicationReader,
  apps: readonly AnyApplication[],
): Promise<ReadonlyMap<ApplicationId, ApplicationValue>> {
  const ids = [
    ...new Set(
      apps.flatMap((app) => {
        const id = Application.registrationOf(app);
        return id === null ? [] : [id];
      }),
    ),
  ];
  const found = await Promise.all(
    IdBatch.chunks(ids).map((chunk) =>
      ctx.applicationRepository.findByIds(chunk),
    ),
  );
  return new Map(found.flat().map((app) => [app.id, app]));
}

/**
 * What an application asks to create that is not one of its subjects — a
 * listing application's reserved listing — named from its content
 * (「申請の対象の名称」: 掲載の申請は内容の名称を掲載の名称にする). It
 * exists only once the application is approved.
 */
function proposedContent(
  app: AnyApplication,
  subjects: readonly NamedSubject[],
): readonly NamedSubject[] {
  const listed = new Set(
    subjects.map(({ subject }) => ContentRef.key(subject)),
  );
  return ApplicationCase.contentNames(app).flatMap(
    ({ ref, name }): NamedSubject[] =>
      ref.kind === "article" || listed.has(ContentRef.key(ref))
        ? []
        : [
            {
              subject: ref,
              name: { from: "content", value: name },
              notYet: app.status.kind !== "approved",
            },
          ],
  );
}

/**
 * Names every content subject of `apps` (「申請の対象の名称」「まだない対象」):
 * content names from the applications and their `registrations`, the rest
 * through `ContentDirectory.describe`, 100 at a time. Call it outside any
 * unit of work.
 */
export async function nameSubjects(
  directory: ContentDirectory,
  apps: readonly AnyApplication[],
  registrations: ReadonlyMap<ApplicationId, AnyApplication>,
): Promise<ReadonlyMap<ApplicationId, readonly SubjectView[]>> {
  const named = new Map<ApplicationId, readonly NamedSubject[]>(
    apps.map((app) => {
      const registrationId = Application.registrationOf(app);
      const registration =
        registrationId === null
          ? null
          : (registrations.get(registrationId) ?? null);
      const subjects = Application.namedSubjects(app, registration);
      return [app.id, [...subjects, ...proposedContent(app, subjects)]];
    }),
  );
  const toDescribe = new Map<string, ContentSubject>();
  for (const subjects of named.values()) {
    for (const { subject, name } of subjects) {
      if (name.from === "directory") {
        toDescribe.set(ContentRef.key(subject), subject);
      }
    }
  }
  const described = await Promise.all(
    IdBatch.chunks([...toDescribe.values()]).map((chunk) =>
      directory.describe(chunk),
    ),
  );
  const names = new Map(
    described
      .flat()
      .map((summary) => [ContentRef.key(summary.target), summary.name]),
  );
  return new Map(
    [...named].map(([id, subjects]) => [
      id,
      subjects.map(
        ({ subject, name, notYet }): SubjectView => ({
          ref: subject,
          name:
            name.from === "content"
              ? name.value
              : (names.get(ContentRef.key(subject)) ?? null),
          notYet,
        }),
      ),
    ]),
  );
}

export function applicantView(
  app: AnyApplication,
  subjects: readonly SubjectView[],
): ApplicantView {
  const { applicant } = app.target;
  if (applicant.kind === "individual") {
    return { kind: "individual", accountId: applicant.accountId };
  }
  const place = subjects.find(
    ({ ref }) => ref.kind === "place" && ref.id === applicant.placeId,
  );
  return {
    kind: "place",
    placeId: applicant.placeId,
    name: place?.name ?? null,
  };
}

export function summarize(
  app: ApplicationValue,
  subjects: readonly SubjectView[],
): ApplicationSummary {
  return {
    id: app.id,
    kind: app.target.kind,
    applicant: applicantView(app, subjects),
    subjects,
    status: app.status,
    submittedAt: app.submittedAt,
    version: app.version,
    registrationId: Application.registrationOf(app),
  };
}

/** `summarize` for every one of `apps`, naming their subjects first. */
export async function summarizeAll(
  directory: ContentDirectory,
  apps: readonly ApplicationValue[],
  registrations: ReadonlyMap<ApplicationId, AnyApplication>,
): Promise<readonly ApplicationSummary[]> {
  const subjects = await nameSubjects(directory, apps, registrations);
  return apps.map((app) => summarize(app, subjects.get(app.id) ?? []));
}
