// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import type { ApprovalOutcome } from "@repo/core/application/application/approval";
import { approveListingRevision } from "@repo/core/application/application/approveListingRevision";
import { approveNewListing } from "@repo/core/application/application/approveNewListing";
import { approvePlaceRegistration } from "@repo/core/application/application/approvePlaceRegistration";
import { approvePlaceRevision } from "@repo/core/application/application/approvePlaceRevision";
import { approveStewardshipClaim } from "@repo/core/application/application/approveStewardshipClaim";
import {
  type ApplicationForReview,
  getApplicationForReview,
  type ReviewSubjectView,
} from "@repo/core/application/application/getApplicationForReview";
import { rejectApplication } from "@repo/core/application/application/rejectApplication";
import { sendBackApplication } from "@repo/core/application/application/sendBackApplication";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { ForbiddenError } from "@repo/core/application/errors";
import type { ApplicationKind } from "@repo/core/domain/application/application";
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
  ReviewStance,
} from "./applicationReview";
import { reviewerApplicantText, subjectName } from "./applicationSubjects";
import { REVIEW_BROKEN_PREMISE_TEXT } from "./applicationWords";
import type { NextStep } from "./myApplicationDetail";

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

const VIEWABILITY_NOTE = {
  viewable: null,
  notViewable:
    "閲覧者には表示されていません（運営による非公開、または一時非公開）。申請は確認中のまま判断できます。",
  missing: "削除されていて、ありません。",
  notYet: null,
} as const satisfies Readonly<
  Record<ReviewSubjectView["viewability"], string | null>
>;

/**
 * A place is hidden from viewers only while suspended, and its listings
 * with it; a listing's own reason (運営による非公開 or 一時非公開) is not
 * in the review read.
 */
function viewabilityNote(
  subject: ReviewSubjectView,
  subjects: readonly ReviewSubjectView[],
): string | null {
  if (subject.viewability !== "notViewable") {
    return VIEWABILITY_NOTE[subject.viewability];
  }
  if (subject.ref.kind === "place") {
    return "店舗が運営による非公開で、閲覧者には表示されていません。申請は確認中のまま判断できます。";
  }
  const placeHidden = subjects.some(
    ({ ref, viewability }) =>
      ref.kind === "place" && viewability === "notViewable",
  );
  return placeHidden
    ? "店舗が運営による非公開のため、閲覧者には表示されていません。申請は確認中のまま判断できます。"
    : VIEWABILITY_NOTE.notViewable;
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
  }
}

function reflectedStep(
  kind: ApplicationKind,
  reflected: ContentRef,
): NextStep | null {
  const href = viewerPath(reflected);
  if (href === null) return null;
  return {
    href,
    title:
      kind === "listing" || kind === "listingRevision"
        ? "掲載ページを見る"
        : "店舗ページを見る",
    meta: "閲覧者に見えるページです",
  };
}

function toData(view: ApplicationForReview): ApplicationReviewData {
  const content = contentData(view.content);
  return {
    id: view.id,
    kind: view.kind,
    version: view.version,
    status: statusData(view.status),
    submittedAt: view.submittedAt.toISOString(),
    subjects: subjectItems(view.subjects, (s) =>
      viewabilityNote(s, view.subjects),
    ),
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
    reflected:
      view.reflected === null ? null : reflectedStep(view.kind, view.reflected),
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
  return toData(view);
}

type Decision = Readonly<{ applicationId: string; version: number }>;

const decisionInput = (data: Decision) => ({
  applicationId: applicationIdOf(data.applicationId),
  version: Version.create(data.version),
});

function approvalResult(
  kind: ApplicationKind,
  outcome: ApprovalOutcome,
  companionId: string | null,
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
    reflected: reflectedStep(kind, outcome.reflected),
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
      return approvalResult(data.kind, result, result.companion?.id ?? null);
    }
    case "revision":
      return approvalResult(data.kind, await approvePlaceRevision(args), null);
    case "stewardship":
      return approvalResult(
        data.kind,
        await approveStewardshipClaim(args),
        null,
      );
    case "listing":
      return approvalResult(data.kind, await approveNewListing(args), null);
    case "listingRevision":
      return approvalResult(
        data.kind,
        await approveListingRevision(args),
        null,
      );
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
