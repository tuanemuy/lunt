import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";

export type { OperatingStatus };

/** 営業状況 as the management screens name it (a choice, a state line). */
export const OPERATING_STATUS_LABEL = {
  open: "営業中",
  temporarilyClosed: "休業",
  permanentlyClosed: "閉店",
} as const satisfies Readonly<Record<OperatingStatus, string>>;

/** 営業状況 as the viewer screens and RQ-01 state it (DT-02 お店のこと). */
export const OPERATING_STATUS_TEXT = {
  open: "営業中",
  temporarilyClosed: "休業中",
  permanentlyClosed: "閉店",
} as const satisfies Readonly<Record<OperatingStatus, string>>;

/**
 * The SM area's refusal of an operator whose store has a steward: the
 * absence proxy is not open to them (CS-15), unlike a stranger (CS-05).
 */
export const PLACE_PROXY_UNAVAILABLE = "PLACE_PROXY_UNAVAILABLE";

export const OPERATING_STATUSES = [
  "open",
  "temporarilyClosed",
  "permanentlyClosed",
] as const satisfies readonly OperatingStatus[];

/** A photo as the management screens show it. */
export type PhotoItem = Readonly<{ photoId: string; url: string }>;

/** A place in the store switcher and in lists. */
export type ShopSummary = Readonly<{
  placeId: string;
  name: string;
  operatingStatus: OperatingStatus;
  suspended: boolean;
}>;

/**
 * The managed store every SM screen names in its title band and nav
 * (`spec/pages/index.md` 「店舗側の管理ナビゲーション」): who manages it as
 * what, and the other stores a steward can switch to.
 */
export type PlaceFrame = ShopSummary &
  Readonly<{
    /** `proxy`: a service operator acting for an absent steward (CS-14). */
    basis: "steward" | "proxy";
    hasSteward: boolean;
    /** The stores the viewer stewards, this one included; empty while proxying. */
    stewarded: readonly ShopSummary[];
  }>;

/** 営業中 · 公開中 / 休業 · 店舗は非公開 (the management state of a store). */
export function placeStateText(
  place: Pick<ShopSummary, "operatingStatus" | "suspended">,
): string {
  return `${OPERATING_STATUS_LABEL[place.operatingStatus]} · ${
    place.suspended ? "店舗は非公開" : "公開中"
  }`;
}

/** The frame's state line; a proxied store says it has no steward. */
export function frameStateText(frame: PlaceFrame): string {
  const base = placeStateText(frame);
  return frame.basis === "proxy" ? `${base} · 管理者のいない店舗` : base;
}

/** A picked town (the `TownRef` plus what the screens show of it). */
export type TownOption = Readonly<{
  areaCode: string;
  prefectureCode: string;
  prefectureName: string;
  municipalityCode: string;
  municipalityName: string;
  /** Empty for the town standing for the whole municipality. */
  name: string;
  /** Postal code and place name, e.g. `100-0005 東京都千代田区丸の内`. */
  label: string;
}>;

/** A prefecture or a municipality in the address selects. */
export type AreaOption = Readonly<{ code: string; name: string }>;

/** A town's key within its municipality's list. */
export const townKey = (town: Pick<TownOption, "areaCode" | "name">): string =>
  `${town.areaCode}|${town.name}`;

/** How a town reads in a select: its name, or the municipality as a whole. */
export const townOptionText = (town: TownOption): string =>
  `${town.name === "" ? "（町域の指定なし）" : town.name}（${town.areaCode.slice(0, 3)}-${town.areaCode.slice(3)}）`;

/** The address lists the form starts from. */
export type AreaLists = Readonly<{
  prefectures: readonly AreaOption[];
  municipalities: readonly AreaOption[];
  towns: readonly TownOption[];
}>;

/** SM-01: the store's state, listing counts per 区分 and its stewards. */
export type ShopHomeData = Readonly<{
  cover: PhotoItem | null;
  name: string;
  operatingStatus: OperatingStatus;
  suspended: boolean;
  photosTakenDown: boolean;
  listingCounts: Readonly<{
    all: number;
    published: number;
    draft: number;
    hidden: number;
    ended: number;
  }>;
  stewardCount: number;
}>;

/** What SM-02 edits: the whole profile, the status and the lists the address starts from. */
export type PlaceEditorData = Readonly<{
  placeId: string;
  version: number;
  name: string;
  photos: readonly PhotoItem[];
  photosTakenDown: boolean;
  description: string;
  town: TownOption | null;
  addressRest: string;
  /** Prefecture, municipality, town and rest joined. */
  addressText: string;
  location: Readonly<{ latitude: number; longitude: number }>;
  businessHours: string;
  contact: string;
  operatingStatus: OperatingStatus;
  suspended: boolean;
  areaLists: AreaLists;
}>;
