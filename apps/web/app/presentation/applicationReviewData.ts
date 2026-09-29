// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import type { ApprovalOutcome } from "@repo/core/application/application/approval";
import { approveAffiliation } from "@repo/core/application/application/approveAffiliation";
import { approveLeave } from "@repo/core/application/application/approveLeave";
import { approveListingRevision } from "@repo/core/application/application/approveListingRevision";
import { approveNewListing } from "@repo/core/application/application/approveNewListing";
import { approveParticipation } from "@repo/core/application/application/approveParticipation";
import { approvePlaceRegistration } from "@repo/core/application/application/approvePlaceRegistration";
import { approvePlaceRevision } from "@repo/core/application/application/approvePlaceRevision";
import { approveStewardshipClaim } from "@repo/core/application/application/approveStewardshipClaim";
import {
  type ApplicationForReview,
  getApplicationForReview,
  type HiddenBy,
  type ReviewSubjectView,
} from "@repo/core/application/application/getApplicationForReview";
import { rejectApplication } from "@repo/core/application/application/rejectApplication";
import { sendBackApplication } from "@repo/core/application/application/sendBackApplication";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import {
  ForbiddenError,
  isForbiddenError,
  isNotFoundError,
} from "@repo/core/application/errors";
import type { ApplicationKind } from "@repo/core/domain/application/application";
import { ReviewPolicy } from "@repo/core/domain/application/reviewPolicy";
import type { Actor } from "@repo/core/domain/common/actor";
import { Address } from "@repo/core/domain/common/address";
import type { ContentRef } from "@repo/core/domain/common/refs";
import { Version } from "@repo/core/domain/common/version";
import { requireActor } from "./actor";
import type { ContentData } from "./applicationContent";
import {
  applicationIdOf,
  contentData,
  statusData,
  subjectItems,
  viewerPath,
} from "./applicationContentData";
import type {
  ApplicationReviewData,
  ApprovalResult,
  ReviewFactsData,
  ReviewFrame,
  ReviewSeat,
  ReviewStance,
  ReviewSubjectItem,
} from "./applicationReview";
import { reviewerApplicantText, subjectName } from "./applicationSubjects";
import { REVIEW_BROKEN_PREMISE_TEXT } from "./applicationWords";
import type { NextStep } from "./myApplicationDetail";
import { loadOccasionFrame } from "./occasionData";
import { periodText } from "./occasionView";
import { loadRegionFrame } from "./regionData";

function stanceOf(view: ApplicationForReview): ReviewStance {
  const { permission } = view;
  if (permission.allowed) {
    return permission.reviewAs === "overdue_proxy"
      ? "overdueProxy"
      : "approver";
  }
  switch (permission.reason) {
    case "awaitingStewards":
    case "registrationPending":
      return permission.reason;
    case "notApprover":
      // `getApplicationForReview` refuses it; the open permission's type
      // cannot exclude it from the union of reasons.
      throw new ForbiddenError("FORBIDDEN", "The actor is not an approver");
  }
}

const STILL_OPEN = "申請は確認中のまま判断できます。";

/**
 * Why viewers do not see a subject (CM-01 「運営による非公開、または店舗の
 * 非公開」), as `getApplicationForReview` read it.
 */
function hiddenNote({ suspended, placeSuspended }: HiddenBy): string {
  if (suspended && placeSuspended) {
    return `運営による非公開で、店舗も運営による非公開のため、閲覧者には表示されていません。${STILL_OPEN}`;
  }
  if (suspended) {
    return `運営による非公開のため、閲覧者には表示されていません。${STILL_OPEN}`;
  }
  if (placeSuspended) {
    return `店舗が運営による非公開のため、閲覧者には表示されていません。${STILL_OPEN}`;
  }
  return `公開されていないなどの理由で、閲覧者には表示されていません。${STILL_OPEN}`;
}

function viewabilityNote(subject: ReviewSubjectView): string | null {
  switch (subject.viewability) {
    case "notViewable":
      return hiddenNote(subject.hiddenBy);
    case "missing":
      return "削除されていて、ありません。";
    case "viewable":
    case "notYet":
      return null;
  }
}

