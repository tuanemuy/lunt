import type { ApplicationKind } from "@repo/core/domain/application/application";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  ContentData,
  PairedApplication,
  StatusData,
  SubjectItem,
} from "./applicationContent";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import type { NextStep } from "./myApplicationDetail";
import type { OccasionFrame } from "./occasionView";
import type { RegionFrame } from "./regionView";
import { validateInput } from "./validator";

/**
 * CM-01 申請の判断 (`spec/pages/shared.md`): what the reviewer sees and the
 * three decisions. Server-only reads live in `applicationReviewData.ts`.
 */

/**
 * What the viewer may do now (`ReviewPermission`): decide as the approver
 * or as the overdue proxy (approve and reject only), or only look —
 * 期間超過の前 (`awaitingStewards`) or 登録の判断待ち (`registrationPending`).
 */
export type ReviewStance =
  | "approver"
  | "overdueProxy"
  | "awaitingStewards"
  | "registrationPending";

/** An existing store near a registration's name or address (suspended ones too). */
export type SimilarPlace = Readonly<{
  placeId: string;
  name: string;
  address: string;
  suspended: boolean;
}>;

export type ReviewFactsData =
  | Readonly<{ kind: "registration"; similarPlaces: readonly SimilarPlace[] }>
  | Readonly<{ kind: "stewardship"; placeHasSteward: boolean }>
  | Readonly<{ kind: "none" }>;

/**
 * The area CM-01 is drawn in, by who opened it (`spec/pages/index.md`
 * 「読みもの編集とサービス運営のナビゲーション」): the region's or event's
 * steward sees its management nav; everyone else — an operator, also
 * one deciding for a region or event without stewards — the operators'.
 */
export type ReviewFrame =
  | Readonly<{ kind: "ops" }>
  | Readonly<{ kind: "region"; frame: RegionFrame }>
  | Readonly<{ kind: "occasion"; frame: OccasionFrame }>;

/** The region or event whose stewards decide an affiliation, leave or participation. */
export type ReviewSeat = Readonly<{
  kind: "region" | "occasion";
  id: string;
  name: string;
}>;

export type ApplicationReviewData = Readonly<{
  id: string;
  kind: ApplicationKind;
  frame: ReviewFrame;
  /** `null` for the kinds the operators decide. */
  seat: ReviewSeat | null;
  /**
   * ISO; when the operators may decide in the stewards' place — shown
   * while the application awaits them (期間超過の前). `null` otherwise.
   */
  proxyableAt: string | null;
  /** What approving did, for CS-13 (`…が、…の所属店舗になりました。`). */
  approvedText: string;
  /** The version the decision is sent against (CS-07). */
  version: number;
  status: StatusData;
  /** ISO; the first submission. */
  submittedAt: string;
  subjects: readonly SubjectItem[];
  /** 個人 / 店舗管理者として（喫茶 日々） */
  applicant: string;
  stance: ReviewStance;
  content: ContentData;
  facts: ReviewFactsData;
  /** A registration's companion claim, or a claim's registration. */
  pair: PairedApplication | null;
  /** Where an approval landed (the viewer's page). */
  reflected: NextStep | null;
  /** What approving reflects, for the confirmation (CS-12). */
  approveEffects: readonly string[];
}>;

const applicationIdField = z.string().trim().min(1).max(128);

export const reviewRefSchema = z.object({ applicationId: applicationIdField });

/**
 * CM-01's loader. `NotFoundError` (CS-17) for no application,
 * `ForbiddenError` (CS-05) for someone who is neither its approver nor an
 * operator who may stand in.
 */
export const loadApplicationReviewFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(reviewRefSchema))
  .handler(async ({ data }): Promise<ApplicationReviewData> => {
    const { loadApplicationReview } = await import("./applicationReviewData");
    return loadApplicationReview(data.applicationId);
  });

/** Characters of a reason or a request (the transport's DoS limit). */
export const REVIEW_TEXT_MAX = 2000;

const decisionBase = z.object({
  applicationId: applicationIdField,
  version: z.number().int().min(0),
});

const reviewText = z.string().max(REVIEW_TEXT_MAX, "長すぎます");

export const rejectApplicationSchema = decisionBase.extend({
  reason: reviewText,
});

export const sendBackApplicationSchema = decisionBase.extend({
  request: reviewText,
});

export const approveApplicationSchema = decisionBase.extend({
  kind: z.enum([
    "registration",
    "revision",
    "stewardship",
    "affiliation",
    "leave",
    "participation",
    "listing",
    "listingRevision",
  ]),
});

/**
 * An approval's outcome: reflected (with where, and a registration's
 * companion claim to decide next), or lapsed because a premise no longer
 * held (CS-08, nothing reflected).
 */
export type ApprovalResult =
  | Readonly<{
      outcome: "approved";
      reflected: NextStep | null;
      overdueProxy: boolean;
      companionId: string | null;
    }>
  | Readonly<{ outcome: "lapsed"; premises: readonly string[] }>;

/** 承認: dispatched to the kind's approval usecase. */
export const approveApplicationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(approveApplicationSchema))
  .handler(async ({ data }): Promise<ApprovalResult> => {
    const { approveReviewedApplication } = await import(
      "./applicationReviewData"
    );
    return approveReviewedApplication(data);
  });

/** 否認: the reason is required (CS-10 through its business code). */
export const rejectApplicationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(rejectApplicationSchema))
  .handler(async ({ data }): Promise<Readonly<{ overdueProxy: boolean }>> => {
    const { rejectReviewedApplication } = await import(
      "./applicationReviewData"
    );
    return rejectReviewedApplication(data);
  });

/** 差し戻し: the request is required; never as the overdue proxy. */
export const sendBackApplicationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(sendBackApplicationSchema))
  .handler(async ({ data }) => {
    const { sendBackReviewedApplication } = await import(
      "./applicationReviewData"
    );
    await sendBackReviewedApplication(data);
    return null;
  });
