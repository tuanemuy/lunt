// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { listMyApplications } from "@repo/core/application/application/listMyApplications";
import type { ApplicationSummary } from "@repo/core/application/application/views";
import { getContainer } from "@repo/core/application/di/containerStore";
import { NotFoundError } from "@repo/core/application/errors";
import { PlaceId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { requireActor } from "./actor";
import { applicantText, subjectTitle } from "./applicationSubjects";
import { APPLICATION_KIND_TITLE, monthDayText } from "./applicationWords";
import type { MyApplicationItem, MyApplicationsPage } from "./myApplications";

/**
 * A place id from the URL filter. One that cannot be an id names no store:
 * CS-17, like an id no store has.
 */
function filterPlaceId(raw: string): PlaceId {
  try {
    return PlaceId.create(raw);
  } catch {
    throw new NotFoundError("PLACE_NOT_FOUND", `No store has the id ${raw}`);
  }
}

function dateText(summary: ApplicationSummary): string {
  const { status } = summary;
  if (status.kind === "underReview" && status.answering !== null) {
    return `${monthDayText(status.since.toISOString())}に再提出`;
  }
  return `${monthDayText(summary.submittedAt.toISOString())}に提出`;
}

const NOT_YET_WORD = {
  place: "店舗",
  listing: "掲載",
  region: "地域",
  occasion: "イベント",
} as const;

function notesOf(
  summary: ApplicationSummary,
  companions: ReadonlySet<string>,
): readonly string[] {
  const notes: string[] = [];
  for (const subject of summary.subjects) {
    if (subject.notYet)
      notes.push(`${NOT_YET_WORD[subject.ref.kind]}はまだありません`);
  }
  if (summary.kind === "registration" && companions.has(summary.id)) {
    notes.push("管理権限の申請を併せています");
  }
  if (summary.registrationId !== null) {
    notes.push("店舗の登録申請に併せた申請");
  }
  return notes;
}

/** MY-04's row of an application (「申請の状態」: kind, target, applicant, status). */
function toItem(
  summary: ApplicationSummary,
  companions: ReadonlySet<string>,
): MyApplicationItem {
  return {
    id: summary.id,
    kind: summary.kind,
    title: `${APPLICATION_KIND_TITLE[summary.kind]} · ${subjectTitle(summary.subjects)}`,
    status: summary.status.kind,
    meta: `申請者 ${applicantText(summary.applicant)} · ${dateText(summary)}`,
    notes: notesOf(summary, companions),
  };
}

/** A page of the viewer's applications, narrowed to `rawPlace` when given. */
export async function loadMyApplicationsPage(
  rawPlace: string | null,
  pagination: Pagination,
): Promise<MyApplicationsPage> {
  const container = await getContainer();
  const actor = await requireActor(container);
  const result = await listMyApplications({
    container,
    actor,
    input: {
      placeId: rawPlace === null ? null : filterPlaceId(rawPlace),
      pagination,
    },
  });
  // A registration's companion claim is filed with it, so the two sit on
  // the same page (same submission time).
  const companions = new Set(
    result.items.flatMap((item) =>
      item.registrationId === null ? [] : [item.registrationId],
    ),
  );
  return {
    items: result.items.map((item) => toItem(item, companions)),
    count: result.count,
    place: result.place,
  };
}

/** See `loadApplicationsFilterFn`. */
export async function loadApplicationsFilter(
  rawPlace: string,
): Promise<Readonly<{ id: string; name: string | null }>> {
  const page = await loadMyApplicationsPage(rawPlace, { page: 1, limit: 1 });
  return page.place ?? { id: rawPlace, name: null };
}