/** The subjects with their covers: rows for what exists, text otherwise. */
function reviewSubjects(
  subjects: readonly ReviewSubjectView[],
): readonly ReviewSubjectItem[] {
  const items = subjectItems(subjects, viewabilityNote);
  return subjects.flatMap((subject, index) => {
    const item = items[index];
    if (item === undefined) return [];
    const exists = !subject.notYet && subject.viewability !== "missing";
    return [
      {
        ...item,
        row: exists
          ? { photoUrl: subject.cover?.displayRef.url ?? null }
          : null,
      },
    ];
  });
}

function facts(view: ApplicationForReview): ReviewFactsData {
  const { facts: read } = view;
  switch (read.kind) {
    case "registration":
      return {
        kind: "registration",
        similarPlaces: read.similarPlaces.map((place) => ({
          placeId: place.placeId,
          name: place.name,
          address: Address.text(place.address),
          suspended: place.suspended,
        })),
      };
    case "stewardship":
      return read;
    case "none":
      return read;
  }
}

const nameOf = (
  view: ApplicationForReview,
  kind: ContentRef["kind"],
  fallback: string,
): string => {
  const subject = view.subjects.find(({ ref }) => ref.kind === kind);
  return subject === undefined ? fallback : subjectName(subject);
};

/** What approving `view` reflects, for the confirmation (CS-12). */
function approveEffects(
  view: ApplicationForReview,
  content: ContentData,
): readonly string[] {
  const place = nameOf(view, "place", "店舗");
  const notice = "申請者に、承認の通知が届きます";
  const items = (content.compare ?? []).map((row) => row.label).join("・");
  switch (view.content.kind) {
    case "registration":
      return [
        `${view.content.profile.name} を、営業中の店舗として登録し、公開します`,
        "申請の写真は、店舗の写真になります",
        view.companion === null
          ? "申請者に管理権限は付きません"
          : "申請者に管理権限は付きません。併せた管理権限の申請は、この承認の後に判断できます",
        notice,
      ];
    case "revision":
      return [
        `${place} に、変更する項目（${items}）だけを反映します`,
        "ほかの項目は、いまの内容のまま残ります",
        notice,
      ];
    case "stewardship":
      return [
        `申請者が ${place} の店舗管理者になります`,
        `${place} のすべての掲載が、申請者の管理下に入ります`,
        ...(view.facts.kind === "stewardship" && view.facts.placeHasSteward
          ? ["既存の店舗管理者に、同じ操作範囲の店舗管理者が加わります"]
          : []),
        notice,
      ];
    case "listing":
      return [
        `${place} に、公開中の掲載「${view.content.content.name ?? "名称なし"}」を作ります`,
        "申請の写真は、掲載の写真になります",
        notice,
      ];
    case "listingRevision":
      return [
        `${nameOf(view, "listing", "掲載")} に、変更する項目（${items}）だけを反映します`,
        ...(content.droppedPhotos > 0
          ? [
              `申請の写真のうち${content.droppedPhotos}枚は、提出の後に掲載から外れたか削除されたため、反映しません`,
            ]
          : []),
        "ほかの項目は、いまの内容のまま残ります",
        notice,
      ];
    case "affiliation": {
      const region = nameOf(view, "region", "地域");
      return [
        `${place}が、${region}の所属店舗になります`,
        `${region}のページと地図に、${place}とその掲載が表示されます`,
        "店舗の他の地域への所属と、公開状態・提供状態は変わりません",
        notice,
      ];
    }
    case "leave": {
      const region = nameOf(view, "region", "地域");
      return [
        `${place}の${region}への所属が解除されます`,
        `${region}のページと地図に、${place}とその掲載は表示されなくなります`,
        "店舗の他の地域への所属と、公開状態・提供状態は変わりません",
        notice,
      ];
    }
    case "participation": {
      const occasion = nameOf(view, "occasion", "イベント");
      const listings =
        view.content.kind === "participation"
          ? view.content.listings.length
          : 0;
      return [
        `${place}が、${occasion}の参加店舗になります`,
        listings === 0
          ? "申請の参加日が、イベントのページに表示されます"
          : `添えた掲載（${listings}件）と参加日が、イベントのページに表示されます。閲覧者に表示されていない掲載は、表示されないままです`,
        notice,
      ];
    }
  }
}

