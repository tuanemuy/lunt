import type { ApplicationStatusKind } from "@repo/core/domain/application/status";
import type { HoldingStatus } from "@repo/core/domain/occasion/holdingStatus";
import type { RegionRequirement } from "@repo/core/domain/region/content";
import type { StatusTone } from "./applicationWords";
import { jpDateWithWeekday, type PublicationView } from "./listingView";
import type {
  AreaLists,
  OperatingStatus,
  PhotoItem,
  TownOption,
} from "./placeView";

export type { HoldingStatus, RegionRequirement };

/**
 * The RM area's refusal of an operator whose region has a steward: the
 * absence proxy is not open to them (CS-15), unlike a stranger (CS-05).
 */
export const REGION_PROXY_UNAVAILABLE = "REGION_PROXY_UNAVAILABLE";

/** `registerRegion`'s answer when the id already holds another region. */
export const REGION_ID_CONFLICT = "REGION_ID_CONFLICT";

/** 公開状態 of a region (CF-08): 公開をやめる is 公開の取り下げ. */
export function regionPublicationLabel(publication: PublicationView): string {
  switch (publication.status) {
    case "draft":
      return "下書き";
    case "published":
      return "公開中";
    case "unpublished":
      return "公開の取り下げ";
  }
}

/** 公開中 / 下書き / 公開の取り下げ, or 公開 · 運営による非公開 while suspended. */
export function regionStateText(
  region: Readonly<{ publication: PublicationView; suspended: boolean }>,
): string {
  if (!region.suspended) return regionPublicationLabel(region.publication);
  const label =
    region.publication.status === "published"
      ? "公開"
      : regionPublicationLabel(region.publication);
  return `${label} · 運営による非公開`;
}

/**
 * The managed region every RM screen names in its title band and nav
 * (`spec/pages/index.md` 「地域運営・イベント運営の管理ナビゲーション」).
 */
export type RegionFrame = Readonly<{
  regionId: string;
  /** `null` for an unnamed draft. */
  name: string | null;
  publication: PublicationView;
  suspended: boolean;
  /** `proxy`: a service operator acting for an absent region steward (CS-14). */
  basis: "steward" | "proxy";
  hasSteward: boolean;
}>;

export const regionNameText = (name: string | null): string =>
  name ?? "名称未設定の地域";

/** The frame's state line; a proxied region says it has no steward. */
export function regionFrameStateText(frame: RegionFrame): string {
  const base = regionStateText(frame);
  return frame.basis === "proxy" ? `${base} · 運営者が不在の地域` : base;
}

/** DT-03, the region's page as viewers see it (a plain path, the viewer area's). */
export const regionPagePath = (regionId: string): string =>
  `/regions/${encodeURIComponent(regionId)}`;

/** DT-02 (see `regionPagePath`). */
export const placeDetailPath = (placeId: string): string =>
  `/places/${encodeURIComponent(placeId)}`;

/** DT-04 (see `regionPagePath`). */
export const occasionPagePath = (occasionId: string): string =>
  `/events/${encodeURIComponent(occasionId)}`;

/** CM-02 of a region. */
export const regionMembersPath = (regionId: string): string =>
  `/manage/regions/${encodeURIComponent(regionId)}/members`;

/** Rows per page of the RM lists (CF-05). */
export const REGION_LIST_PAGE_SIZE = 20;

/** One affiliated place of RM-01. */
export type AffiliatedPlaceItem = Readonly<{
  placeId: string;
  name: string;
  operatingStatus: OperatingStatus;
  suspended: boolean;
}>;

/** One affiliation / leave application of RM-01 (「申請の状態」). */
export type RegionApplicationItem = Readonly<{
  applicationId: string;
  /** 所属 · ベーカリー 灯 */
  title: string;
  /** 申請者 … · 9月23日 (· サービス運営者が期間超過の代行で判断) */
  meta: string;
  status: ApplicationStatusKind;
  statusLabel: string;
  tone: StatusTone;
}>;

export type ListPage<T> = Readonly<{ items: readonly T[]; count: number }>;

/** RM-01: the affiliated places and the applications, each a first page. */
export type AffiliationsData = Readonly<{
  regionId: string;
  places: ListPage<AffiliatedPlaceItem>;
  applications: ListPage<RegionApplicationItem> &
    Readonly<{ underReview: number }>;
}>;

/** What RM-02 edits and shows. */
export type RegionEditorData = Readonly<{
  regionId: string;
  version: number;
  name: string;
  tagline: string;
  description: string;
  photos: readonly PhotoItem[];
  photosTakenDown: boolean;
  town: TownOption | null;
  addressRest: string;
  location: Readonly<{ latitude: number; longitude: number }> | null;
  publication: PublicationView;
  suspended: boolean;
  viewable: boolean;
  /** In `name`, `address`, `location`, `photos` order; empty when publishable. */
  missing: readonly RegionRequirement[];
  stewardCount: number;
  areaLists: AreaLists;
}>;

/** 開催前 / 開催中 / 終了 / 中止. */
export const HOLDING_STATUS_LABEL = {
  upcoming: "開催前",
  ongoing: "開催中",
  ended: "終了",
  cancelled: "中止",
} as const satisfies Readonly<Record<HoldingStatus, string>>;

/** One occasion linked to the region (RM-03). */
export type RegionLinkItem = Readonly<{
  occasionId: string;
  name: string | null;
  status: "linked" | "detached";
  /** ISO 8601. */
  linkedAt: string;
  /** Days as `YYYY-MM-DD`; `null` while the occasion has none. */
  period: Readonly<{ start: string; end: string }> | null;
  publication: PublicationView;
  suspended: boolean;
  holdingStatus: HoldingStatus | null;
  /** Viewers can open its DT-04. */
  viewable: boolean;
}>;

/** `10月10日（土）〜10月12日（月）`, one day alone when the period is one day. */
export function periodText(
  period: Readonly<{ start: string; end: string }>,
): string {
  return period.start === period.end
    ? jpDateWithWeekday(period.start)
    : `${jpDateWithWeekday(period.start)}〜${jpDateWithWeekday(period.end)}`;
}
