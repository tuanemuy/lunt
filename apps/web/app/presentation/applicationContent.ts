import type { ApplicationKind } from "@repo/core/domain/application/application";
import type { ApplicationStatusKind } from "@repo/core/domain/application/status";
import type { Framing } from "./listingView";

/*
 * What an application asks for, as MY-05 and CM-01 show it: plain,
 * serializable rows built on the server (`applicationContentData.ts`).
 * Client-safe.
 */

/** A photo of the content; `note` marks one a revision adds or lost since. */
export type ContentPhoto = Readonly<{
  photoId: string;
  /** `null` when the content is not (or no longer) stored. */
  url: string | null;
  framing: Framing | null;
  note: string | null;
}>;

/**
 * A listing a participation application attaches, with its state now:
 * `href` (DT-01) only while viewers can see it; `state` says why not
 * (一時非公開, 運営による非公開, 削除された掲載…) or its offering phase.
 */
export type AttachedLine = Readonly<{
  id: string;
  name: string;
  state: string;
  hidden: boolean;
  href: string | null;
  /** The representative photo, only while viewers see the listing. */
  photoUrl: string | null;
}>;

export type ContentValue =
  | Readonly<{ kind: "text"; text: string; sub?: string }>
  | Readonly<{ kind: "quote"; text: string }>
  | Readonly<{ kind: "photos"; photos: readonly ContentPhoto[] }>
  | Readonly<{ kind: "listings"; listings: readonly AttachedLine[] }>;

/** One item of the content (名称, 所在地, 写真…). */
export type ContentRow = Readonly<{ label: string; value: ContentValue }>;

/** One changed item of a revision: the target's value now and the application's. */
export type ComparedRow = Readonly<{
  label: string;
  current: ContentValue;
  proposed: ContentValue;
}>;

/**
 * The content of one application. A revision (情報修正・掲載の修正) shows
 * only its changed items side by side (`compare`) and the target with
 * them laid on (`preview`, what approval reflects); a listing revision
 * whose listing is gone shows only the proposed values (`rows`,
 * `targetGone`).
 */
export type ContentData = Readonly<{
  rows: readonly ContentRow[];
  compare: readonly ComparedRow[] | null;
  preview: readonly ContentRow[] | null;
  targetGone: boolean;
  /**
   * Photos of a listing revision that are no longer on the listing since
   * submission, so approval leaves them out (LST-14); `noPhotoLeft` when
   * none would remain and approval is refused.
   */
  droppedPhotos: number;
  noPhotoLeft: boolean;
}>;

/** A subject of an application with where it opens (`null`: not yet, or nowhere). */
export type SubjectItem = Readonly<{
  /** 店舗 / 掲載 */
  label: string;
  name: string;
  href: string | null;
  /** 店舗はまだありません… / 閲覧者には表示されていません… */
  note: string | null;
}>;

/**
 * A status with what it carries (「申請の状態」): the return a resubmission
 * answers and the reply, the request, the reason, the broken premises.
 */
export type StatusData =
  | Readonly<{
      kind: "underReview";
      /** ISO; when it became under review. */
      since: string;
      answering: Readonly<{ request: string; reply: string | null }> | null;
    }>
  | Readonly<{ kind: "returned"; request: string }>
  | Readonly<{ kind: "approved"; overdueProxy: boolean }>
  | Readonly<{ kind: "rejected"; reason: string; overdueProxy: boolean }>
  | Readonly<{ kind: "withdrawn" }>
  | Readonly<{ kind: "lapsed"; premises: readonly string[] }>;

/** The other half of a registration and its companion claim (併せた申請). */
export type PairedApplication = Readonly<{
  id: string;
  kind: ApplicationKind;
  /** `null` when only the id is known (a claim's registration). */
  status: ApplicationStatusKind | null;
}>;
