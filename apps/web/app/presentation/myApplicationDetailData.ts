// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import {
  getMyApplication,
  type MyApplicationView,
} from "@repo/core/application/application/getMyApplication";
import { withdrawApplication } from "@repo/core/application/application/withdrawApplication";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { PremiseKey } from "@repo/core/domain/application/premise";
import { Version } from "@repo/core/domain/common/version";
import { requireActor } from "./actor";
import {
  applicationIdOf,
  applyHref,
  contentData,
  contentPlaceId,
  shopHomePath,
  statusData,
  subjectItems,
  viewerPath,
} from "./applicationContentData";
import { applicantText, subjectName } from "./applicationSubjects";
import type { MyApplicationData, NextStep } from "./myApplicationDetail";

const subjectOfKind = (
  view: MyApplicationView,
  kind: "place" | "region" | "occasion",
  fallback: string,
): string => {
  const subject = view.subjects.find(({ ref }) => ref.kind === kind);
  return subject === undefined ? fallback : subjectName(subject);
};

/**
 * Who decides each kind (the approver seat), as the applicant reads it:
 * the operators, or the region's / event's stewards (the operators stand
 * in for them, which the applicant need not tell apart).
 */
function approverText(view: MyApplicationView): string {
  switch (view.kind) {
    case "registration":
    case "revision":
    case "stewardship":
    case "listing":
    case "listingRevision":
      return "サービス運営者";
    case "affiliation":
    case "leave":
      return `${subjectOfKind(view, "region", "地域")} の地域運営者`;
    case "participation":
      return `${subjectOfKind(view, "occasion", "イベント")} のイベント運営者`;
  }
}

/** What an approval did, as the approval's notice says it (MY-05 承認). */
function approvedText(view: MyApplicationView): string | null {
  if (view.status.kind !== "approved") return null;
  const place = subjectOfKind(view, "place", "店舗");
  switch (view.kind) {
    case "affiliation":
      return `${place} は ${subjectOfKind(view, "region", "地域")} に所属しました。地域のページに、${place} と掲載が並びます。`;
    case "leave":
      return `${place} は ${subjectOfKind(view, "region", "地域")} から離脱しました。地域のページに、${place} は並びません。`;
    case "participation":
      return `${place} は ${subjectOfKind(view, "occasion", "イベント")} に参加します。イベントのページに、${place} と添えた掲載が並びます。`;
    case "stewardship":
      return "申請者は店舗管理者になりました。店舗の管理へ進めます。";
    default:
      return "申請の内容が反映されました。反映先が閲覧できなくなっていれば、開いた先で閲覧できないことが示されます。";
  }
}

/** The name of what an approval landed on: the subject, or a new listing's name. */
function reflectedName(view: MyApplicationView): string {
  const { reflected } = view;
  const subject = view.subjects.find(
    ({ ref }) =>
      reflected !== null &&
      ref.kind === reflected.kind &&
      ref.id === reflected.id,
  );
  if (subject !== undefined) return subjectName(subject);
  return view.content.kind === "listing"
    ? (view.content.content.name ?? "掲載")
    : "反映先";
}

function reflectedStep(view: MyApplicationView): NextStep | null {
  const { reflected } = view;
  if (reflected === null) return null;
  const name = reflectedName(view);
  if (view.kind === "stewardship" && reflected.kind === "place") {
    return {
      href: shopHomePath(reflected.id),
      title: `${name} の店舗ホーム`,
      meta: "店舗管理者になりました。店舗の管理へ進めます",
    };
  }
  const href = viewerPath(reflected);
  return href === null
    ? null
    : {
        href,
        title: `${name} のページを見る`,
        meta: "閲覧者に見えるページです",
      };
}

