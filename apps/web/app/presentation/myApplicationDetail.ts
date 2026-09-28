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
import { validateInput } from "./validator";

/**
 * MY-05 申請の詳細 (`spec/pages/account.md`): what the applicant sees of one
 * application, and the withdrawal. Server-only reads live in
 * `myApplicationDetailData.ts`.
 */

/** A destination offered by the screen (反映先, 次に行えること). */
export type NextStep = Readonly<{ href: string; title: string; meta: string }>;

export type MyApplicationData = Readonly<{
  id: string;
  kind: ApplicationKind;
  /** The version a withdrawal is sent against (CS-07). */
  version: number;
  status: StatusData;
  /** ISO; the first submission. */
  submittedAt: string;
  subjects: readonly SubjectItem[];
  /** あなた（個人） / 喫茶 日々（店舗） */
  applicant: string;
  /** Made as a store's steward: every steward of it sees and handles it alike. */
  asSteward: boolean;
  /** Who decides it: サービス運営者 … */
  approver: string;
  content: ContentData;
  /** A registration's companion claim, or a claim's registration (併せた申請). */
  pair: PairedApplication | null;
  /** Where the approval landed (DT-01 / DT-02, SM-01 for a claim). */
  reflected: NextStep | null;
  /** RQ-02〜RQ-04 in 再提出 (returned) or 入力 from this one (ended). */
  resubmitHref: string | null;
  reapplyHref: string | null;
  /** 失効: where the applicant can go next (APP-05), besides reapplying. */
  nextSteps: readonly NextStep[];
}>;

const applicationIdField = z.string().trim().min(1).max(128);

export const applicationRefSchema = z.object({
  applicationId: applicationIdField,
});

/**
 * MY-05's loader: the application as its applicant reads it.
 * `NotFoundError` (CS-06) for none, `ForbiddenError` (CS-05) for someone
 * else's, or a store's the viewer no longer manages.
 */
export const loadMyApplicationFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(applicationRefSchema))
  .handler(async ({ data }): Promise<MyApplicationData> => {
    const { loadMyApplication } = await import("./myApplicationDetailData");
    return loadMyApplication(data.applicationId);
  });

export const withdrawApplicationSchema = z.object({
  applicationId: applicationIdField,
  version: z.number().int().min(0),
});

/** 取り下げ (CS-12 confirmed on the screen): final, nothing is reflected. */
export const withdrawApplicationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(withdrawApplicationSchema))
  .handler(async ({ data }) => {
    const { withdrawMyApplication } = await import("./myApplicationDetailData");
    await withdrawMyApplication(data.applicationId, data.version);
    return null;
  });