/** What an approval did, for CS-13. */
function approvedText(view: ApplicationForReview): string {
  const place = nameOf(view, "place", "店舗");
  switch (view.content.kind) {
    case "registration":
      return "店舗を登録して公開しました。";
    case "revision":
      return "申請の項目を、店舗の内容に反映しました。";
    case "stewardship":
      return "申請者が店舗管理者になりました。";
    case "listing":
      return "掲載を公開中の掲載として作りました。";
    case "listingRevision":
      return "申請の項目を、掲載の内容に反映しました。";
    case "affiliation":
      return `${place}が、${nameOf(view, "region", "地域")}の所属店舗になりました。`;
    case "leave":
      return `${place}が、${nameOf(view, "region", "地域")}の所属店舗から外れました。`;
    case "participation":
      return `${place}が、${nameOf(view, "occasion", "イベント")}の参加店舗になりました。`;
  }
}

const REFLECTED_TITLE: Readonly<Record<ContentRef["kind"], string>> = {
  place: "店舗ページを見る",
  listing: "掲載ページを見る",
  region: "地域ページを見る",
  occasion: "イベントページを見る",
  article: "読みもののページを見る",
};

function reflectedStep(reflected: ContentRef): NextStep | null {
  const href = viewerPath(reflected);
  if (href === null) return null;
  return {
    href,
    title: REFLECTED_TITLE[reflected.kind],
    meta: "閲覧者に見えるページです",
  };
}

/** The region or event whose stewards decide `view`, when they do. */
function seatOf(view: ApplicationForReview): ReviewSeat | null {
  const { content } = view;
  switch (content.kind) {
    case "affiliation":
    case "leave":
      return {
        kind: "region",
        id: content.regionId,
        name: nameOf(view, "region", "名称のない地域"),
      };
    case "participation":
      return {
        kind: "occasion",
        id: content.occasionId,
        name: nameOf(view, "occasion", "名称のないイベント"),
      };
    default:
      return null;
  }
}

/**
 * CM-01's frame: the seat's management nav for one of its stewards, the
 * operators' nav otherwise (an operator standing in for absent stewards
 * too — `basis: "proxy"`). The frame read refuses an operator facing a
 * region or event with stewards, and a missing seat: both are framed as
 * the operators' screen.
 */
async function frameOf(
  container: RequestContainer,
  actor: Actor,
  seat: ReviewSeat | null,
): Promise<ReviewFrame> {
  if (seat === null) return { kind: "ops" };
  try {
    if (seat.kind === "region") {
      const frame = await loadRegionFrame(seat.id);
      return frame.basis === "steward"
        ? { kind: "region", frame }
        : { kind: "ops" };
    }
    const frame = await loadOccasionFrame(container, actor, seat.id);
    return frame.basis === "steward"
      ? { kind: "occasion", frame }
      : { kind: "ops" };
  } catch (error) {
    if (isForbiddenError(error) || isNotFoundError(error)) {
      return { kind: "ops" };
    }
    throw error;
  }
}

function toData(
  view: ApplicationForReview,
  frame: ReviewFrame,
  seat: ReviewSeat | null,
  proxyableAt: Date | null,
): ApplicationReviewData {
  const read = contentData(view.content);
  // An event's steward reads its period from the frame: the days are
  // checked against it (CM-01 参加日).
  const period = frame.kind === "occasion" ? frame.frame.period : null;
  const content =
    period === null
      ? read
      : {
          ...read,
          rows: read.rows.map((row) =>
            row.label === "参加日" && row.value.kind === "text"
              ? {
                  ...row,
                  value: {
                    ...row.value,
                    sub: `開催期間 ${periodText(period)}`,
                  },
                }
              : row,
          ),
        };
  return {
    id: view.id,
    kind: view.kind,
    frame,
    seat,
    proxyableAt: proxyableAt?.toISOString() ?? null,
    approvedText: approvedText(view),
    version: view.version,
    status: statusData(view.status),
    submittedAt: view.submittedAt.toISOString(),
    subjects: reviewSubjects(view.subjects),
    applicant: reviewerApplicantText(view.applicant),
    stance: stanceOf(view),
    content,
    facts: facts(view),
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
    reflected: view.reflected === null ? null : reflectedStep(view.reflected),
    approveEffects: approveEffects(view, content),
  };
}

