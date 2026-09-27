import type { ApplicationKind } from "@repo/core/domain/application/application";
import type { ContentKind } from "@repo/core/domain/common/refs";
import type {
  ApplicationLabel,
  RefLabel,
} from "@repo/core/domain/notification/mail";
import type {
  ContentOccurrence,
  Occurrence,
  OccurrenceRef,
  ShowcaseChange,
} from "@repo/core/domain/notification/occurrence";

/*
 * The words of a notification — its headline and its references — shared
 * by the notification mail (`notificationMail.ts`) and the notification
 * list (MY-03), so both say the same thing about the same occurrence.
 */

export const CONTENT_WORD: Readonly<Record<ContentKind, string>> = {
  place: "店舗",
  listing: "掲載",
  region: "地域",
  occasion: "イベント",
  article: "読みもの",
};

const REF_WORD: Readonly<Record<OccurrenceRef["kind"], string>> = {
  ...CONTENT_WORD,
  category: "カテゴリー",
  application: "申請",
  takedownClaim: "取り下げの申立て",
  infoReport: "情報の誤り・閉店の連絡",
  account: "アカウント",
};

// Words of the spec's eight application kinds. A kind joins
// `ApplicationKind` when its stage registers it (S2B, S3B), and the
// annotation below then requires its word.
const KIND_WORDS = {
  registration: "店舗の新規登録",
  revision: "店舗の情報修正",
  stewardship: "店舗の管理権限",
  affiliation: "地域への所属",
  leave: "地域からの離脱",
  participation: "イベントへの参加",
  listing: "掲載",
  listingRevision: "掲載の修正",
} as const;

const APPLICATION_KIND_WORD: Readonly<Record<ApplicationKind, string>> =
  KIND_WORDS;

const ROLE_WORD = { editor: "編集担当者", operator: "サービス運営者" } as const;

const SHOWCASE_CHANGE_WORD: Readonly<Record<ShowcaseChange["change"], string>> =
  {
    suspended: "運営により非公開になりました",
    unpublished: "公開が取り下げられました",
    deleted: "削除されました",
    offering_ended: "提供が終了しました",
    place_suspended: "紐づく店舗が非公開になりました",
    place_closed: "紐づく店舗が閉店しました",
    closed: "閉店しました",
    ended: "終了しました",
    cancelled: "中止になりました",
  };

function applicationText(label: ApplicationLabel | null): string {
  if (label === null) return "申請";
  const subjects = label.subjects
    .map((subject) =>
      subject.name === null
        ? CONTENT_WORD[subject.kind]
        : `${CONTENT_WORD[subject.kind]}「${subject.name}」`,
    )
    .join("、");
  const kind = `${APPLICATION_KIND_WORD[label.applicationKind]}の申請`;
  return subjects.length === 0 ? kind : `${kind}（${subjects}）`;
}

type ApplicationRefLabel = Extract<RefLabel, { ref: { kind: "application" } }>;

const isApplicationLabel = (label: RefLabel): label is ApplicationRefLabel =>
  label.ref.kind === "application";

/** One reference as words: its kind, and its name when it still has one. */
export function refText(label: RefLabel): string {
  if (isApplicationLabel(label)) return applicationText(label.label);
  const other = label as Exclude<RefLabel, ApplicationRefLabel>;
  const word = REF_WORD[other.ref.kind];
  return other.label === null ? word : `${word}「${other.label}」`;
}

function contentHeadline(o: ContentOccurrence): string {
  const word = CONTENT_WORD[o.content.kind];
  switch (o.matter.kind) {
    case "suspended":
      return o.content.kind === "place"
        ? "店舗が非公開になりました"
        : `${word}が運営により非公開になりました`;
    case "unsuspended":
      return o.content.kind === "place"
        ? "店舗の非公開が解除されました"
        : `${word}の運営による非公開が解除されました`;
    case "photos_taken_down":
      return `申立てに基づいて、${word}の写真が削除されました`;
  }
}

/** What happened, as the notification's title. */
export function headline(o: Occurrence): string {
  switch (o.to) {
    case "applicant":
      return {
        returned: "申請が差し戻されました",
        approved: "申請が承認されました",
        rejected: "申請が否認されました",
        lapsed: "申請が失効しました",
      }[o.matter];
    case "approver":
      return {
        submitted: "新しい申請が届きました",
        resubmitted: "申請が再提出されました",
        withdrawn: "申請が取り下げられました",
      }[o.matter];
    case "placeStewards":
      if (o.subject.kind === "listing")
        return "掲載の情報の確認が依頼されました";
      switch (o.subject.matter.kind) {
        case "excluded_from_region":
          return "店舗が地域から除外されました";
        case "excluded_from_occasion":
          return "店舗がイベントから除外されました";
        case "occasion_cancelled":
          return "参加するイベントが中止になりました";
        case "occasion_period_changed":
          return "参加するイベントの開催期間が変わりました";
        case "confirmation_requested":
          return "店舗の情報の確認が依頼されました";
        case "categories_reassigned":
          return "カテゴリーの廃止に伴い、掲載のカテゴリーが付け替わりました";
        case "steward_added":
          return "店舗管理者が加わりました";
      }
      break;
    case "regionStewards":
      return "イベントが地域を開催地域に関連づけました";
    case "occasionStewards":
      switch (o.matter.kind) {
        case "participation_withdrawn":
          return "店舗がイベントへの参加を取りやめました";
        case "participation_changed":
          return "店舗がイベントの参加内容を変更しました";
        case "region_link_detached":
          return "地域がイベントとの関連づけを解除しました";
      }
      break;
    case "contentManagers":
      return contentHeadline(o);
    case "editors":
      return `読みものの紹介先の${CONTENT_WORD[o.matter.change.showcase.kind]}が${SHOWCASE_CHANGE_WORD[o.matter.change.change]}`;
    case "operators":
      switch (o.matter.kind) {
        case "application_review_period_elapsed":
          return "一定の期間確認されていない申請があります";
        case "takedown_claim_received":
          return "取り下げの申立てが届きました";
        case "info_report_received":
          return "情報の誤り・閉店の連絡が届きました";
      }
      break;
    case "invitee":
      return `${CONTENT_WORD[o.target.kind]}の管理メンバーに招待されました`;
    case "grantee":
      return o.granted.kind === "stewardship"
        ? `${CONTENT_WORD[o.granted.target.kind]}の管理権限が付与されました`
        : o.granted.role === "editor"
          ? "編集担当者に任命されました"
          : "サービス運営者の役割が付与されました";
    case "self":
      return o.revoked.kind === "stewardship"
        ? `${CONTENT_WORD[o.revoked.target.kind]}の管理権限が解除されました`
        : `${ROLE_WORD[o.revoked.role]}の${o.revoked.role === "editor" ? "任命" : "役割"}が解除されました`;
  }
}
