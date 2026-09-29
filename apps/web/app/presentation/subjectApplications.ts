// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import type { ApplicationForSubject } from "@repo/core/application/application/listApplicationsForSubject";
import type {
  ApplicantView,
  ApplicationSummary,
} from "@repo/core/application/application/views";
import { attachedLine, participationDatesText } from "./applicationContentData";
import {
  applicationTitle,
  listApplicantText,
  subjectName,
  subjectTitle,
} from "./applicationSubjects";
import {
  APPLICATION_KIND_TITLE,
  LAPSE_REASON_SHORT,
  monthDayText,
  STATUS_LABEL,
  STATUS_TONE,
} from "./applicationWords";
import { dayText, type InboxApplicationRow } from "./moderation";
import type { SubjectApplicationItem } from "./occasionView";

/*
 * The application rows of the approvers' lists (「申請の状態」): OM-01's
 * two application sections, and EM-01's (「申請ごとに、添えた掲載と参加日
 * を示す」).
 */

const STEWARDS_WORD = { region: "地域運営者", occasion: "イベント運営者" };

/**
 * One application awaiting the operators (OM-01): a region or event
 * application is titled by the region or event, marked 運営者が不在の… as
 * the approver's, …運営者が未確認 as the overdue proxy's.
 */
export function inboxApplicationRow(
  summary: ApplicationSummary,
  section: "asApprover" | "asOverdueProxy",
): InboxApplicationRow {
  const seat = summary.subjects.find(
    ({ ref }) => ref.kind === "region" || ref.kind === "occasion",
  );
  const seatKind =
    seat?.ref.kind === "region" || seat?.ref.kind === "occasion"
      ? seat.ref.kind
      : null;
  const notYet = summary.subjects
    .filter((subject) => subject.notYet)
    .map((subject) =>
      subject.ref.kind === "listing"
        ? "掲載はまだありません"
        : "店舗はまだありません",
    );
  const seatNote =
    seatKind === null
      ? []
      : section === "asApprover"
        ? [`運営者が不在の${seatKind === "region" ? "地域" : "イベント"}`]
        : [`${STEWARDS_WORD[seatKind]}が未確認`];
  const notes = [
    APPLICATION_KIND_TITLE[summary.kind],
    ...(summary.registrationId !== null && summary.kind === "stewardship"
      ? ["登録の申請に併せた申請"]
      : notYet),
    ...seatNote,
    ...(seatKind === null && section === "asOverdueProxy"
      ? ["運営者が未確認"]
      : []),
  ];
  const { status } = summary;
  const statusText =
    status.kind === "underReview"
      ? status.answering === null
        ? `確認中 · ${dayText(status.since.toISOString())}に提出`
        : `確認中（再提出）· ${dayText(status.since.toISOString())}`
      : "確認中";
  return {
    applicationId: summary.id,
    title: applicationTitle(summary),
    sub: notes.join(" · "),
    applicant: listApplicantText(summary.applicant),
    status: statusText,
  };
}

const applicantLine = (applicant: ApplicantView): string =>
  applicant.kind === "individual"
    ? `個人（${applicant.email ?? "退会した利用者"}）`
    : (applicant.name ?? "店舗");

/** 添えた掲載 いちじくのパフェ ほか1件 · 参加日 10月10日（土）、10月11日（日） */
function participationLine(item: ApplicationForSubject): string | null {
  if (item.participation === null) return null;
  const [first, ...others] = item.participation.listings.map(attachedLine);
  const listings =
    first === undefined
      ? "添えた掲載なし"
      : `添えた掲載 ${first.name}${others.length === 0 ? "" : ` ほか${others.length}件`}`;
  return `${listings} · 参加日 ${participationDatesText(item.participation.dates)}`;
}

/** One participation application of EM-01. */
export function participationApplicationItem(
  item: ApplicationForSubject,
): SubjectApplicationItem {
  const place = item.subjects.find(({ ref }) => ref.kind === "place");
  const { status } = item;
  const overdue = "reviewAs" in status && status.reviewAs === "overdue_proxy";
  return {
    applicationId: item.id,
    title: `参加 · ${place === undefined ? subjectTitle(item.subjects) : subjectName(place)}`,
    meta: [
      `申請者 ${applicantLine(item.applicant)}`,
      monthDayText(item.submittedAt.toISOString()),
      ...(overdue ? ["サービス運営者が期間超過の代行で判断"] : []),
      ...(status.kind === "lapsed"
        ? status.brokenPremises.map((key) => LAPSE_REASON_SHORT[key])
        : []),
    ].join(" · "),
    detail: participationLine(item),
    status: STATUS_LABEL[status.kind],
    tone: STATUS_TONE[status.kind],
    underReview: status.kind === "underReview",
  };
}
