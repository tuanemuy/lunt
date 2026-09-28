import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { validateInput } from "./validator";

/*
 * Takedown claims (RQ-07, OM-04), info reports (RQ-08, OM-05, SM-07) and
 * the operators' inbox (OM-01): the screens' data, words, paths and
 * server functions. Client-safe; the reads live in `moderationData.ts`.
 */

const idField = z.string().trim().min(1).max(128);
const TEXT_MAX = 4000;

/** The targets a claim or a report can name in this stage (DT-01, DT-02). */
export const REPORT_TARGET_KINDS = ["place", "listing"] as const;
export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number];

export const isReportTargetKind = (kind: string): kind is ReportTargetKind =>
  (REPORT_TARGET_KINDS as readonly string[]).includes(kind);

const targetField = z.object({
  kind: z.enum(REPORT_TARGET_KINDS),
  id: idField,
});

/** DT-01 / DT-02 of a target, a plain path (another area). */
export const detailPath = (kind: ReportTargetKind, id: string): string =>
  kind === "place"
    ? `/places/${encodeURIComponent(id)}`
    : `/listings/${encodeURIComponent(id)}`;

/** RQ-02 情報の修正 / RQ-04 掲載の修正, a plain path (another area). */
export const revisionPath = (kind: ReportTargetKind, id: string): string =>
  kind === "place"
    ? `/apply/places/${encodeURIComponent(id)}/revision`
    : `/apply/listings/${encodeURIComponent(id)}/revision`;

