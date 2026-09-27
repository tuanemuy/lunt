import {
  Application,
  type ApplicationKind,
} from "@repo/core/domain/application/application";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import type { ApplicationLabel } from "@repo/core/domain/notification/mail";
import type { UnitOfWorkContext } from "../execution/unitOfWork";

type SubjectKind = ApplicationLabel["subjects"][number]["kind"];

// What every kind's application has. Read through this shape because
// `Application` is the union of the registered kinds — empty in stage 1.
type ApplicationHead = Readonly<{
  id: ApplicationId;
  target: Readonly<{ kind: ApplicationKind }>;
}>;

/**
 * An application's label before content names are known. A subject that
 * does not exist yet takes its name from the application's content
 * (`from: "content"`); any other is named by `ContentDirectory` at display
 * time (`from: "directory"`) — Application's 「申請の対象の名称」.
 */
export type PendingApplicationLabel = Readonly<{
  applicationKind: ApplicationKind;
  subjects: readonly Readonly<{
    kind: SubjectKind;
    ref: ContentRef;
    name:
      | Readonly<{ from: "content"; value: string | null }>
      | Readonly<{ from: "directory" }>;
  }>[];
}>;

// Every subject is named by the directory for now. The kinds whose subjects
// may not exist yet (a registration's reserved place, a listing
// application's listing, a companion claim's place) register in S2B, and
// with them Application's per-kind rule naming such a subject from the
// content; it plugs in here.
function pendingLabelOf(app: Application): PendingApplicationLabel {
  return {
    applicationKind: (app as ApplicationHead).target.kind,
    subjects: Application.subjects(app).flatMap((subject) =>
      subject.kind === "registration"
        ? []
        : [
            {
              kind: subject.kind,
              ref: subject as ContentRef,
              name: { from: "directory" } as const,
            },
          ],
    ),
  };
}

/**
 * Applications' kinds and subjects, read inside `run` through
 * `ApplicationRepository.findByIds` (100 at a time). An application that
 * does not exist is left out; its label reads as `null`.
 */
export async function readApplicationLabels(
  ctx: UnitOfWorkContext,
  ids: readonly ApplicationId[],
): Promise<ReadonlyMap<ApplicationId, PendingApplicationLabel>> {
  const unique = [...new Set(ids)];
  const labels = new Map<ApplicationId, PendingApplicationLabel>();
  for (let start = 0; start < unique.length; start += IdBatch.maxSize) {
    const batch = unique.slice(start, start + IdBatch.maxSize);
    for (const app of await ctx.applicationRepository.findByIds(batch)) {
      labels.set((app as ApplicationHead).id, pendingLabelOf(app));
    }
  }
  return labels;
}
