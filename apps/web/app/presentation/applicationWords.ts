import type { ApplicationKind } from "@repo/core/domain/application/application";
import type { PremiseKey } from "@repo/core/domain/application/premise";
import type { ApplicationStatusKind } from "@repo/core/domain/application/status";

/*
 * The words of an application (`spec/pages/index.md` 「申請の状態」) shared
 * by MY-04, MY-05 and CM-01. Client-safe: types only from the core.
 */

const KIND_TITLES = {
  registration: "店舗の登録申請",
  revision: "情報修正の申請",
  stewardship: "管理権限の申請",
  listing: "掲載の申請",
  listingRevision: "掲載の修正の申請",
  affiliation: "所属の申請",
  leave: "離脱の申請",
  participation: "参加の申請",
} as const;

/** The applicant's name of a kind (MY-04, MY-05): 店舗の登録申請, 管理権限の申請… */
export const APPLICATION_KIND_TITLE: Readonly<Record<ApplicationKind, string>> =
  KIND_TITLES;

const REVIEW_KIND_TITLES = {
  registration: "店舗の新規登録",
  revision: "情報修正と営業状況の変更",
  stewardship: "店舗の管理権限取得",
  listing: "管理者のいない店舗の掲載",
  listingRevision: "掲載の修正",
  affiliation: "地域への所属",
  leave: "地域からの離脱",
  participation: "イベントへの参加",
} as const;

/** The approver's name of a kind (CM-01's 種類, after the design). */
export const REVIEW_KIND_TITLE: Readonly<Record<ApplicationKind, string>> =
  REVIEW_KIND_TITLES;

export const STATUS_LABEL: Readonly<Record<ApplicationStatusKind, string>> = {
  underReview: "確認中",
  returned: "差し戻し",
  approved: "承認",
  rejected: "否認",
  withdrawn: "取り下げ",
  lapsed: "失効",
};

/** The badge tone of a status: returned asks for action, an approval is good news, the ends are quiet. */
export type StatusTone = "neutral" | "accent" | "muted" | "alert";

export const STATUS_TONE: Readonly<Record<ApplicationStatusKind, StatusTone>> =
  {
    underReview: "neutral",
    returned: "alert",
    approved: "accent",
    rejected: "muted",
    withdrawn: "muted",
    lapsed: "muted",
  };

/**
 * Why a lapsed application lapsed, as the applicant reads it (APP-05's
 * table): one sentence per premise that no longer holds.
 */
export const BROKEN_PREMISE_TEXT: Readonly<Record<PremiseKey, string>> = {
  placeHasNoSteward:
    "店舗に店舗管理者が就いたため、管理者のいない店舗への申請は成り立たなくなりました。",
  placeHasSteward:
    "店舗に店舗管理者がいなくなったため、店舗管理者として行った申請は成り立たなくなりました。",
  listingExists: "対象の掲載が削除されたため、修正する対象がなくなりました。",
  notAffiliated: "別の申請の承認で、所属がすでに成立しています。",
  affiliated: "所属がすでに解除されています。",
  occasionOpen: "イベントが終了したか、中止になりました。",
  notParticipating: "別の経路で、この店舗の参加がすでに成立しています。",
  applicantNotSteward:
    "招待を承諾するなどして、すでにこの店舗の店舗管理者になっています。",
  registrationStanding:
    "併せて出した店舗の登録申請が、否認されたか取り下げになりました。",
};

/** The same premises as the approver reads them (CM-01's CS-08 on approval). */
export const REVIEW_BROKEN_PREMISE_TEXT: Readonly<Record<PremiseKey, string>> =
  {
    placeHasNoSteward: "店舗に店舗管理者が就いています。",
    placeHasSteward: "店舗に店舗管理者がいなくなっています。",
    listingExists: "対象の掲載が削除されています。",
    notAffiliated: "所属がすでに成立しています。",
    affiliated: "所属がすでに解除されています。",
    occasionOpen: "イベントが終了したか、中止になっています。",
    notParticipating: "参加がすでに成立しています。",
    applicantNotSteward: "申請者が、すでにこの店舗の店舗管理者です。",
    registrationStanding:
      "併せた店舗の登録申請が、否認されたか取り下げになっています。",
  };

/** Why an application lapsed, in a list row's meta (RM-01, EM-01): 店舗管理者がいなくなったため… */
export const LAPSE_REASON_SHORT: Readonly<Record<PremiseKey, string>> = {
  placeHasNoSteward: "店舗管理者が就いたため",
  placeHasSteward: "店舗管理者がいなくなったため",
  listingExists: "掲載が削除されたため",
  notAffiliated: "所属がすでに成立したため",
  affiliated: "所属がすでに解除されたため",
  occasionOpen: "イベントが終了または中止したため",
  notParticipating: "参加がすでに成立したため",
  applicantNotSteward: "申請者が店舗管理者になったため",
  registrationStanding: "併せた登録申請が認められなかったため",
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** `9月20日`, on the Japan-time calendar day of `iso`. */
export function monthDayText(iso: string): string {
  const day = new Date(new Date(iso).getTime() + JST_OFFSET_MS);
  return `${day.getUTCMonth() + 1}月${day.getUTCDate()}日`;
}
