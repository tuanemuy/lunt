import type {
  ApplicantView,
  SubjectView,
} from "@repo/core/application/application/views";
import type { ApplicationKind } from "@repo/core/domain/application/application";

/*
 * How an application's subjects and applicant read (`spec/pages/index.md`
 * 「申請の状態」). Pure; types only from the core.
 */

const MISSING_NAME = {
  place: "（名称のない店舗）",
  listing: "（なくなった掲載）",
  region: "（名称のない地域）",
  occasion: "（名称のないイベント）",
} as const satisfies Readonly<Record<SubjectView["ref"]["kind"], string>>;

/** A subject's name, or what stands in when it has none (a deleted listing). */
export const subjectName = (subject: SubjectView): string =>
  subject.name ?? MISSING_NAME[subject.ref.kind];

/**
 * The subject a row is titled by: a listing names its store in brackets
 * (クロワッサン（ベーカリー 灯）); otherwise the first subject — the store,
 * region or event in the kind's order.
 */
export function subjectTitle(subjects: readonly SubjectView[]): string {
  const listing = subjects.find((subject) => subject.ref.kind === "listing");
  const place = subjects.find((subject) => subject.ref.kind === "place");
  if (listing !== undefined) {
    return place === undefined
      ? subjectName(listing)
      : `${subjectName(listing)}（${subjectName(place)}）`;
  }
  const first = subjects[0];
  return first === undefined ? "" : subjectName(first);
}

/**
 * What a row names an application by: the region or event of an
 * affiliation, leave or participation — with the store in brackets when
 * an individual applied for it (白波横丁（ベーカリー 灯）), since a
 * steward's store is the applicant itself — otherwise `subjectTitle`.
 */
export function applicationTitle(
  application: Readonly<{
    kind: ApplicationKind;
    applicant: ApplicantView;
    subjects: readonly SubjectView[];
  }>,
): string {
  const { kind, applicant, subjects } = application;
  const seat = subjects.find(
    ({ ref }) => ref.kind === "region" || ref.kind === "occasion",
  );
  if (
    seat === undefined ||
    (kind !== "affiliation" && kind !== "leave" && kind !== "participation")
  ) {
    return subjectTitle(subjects);
  }
  const place = subjects.find(({ ref }) => ref.kind === "place");
  return applicant.kind === "individual" && place !== undefined
    ? `${subjectName(seat)}（${subjectName(place)}）`
    : subjectName(seat);
}

/**
 * Who applied, as the approvers' lists show it (OM-01): an individual by
 * their address, a steward's application by its store (喫茶 日々（店舗）).
 */
export function listApplicantText(applicant: ApplicantView): string {
  return applicant.kind === "individual"
    ? (applicant.email ?? "退会した利用者")
    : `${applicant.name ?? "店舗"}（店舗）`;
}

/**
 * Who applied, as the applicant sees it: themselves as an individual, or
 * the store they applied for (P-76).
 */
export function applicantText(applicant: ApplicantView): string {
  return applicant.kind === "individual"
    ? "あなた（個人）"
    : `${applicant.name ?? "店舗"}（店舗）`;
}

/**
 * Who applied, as the approver sees it (CM-01): an individual by their
 * address — 「退会した利用者」 once the account is gone — or the store a
 * steward applied for.
 */
export function reviewerApplicantText(applicant: ApplicantView): string {
  return applicant.kind === "individual"
    ? (applicant.email ?? "退会した利用者")
    : `店舗管理者として（${applicant.name ?? "店舗"}）`;
}