/** 失効: the next steps APP-05's table names for each broken premise. */
function nextSteps(view: MyApplicationView): readonly NextStep[] {
  if (view.status.kind !== "lapsed") return [];
  const placeId = contentPlaceId(view.content);
  const place = view.subjects.find(({ ref }) => ref.kind === "place");
  const placeName = place === undefined ? "店舗" : subjectName(place);
  const steps = (key: PremiseKey): readonly NextStep[] => {
    switch (key) {
      case "placeHasNoSteward":
        return placeId === null
          ? []
          : [
              {
                href: `/info-report/place/${encodeURIComponent(placeId)}`,
                title: "情報の誤り・閉店を連絡する",
                meta: "店舗管理者のいる店舗の誤りや閉店は、連絡で知らせられます",
              },
            ];
      case "applicantNotSteward":
        return placeId === null
          ? []
          : [
              {
                href: shopHomePath(placeId),
                title: `${placeName} の店舗ホーム`,
                meta: "すでに店舗管理者です。店舗の管理へ進めます",
              },
            ];
      case "registrationStanding":
        return [
          ...(view.registrationId === null
            ? []
            : [
                {
                  href: `/me/applications/${encodeURIComponent(view.registrationId)}`,
                  title: "店舗の登録申請を見る",
                  meta: "否認の理由を確かめ、管理権限の申請を併せて登録を再申請できます",
                },
              ]),
          {
            href: "/apply/find-place",
            title: "既存の店舗を探す",
            meta: "既存の店舗と重なっていたなら、その店舗の管理権限を申請できます",
          },
        ];
      case "listingExists":
        return placeId === null
          ? []
          : [
              {
                href: `/apply/places/${encodeURIComponent(placeId)}/listings/new`,
                title: "新しい掲載を申請する",
                meta: "店舗に店舗管理者がいなければ、掲載を申請できます",
              },
            ];
      case "placeHasSteward":
        return placeId === null
          ? []
          : [
              {
                href: `/apply/places/${encodeURIComponent(placeId)}/stewardship`,
                title: "店舗の管理権限を申請する",
                meta: "再び店舗管理者になるには、管理権限を申請します",
              },
            ];
      case "notParticipating":
        return placeId === null
          ? []
          : [
              {
                href: `/manage/places/${encodeURIComponent(placeId)}/events`,
                title: `${placeName} の参加するイベント`,
                meta: "参加はすでに成立しています。参加内容を変えるなら、参加の状況から変更できます",
              },
            ];
      case "notAffiliated":
      case "affiliated":
      case "occasionOpen":
        return [];
    }
  };
  return view.status.brokenPremises.flatMap(steps);
}

function toData(view: MyApplicationView): MyApplicationData {
  const status = statusData(view.status);
  const ended =
    status.kind === "rejected" ||
    status.kind === "withdrawn" ||
    status.kind === "lapsed";
  return {
    id: view.id,
    kind: view.kind,
    version: view.version,
    status,
    submittedAt: view.submittedAt.toISOString(),
    subjects: subjectItems(view.subjects),
    applicant: applicantText(view.applicant),
    asSteward: view.applicant.kind === "place",
    approver: approverText(view),
    content: contentData(view.content),
    pair:
      view.companion !== null
        ? {
            id: view.companion.id,
            kind: "stewardship",
            status: view.companion.status,
          }
        : view.registrationId !== null
          ? { id: view.registrationId, kind: "registration", status: null }
          : null,
    reflected: reflectedStep(view),
    approvedText: approvedText(view),
    resubmitHref:
      status.kind === "returned"
        ? applyHref(view.content, "resubmit", view.id)
        : null,
    reapplyHref: ended ? applyHref(view.content, "reapply", view.id) : null,
    nextSteps: nextSteps(view),
  };
}

/** See `loadMyApplicationFn`. */
export async function loadMyApplication(
  rawId: string,
): Promise<MyApplicationData> {
  const container = await getContainer();
  const actor = await requireActor(container);
  const view = await getMyApplication({
    container,
    actor,
    input: { applicationId: applicationIdOf(rawId) },
  });
  return toData(view);
}

/** See `withdrawApplicationFn`. */
export async function withdrawMyApplication(
  rawId: string,
  version: number,
): Promise<void> {
  const container = await getContainer();
  const actor = await requireActor(container);
  await withdrawApplication({
    container,
    actor,
    input: {
      applicationId: applicationIdOf(rawId),
      version: Version.create(version),
    },
  });
}
