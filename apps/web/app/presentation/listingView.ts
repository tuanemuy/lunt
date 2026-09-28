import type {
  Offering,
  OfferingStatus,
} from "@repo/core/domain/listing/offering";
import type { Framing } from "@repo/core/domain/listing/values";
import type { ListingCardItem, ListingHeroData } from "./detailView";

export type { Framing, Offering, OfferingStatus };

/** An active category as a select option. */
export type CategoryOption = Readonly<{ id: string; name: string }>;

/** A listing photo: its content URL and the part viewers see (`null` = all). */
export type ListingPhotoItem = Readonly<{
  photoId: string;
  /** `null` when the content is not (or no longer) stored. */
  url: string | null;
  framing: Framing | null;
}>;

export type PublicationView = Readonly<{
  status: "draft" | "published" | "unpublished";
  /** Why an unpublished listing is unpublished. */
  reason: "byManager" | "photoTakedown" | null;
}>;

/** The SM-03 区分 (`status` search parameter); none = すべて. */
export const LISTING_SHELVES = [
  "published",
  "draft",
  "hidden",
  "ended",
] as const;
export type ListingShelfKey = (typeof LISTING_SHELVES)[number];

export const LISTING_SHELF_LABEL = {
  published: "公開中",
  draft: "下書き",
  hidden: "非公開",
  ended: "提供終了",
} as const satisfies Readonly<Record<ListingShelfKey, string>>;

export type ListingShelfCountsView = Readonly<
  Record<ListingShelfKey | "all", number>
>;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** `2026-10-31` → `10月31日`. */
export function jpDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}月${day}日`;
}

/** `2026-10-17` → `10月17日（土）`. */
export function jpDateWithWeekday(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const weekday =
    WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${jpDate(date)}（${weekday}）`;
}

/** The offering as a short phrase for rows and previews. */
export function offeringSummary(offering: Offering): string {
  switch (offering.kind) {
    case "none":
      return "提供の設定なし";
    case "period": {
      const { start, end } = offering.period;
      if (start !== null && end !== null) {
        return `${jpDate(start)}〜${jpDate(end)}`;
      }
      if (start !== null) return `${jpDate(start)}から`;
      return end === null ? "提供の設定なし" : `${jpDate(end)}まで`;
    }
    case "dates": {
      const [first, ...rest] = offering.dates;
      return rest.length === 0
        ? `開催日 ${jpDate(first)}`
        : `開催日 ${jpDate(first)}ほか${rest.length}日`;
    }
  }
}

/** The badge word of an offering status; manual and schedule ends are told apart. */
export function offeringPhaseLabel(status: OfferingStatus): string {
  switch (status.phase) {
    case "upcoming":
      return "提供開始前";
    case "available":
      return "提供中";
    case "ended":
      return status.cause === "manual"
        ? "提供終了（店舗管理者による）"
        : "提供終了（自動）";
  }
}

/** The sentence beside the offering badge on SM-04. */
export function offeringStatusText(
  offering: Offering,
  status: OfferingStatus,
): string {
  const last =
    offering.kind === "period"
      ? offering.period.end
      : offering.kind === "dates"
        ? (offering.dates[offering.dates.length - 1] ?? null)
        : null;
  switch (status.phase) {
    case "upcoming":
      return `${jpDate(status.startsOn)}から提供します。`;
    case "available":
      if (offering.kind === "dates") {
        return `開催日は${offering.dates.map(jpDate).join("、")}です。`;
      }
      return last === null
        ? "提供の設定はありません。いつでも提供中として表示されます。"
        : `${jpDate(last)}まで提供します。`;
    case "ended":
      if (status.cause === "schedule") {
        return last === null
          ? "提供終了になりました。"
          : `${offering.kind === "dates" ? "最後の開催日" : "終了日"}（${jpDate(last)}）を過ぎたため、提供終了になりました。`;
      }
      return status.scheduleElapsed && last !== null
        ? `店舗管理者が提供を終了しました。${offering.kind === "dates" ? "最後の開催日" : "終了日"}（${jpDate(last)}）を過ぎています。`
        : "店舗管理者が提供を終了しました。";
  }
}

/** The publication badge word; suspension is a separate badge. */
export function publicationLabel(publication: PublicationView): string {
  switch (publication.status) {
    case "draft":
      return "下書き";
    case "published":
      return "公開中";
    case "unpublished":
      return "一時非公開";
  }
}

/** 公開中 · 提供中 / 運営による非公開 · 下書き · 提供開始前 … */
export function listingStateText(
  publication: PublicationView,
  suspended: boolean,
  status: OfferingStatus,
): string {
  return [
    ...(suspended ? ["運営による非公開"] : []),
    publicationLabel(publication),
    offeringPhaseLabel(status),
  ].join(" · ");
}

/** One row of SM-03. */
export type ListingRowItem = Readonly<{
  id: string;
  name: string | null;
  cover: ListingPhotoItem | null;
  category: string | null;
  publication: PublicationView;
  suspended: boolean;
  offeringStatus: OfferingStatus;
}>;

/** A page of SM-03. */
export type ListingRowsPage = Readonly<{
  items: readonly ListingRowItem[];
  count: number;
}>;

/** What SM-04 edits and shows. */
export type ListingEditorData = Readonly<{
  id: string;
  version: number;
  name: string;
  description: string;
  categoryId: string | null;
  photos: readonly ListingPhotoItem[];
  photosTakenDown: boolean;
  offering: Offering;
  publication: PublicationView;
  suspended: boolean;
  offeringStatus: OfferingStatus;
  place: Readonly<{
    id: string;
    name: string;
    address: string;
    suspended: boolean;
  }>;
}>;

/**
 * What CM-03 shows: the listing as viewers would see it, built by the same
 * mapping as DT-01 and its cards (`toListingPreviewViews`).
 */
export type ListingPreviewData = Readonly<{
  id: string;
  name: string | null;
  hero: ListingHeroData;
  card: ListingCardItem;
  placeName: string;
  publication: PublicationView;
  suspended: boolean;
  placeSuspended: boolean;
}>;