async function actorAndContainer(): Promise<
  Readonly<{ container: RequestContainer; actor: Actor }>
> {
  const container = await getContainer();
  return { container, actor: await requireActor(container) };
}

/** See `loadApplicationReviewFn`. */
export async function loadApplicationReview(
  rawId: string,
): Promise<ApplicationReviewData> {
  const { container, actor } = await actorAndContainer();
  const view = await getApplicationForReview({
    container,
    actor,
    input: { applicationId: applicationIdOf(rawId) },
  });
  const seat = seatOf(view);
  const { status, permission } = view;
  const proxyableAt =
    status.kind === "underReview" &&
    !permission.allowed &&
    permission.reason === "awaitingStewards"
      ? ReviewPolicy.proxyableAt({ status }, container.reviewPolicy)
      : null;
  return toData(view, await frameOf(container, actor, seat), seat, proxyableAt);
}

type Decision = Readonly<{ applicationId: string; version: number }>;

const decisionInput = (data: Decision) => ({
  applicationId: applicationIdOf(data.applicationId),
  version: Version.create(data.version),
});

function approvalResult(
  outcome: ApprovalOutcome,
  companionId: string | null = null,
): ApprovalResult {
  if (outcome.outcome === "lapsed") {
    return {
      outcome: "lapsed",
      premises: outcome.brokenPremises.map(
        (key) => REVIEW_BROKEN_PREMISE_TEXT[key],
      ),
    };
  }
  const { status } = outcome.application;
  return {
    outcome: "approved",
    reflected: reflectedStep(outcome.reflected),
    overdueProxy:
      status.kind === "approved" &&
      "reviewAs" in status &&
      status.reviewAs === "overdue_proxy",
    companionId,
  };
}

/** See `approveApplicationFn`: the kind's approval usecase. */
export async function approveReviewedApplication(
  data: Decision & Readonly<{ kind: ApplicationKind }>,
): Promise<ApprovalResult> {
  const { container, actor } = await actorAndContainer();
  const args = { container, actor, input: decisionInput(data) };
  switch (data.kind) {
    case "registration": {
      const result = await approvePlaceRegistration(args);
      return approvalResult(result, result.companion?.id ?? null);
    }
    case "revision":
      return approvalResult(await approvePlaceRevision(args));
    case "stewardship":
      return approvalResult(await approveStewardshipClaim(args));
    case "affiliation":
      return approvalResult(await approveAffiliation(args));
    case "leave":
      return approvalResult(await approveLeave(args));
    case "participation":
      return approvalResult(await approveParticipation(args));
    case "listing":
      return approvalResult(await approveNewListing(args));
    case "listingRevision":
      return approvalResult(await approveListingRevision(args));
  }
}

/** See `rejectApplicationFn`. */
export async function rejectReviewedApplication(
  data: Decision & Readonly<{ reason: string }>,
): Promise<Readonly<{ overdueProxy: boolean }>> {
  const { container, actor } = await actorAndContainer();
  const { status } = await rejectApplication({
    container,
    actor,
    input: { ...decisionInput(data), reason: data.reason },
  });
  return {
    overdueProxy:
      status.kind === "rejected" &&
      "reviewAs" in status &&
      status.reviewAs === "overdue_proxy",
  };
}

/** See `sendBackApplicationFn`. */
export async function sendBackReviewedApplication(
  data: Decision & Readonly<{ request: string }>,
): Promise<void> {
  const { container, actor } = await actorAndContainer();
  await sendBackApplication({
    container,
    actor,
    input: { ...decisionInput(data), request: data.request },
  });
}