/** `9月24日`, the Japan-time calendar day of `iso`. */
export function dayText(iso: string): string {
  const day = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${day.getUTCMonth() + 1}月${day.getUTCDate()}日`;
}

/** A target as a photo row shows it (RQ-07, RQ-08). */
export type ReportTargetRow = Readonly<{
  kind: ReportTargetKind;
  id: string;
  name: string;
  /** 掲載 · 食べる, 店舗 */
  meta: string;
  /** The listing's store, the store's address. */
  sub: string | null;
  photoUrl: string | null;
}>;

// ---------------------------------------------------------------- RQ-07

export const CLAIMANT_STANDINGS = ["proprietor", "photoRightsHolder"] as const;
export type ClaimantStandingValue = (typeof CLAIMANT_STANDINGS)[number];

export const STANDING_LABEL: Readonly<Record<ClaimantStandingValue, string>> = {
  proprietor: "店舗本人",
  photoRightsHolder: "写真の権利者",
};

export type TakedownPhoto = Readonly<{ photoId: string; url: string | null }>;

/** RQ-07 as it opens: the target with its current photos, or CS-06. */
export type TakedownPage =
  | Readonly<{
      kind: "form";
      target: ReportTargetRow;
      photos: readonly TakedownPhoto[];
    }>
  | Readonly<{ kind: "unavailable" }>;

const pageParams = z.object({ kind: z.string().max(32), id: idField });

/**
 * RQ-07's target as viewers see it (no login). A target that is not
 * viewable, or of a kind this stage cannot show, opens as CS-06.
 */
export const loadTakedownPageFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(pageParams))
  .handler(async ({ data }): Promise<TakedownPage> => {
    const { loadTakedownPage } = await import("./moderationData");
    return loadTakedownPage(data.kind, data.id);
  });

export const submitTakedownClaimSchema = z.object({
  claimId: z.string().min(1).max(64),
  standing: z.enum(CLAIMANT_STANDINGS),
  target: targetField,
  photoIds: z.array(idField).max(100),
  reason: z.string().max(TEXT_MAX),
  email: z.string().max(320),
});

/** RQ-07: receives a claim without a login (MOD-01). */
export const submitTakedownClaimFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(submitTakedownClaimSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { submitTakedownClaim },
      { parseGeneratedId },
      { contentRefOf, photoIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("@repo/core/application/moderation/submitTakedownClaim"),
      import("./validator"),
      import("./moderationIds"),
    ]);
    const container = await getContainer();
    await submitTakedownClaim({
      container,
      input: {
        claimId: parseGeneratedId(
          container.idGenerator,
          "claimId",
          data.claimId,
        ),
        standing: data.standing,
        target: contentRefOf(data.target.kind, data.target.id),
        photoIds: data.photoIds.map(photoIdOf),
        reason: data.reason,
        email: data.email,
      },
    });
    return null;
  });

// ---------------------------------------------------------------- RQ-08

export const INFO_REPORT_CATEGORIES = ["incorrectInfo", "closure"] as const;
export type InfoReportCategoryValue = (typeof INFO_REPORT_CATEGORIES)[number];

export const CATEGORY_LABEL: Readonly<Record<InfoReportCategoryValue, string>> =
  {
    incorrectInfo: "情報の誤り",
    closure: "閉店",
  };

/**
 * The application screens that send a user to RQ-08 from their
 * 受け付けない state (`?from=`), for the notice that says where they came
 * from.
 */
export const INFO_REPORT_SOURCES = [
  "placeRevision",
  "newListing",
  "listingRevision",
  "affiliation",
] as const;
export type InfoReportSource = (typeof INFO_REPORT_SOURCES)[number];

export const INFO_REPORT_SOURCE_LABEL: Readonly<
  Record<InfoReportSource, string>
> = {
  placeRevision: "情報の修正の申請",
  newListing: "掲載の申請",
  listingRevision: "掲載の修正の申請",
  affiliation: "所属・離脱の申請",
};

export const infoReportSearchSchema = z.object({
  from: z.enum(INFO_REPORT_SOURCES).optional().catch(undefined),
});

/**
 * RQ-08 as it opens: the target (and a listing's store), the refusal
 * when the store has no steward, or CS-06.
 */
export type InfoReportPage =
  | Readonly<{
      kind: "form" | "refused";
      target: ReportTargetRow;
      /** A listing's store; `null` for a store. */
      place: ReportTargetRow | null;
    }>
  | Readonly<{ kind: "unavailable" }>;

/** RQ-08's target as viewers see it, with whether its store has a steward. */
export const loadInfoReportPageFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(pageParams))
  .handler(async ({ data }): Promise<InfoReportPage> => {
    const { loadInfoReportPage } = await import("./moderationData");
    return loadInfoReportPage(data.kind, data.id);
  });

export const submitInfoReportSchema = z.object({
  reportId: z.string().min(1).max(64),
  target: targetField,
  category: z.enum(INFO_REPORT_CATEGORIES),
  content: z.string().max(TEXT_MAX),
});

/** RQ-08: a signed-in user reports wrong information or a closure (MOD-04). */
export const submitInfoReportFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(submitInfoReportSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { submitInfoReport },
      { parseGeneratedId },
      { placeIdOf, listingIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/moderation/submitInfoReport"),
      import("./validator"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await submitInfoReport({
      container,
      actor,
      input: {
        reportId: parseGeneratedId(
          container.idGenerator,
          "reportId",
          data.reportId,
        ),
        target:
          data.target.kind === "place"
            ? { kind: "place", placeId: placeIdOf(data.target.id) }
            : { kind: "listing", listingId: listingIdOf(data.target.id) },
        category: data.category,
        content: data.content,
      },
    });
    return null;
  });

// ---------------------------------------------------------------- OM-01

/** OM-01's four kinds, in the screen's order (`?kind=` jumps to one). */
export const INBOX_KINDS = ["app", "overdue", "claim", "report"] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

export const opsInboxSearchSchema = z.object({
  kind: z.enum(INBOX_KINDS).optional().catch(undefined),
});

export type InboxApplicationRow = Readonly<{
  applicationId: string;
  /** The subject (いちじくのパフェ（喫茶 日々）, or the store not yet registered). */
  title: string;
  /** 店舗の登録申請 · 店舗はまだありません */
  sub: string;
  applicant: string;
  /** 確認中 · 9月25日に提出 */
  status: string;
}>;

export type InboxClaimRow = Readonly<{
  claimId: string;
  title: string;
  sub: string;
  claimant: string;
  status: string;
}>;

export type InboxReportRow = Readonly<{
  reportId: string;
  title: string;
  sub: string;
  reporter: string;
  status: string;
}>;

export type InboxSection<T> = Readonly<{ items: readonly T[]; count: number }>;

export type OpsInboxData = Readonly<{
  asApprover: InboxSection<InboxApplicationRow>;
  asOverdueProxy: InboxSection<InboxApplicationRow>;
  claims: InboxSection<InboxClaimRow>;
  reports: InboxSection<InboxReportRow>;
}>;

/** Rows shown per kind; the count says how many wait in all. */
export const INBOX_PAGE_SIZE = 100;

// ---------------------------------------------------------------- OM-04

export type ClaimTargetState =
  | Readonly<{ kind: "gone" }>
  | Readonly<{
      kind: "present";
      /** Viewers can see it (`ReferenceQueries.isViewable`). */
      viewable: boolean;
      /** 公開 · 提供中, 営業中 · 公開中 … */
      stateText: string;
      /** Suspended by the operators (掲載の運営による非公開, 店舗の非公開). */
      suspended: boolean;
    }>;

export type ClaimPhoto = Readonly<{
  photoId: string;
  url: string | null;
  claimed: boolean;
}>;

export type TakedownClaimData = Readonly<{
  claimId: string;
  status: "open" | "resolved";
  standing: ClaimantStandingValue;
  target: Readonly<{
    kind: "place" | "listing" | "region" | "occasion" | "article";
    id: string;
    /** `null` when gone. */
    name: string | null;
    /** A listing's store, for the target line. */
    placeName: string | null;
  }>;
  targetState: ClaimTargetState;
  photos: readonly ClaimPhoto[];
  /** How many named photos the target no longer has. */
  removedClaimedCount: number;
  /** How many photos the claimant named. */
  claimedCount: number;
  reason: string;
  email: string;
  receivedAt: string;
  /** Set once resolved (the claim keeps no resolution date). */
  outcome: string | null;
}>;

export const takeDownPhotosSchema = z.object({
  claimId: idField,
  target: targetField,
  photoIds: z.array(idField).min(1).max(100),
});

export type TakeDownPhotosResult = Readonly<{
  /** The target's publication after the removal; `null` for a store. */
  publication: "draft" | "published" | "unpublished" | null;
  unpublished: boolean;
}>;

/** OM-04: removes photos from the claim's target (MOD-02). */
export const takeDownPhotosByClaimFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(takeDownPhotosSchema))
  .handler(async ({ data }): Promise<TakeDownPhotosResult> => {
    const [
      { getContainer },
      { requireActor },
      { takeDownPhotosByClaim },
      { contentRefOf, photoIdOf, claimIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/moderation/takeDownPhotosByClaim"),
      import("./moderationIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const [first, ...rest] = data.photoIds.map(photoIdOf);
    if (first === undefined) return { publication: null, unpublished: false };
    const result = await takeDownPhotosByClaim({
      container,
      actor,
      input: {
        claimId: claimIdOf(data.claimId),
        target: contentRefOf(data.target.kind, data.target.id),
        photoIds: [first, ...rest],
      },
    });
    return {
      publication:
        result.publication === null
          ? null
          : result.publication === "published"
            ? "published"
            : result.publication === "draft"
              ? "draft"
              : "unpublished",
      unpublished: result.unpublished,
    };
  });

export const resolveTakedownClaimSchema = z.object({
  claimId: idField,
  outcome: z.string().max(TEXT_MAX),
});

/** OM-04: closes a claim with its outcome, mailed to the claimant. */
export const resolveTakedownClaimFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(resolveTakedownClaimSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { resolveTakedownClaim },
      { claimIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/moderation/resolveTakedownClaim"),
      import("./moderationIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await resolveTakedownClaim({
      container,
      actor,
      input: { claimId: claimIdOf(data.claimId), outcome: data.outcome },
    });
    return null;
  });

// ---------------------------------------------------------------- OM-05

export type InfoReportStatusValue =
  | "open"
  | "confirmationRequested"
  | "resolved";

export const REPORT_STATUS_LABEL: Readonly<
  Record<InfoReportStatusValue, string>
> = {
  open: "未対応",
  confirmationRequested: "確認依頼中",
  resolved: "対応済み",
};

export type InfoReportData = Readonly<{
  reportId: string;
  status: InfoReportStatusValue;
  category: InfoReportCategoryValue;
  content: string;
  target: Readonly<{
    kind: ReportTargetKind;
    placeId: string;
    listingId: string | null;
    placeName: string | null;
    listingName: string | null;
    /** The reported listing (or store) exists. */
    exists: boolean;
    viewable: boolean;
  }>;
  /** `null` once the reporter withdrew. */
  reporterEmail: string | null;
  receivedAt: string;
  requestedAt: string | null;
  /** The store now, when it could be read. */
  place: Readonly<{
    stateText: string;
    suspended: boolean;
    stewardCount: number;
  }> | null;
}>;

const reportRef = z.object({ reportId: idField });

/** OM-05: asks every steward of the store to check the report. */
export const requestInfoReportConfirmationFn = createServerFn({
  method: "POST",
})
  .middleware([errorResponseMiddleware])
  .validator(validateInput(reportRef))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { requestInfoReportConfirmation },
      { reportIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/moderation/requestInfoReportConfirmation"),
      import("./moderationIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await requestInfoReportConfirmation({
      container,
      actor,
      input: { reportId: reportIdOf(data.reportId) },
    });
    return null;
  });

/** OM-05: closes the report. */
export const resolveInfoReportFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(reportRef))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { resolveInfoReport },
      { reportIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/moderation/resolveInfoReport"),
      import("./moderationIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await resolveInfoReport({
      container,
      actor,
      input: { reportId: reportIdOf(data.reportId) },
    });
    return null;
  });

/** The way back from an absence proxy opened by OM-05 (`?via=report:<id>`). */
export const reportVia = (reportId: string): string => `report:${reportId}`;

// ---------------------------------------------------------------- SM-07

export type ConfirmationRequestData = Readonly<{
  reportId: string;
  status: "confirmationRequested" | "resolved";
  category: InfoReportCategoryValue;
  content: string;
  requestedAt: string;
  target: Readonly<{
    kind: ReportTargetKind;
    placeId: string;
    listingId: string | null;
    placeName: string | null;
    listingName: string | null;
    exists: boolean;
  }>;
}>;

/** A store's open request on SM-01. */
export type ConfirmationRequestItem = Readonly<{
  reportId: string;
  title: string;
  requestedAt: string;
}>;

/** SM-01's 対応が必要なこと: the returned applications and the open requests. */
export type ShopTodo = Readonly<{
  returned: readonly Readonly<{ applicationId: string; title: string }>[];
  requests: Readonly<{
    items: readonly ConfirmationRequestItem[];
    count: number;
  }>;
}>;

/**
 * The notification's landing (`/manage/checks/$reportId`): the store the
 * request belongs to, so the route can open SM-07 under it.
 */
export const resolveConfirmationRequestPlaceFn = createServerFn({
  method: "GET",
})
  .middleware([errorResponseMiddleware])
  .validator(validateInput(reportRef))
  .handler(async ({ data }): Promise<{ placeId: string }> => {
    const { loadConfirmationRequest } = await import("./moderationData");
    const request = await loadConfirmationRequest(data.reportId);
    return { placeId: request.target.placeId };
  });

/** 営業時間の誤りの連絡 style title of a request: 〈対象〉の〈種類〉の連絡. */
export function requestTitle(
  category: InfoReportCategoryValue,
  target: Readonly<{
    kind: ReportTargetKind;
    placeName: string | null;
    listingName: string | null;
    exists: boolean;
  }>,
): string {
  const name =
    target.kind === "place"
      ? (target.placeName ?? "店舗")
      : target.exists
        ? (target.listingName ?? "名称未設定の掲載")
        : target.listingName === null
          ? "削除された掲載"
          : `${target.listingName}（削除済み）`;
  return `${name}の${CATEGORY_LABEL[category]}の連絡`;
}
