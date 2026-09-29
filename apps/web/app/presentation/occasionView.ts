import type { HoldingStatus } from "@repo/core/domain/occasion/holdingStatus";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import {
  jpDateWithWeekday,
  type OfferingStatus,
  type PublicationView,
} from "./listingView";
import type { AreaLists, PhotoItem, TownOption } from "./placeView";

export type { HoldingStatus };

/**
 * The event management area (EM-01〜03, CM-04 of an event, EM-02 新規):
 * the view types and wording shared by its screens. Server-only reads live
 * in `occasionData.ts`, the server functions in `occasion.ts`.
 */

/** The EM area's refusal of an operator whose event has an event operator (CS-15). */
export const OCCASION_PROXY_UNAVAILABLE = "OCCASION_PROXY_UNAVAILABLE";

/** 開催前・開催中・終了・中止 (`spec/pages/index.md` 「管理する対象の状態」). */
export const HOLDING_LABEL = {
  upcoming: "開催前",
  ongoing: "開催中",
  ended: "終了",
  cancelled: "中止",
} as const satisfies Readonly<Record<HoldingStatus, string>>;

/** A region's or event's publication word (公開の取り下げ, not 一時非公開). */
export function occasionPublicationLabel(publication: PublicationView): string {
  switch (publication.status) {
    case "draft":
      return "下書き";
    case "published":
      return "公開中";
    case "unpublished":
      return "公開の取り下げ";
  }
}

export type PeriodView = Readonly<{ start: string; end: string }>;

/**
 * The managed event every EM screen names in its title band and nav
 * (`spec/pages/index.md` 「地域運営・イベント運営の管理ナビゲーション」): its
 * states, and whether the viewer manages it as its event operator or as
 * the service operator standing in for an absent one (CS-14).
 */
export type OccasionFrame = Readonly<{
  occasionId: string;
  /** `null` while a draft has none. */
  name: string | null;
  period: PeriodView | null;
  publication: PublicationView;
  suspended: boolean;
  /** `null` while no period is set. */
  holding: HoldingStatus | null;
  viewable: boolean;
  basis: "steward" | "proxy";
  hasSteward: boolean;
}>;

export const occasionName = (name: string | null): string =>
  name ?? "名称未設定のイベント";

/** 公開中 · 開催前 / 公開 · 運営による非公開 · 開催前 (the event's state line). */
export function occasionStateText(
  state: Pick<OccasionFrame, "publication" | "suspended" | "holding">,
): string {
  return [
    ...(state.suspended
      ? [
          state.publication.status === "published"
            ? "公開"
            : occasionPublicationLabel(state.publication),
          "運営による非公開",
        ]
      : [occasionPublicationLabel(state.publication)]),
    ...(state.holding === null ? [] : [HOLDING_LABEL[state.holding]]),
  ].join(" · ");
}

/** The frame's state line; an event opened by proxy says it has no event operator. */
export function occasionFrameStateText(frame: OccasionFrame): string {
  const base = occasionStateText(frame);
  return frame.basis === "proxy" ? `${base} · 運営者が不在のイベント` : base;
}

/** `10月10日（土）〜10月12日（月）`, or one day. */
export function periodText(period: PeriodView): string {
  return period.start === period.end
    ? jpDateWithWeekday(period.start)
    : `${jpDateWithWeekday(period.start)}〜${jpDateWithWeekday(period.end)}`;
}

/** A listing attached to a participation, as EM-01 and CM-04 show it. */
export type AttachedListingItem =
  | Readonly<{ id: string; deleted: true }>
  | Readonly<{
      id: string;
      deleted: false;
      name: string | null;
      publication: PublicationView;
      suspended: boolean;
      offeringStatus: OfferingStatus;
      viewable: boolean;
    }>;

/** A participation's details as the management screens show them. */
export type ParticipationItem = Readonly<{
  version: number;
  listings: readonly AttachedListingItem[];
  /** Ascending `YYYY-MM-DD`. */
  dates: readonly string[];
  outOfPeriodDates: readonly string[];
}>;

/** One place of EM-01's 参加店舗. */
export type ParticipantItem = Readonly<{
  placeId: string;
  name: string;
  operatingStatus: OperatingStatus;
  suspended: boolean;
  hasSteward: boolean;
  participation: ParticipationItem;
}>;

/** One application of EM-01's 参加の申請. */
export type SubjectApplicationItem = Readonly<{
  applicationId: string;
  title: string;
  meta: string;
  /** A participation's attached listings and days, in one line. */
  detail: string | null;
  status: string;
  tone: "accent" | "alert" | "muted" | "neutral";
  underReview: boolean;
}>;

/** EM-01: the participants (first page) and the participation applications. */
export type ParticipantBoardData = Readonly<{
  participants: readonly ParticipantItem[];
  count: number;
  applications: readonly SubjectApplicationItem[];
  underReviewCount: number;
  /** The place a notification opened this with (`?participant=`), when it names one. */
  focus: Readonly<{
    placeId: string;
    /** `null` when viewers cannot see the place. */
    name: string | null;
    participating: boolean;
  }> | null;
}>;

export const PARTICIPANT_PAGE_SIZE = 50;

/** What EM-02 edits: the content, the states and the address lists. */
export type OccasionEditorData = Readonly<{
  occasionId: string;
  version: number;
  name: string;
  period: PeriodView | null;
  town: TownOption | null;
  addressRest: string;
  /** Prefecture, municipality, town and rest joined. */
  addressText: string | null;
  location: Readonly<{ latitude: number; longitude: number }> | null;
  photos: readonly PhotoItem[];
  photosTakenDown: boolean;
  description: string;
  tagline: string;
  publication: PublicationView;
  suspended: boolean;
  cancelled: boolean;
  holding: HoldingStatus | null;
  viewable: boolean;
  missing: readonly string[];
  /** EM-02 「イベントの運営」: the linked regions' names and the event operators. */
  linkedRegions: Readonly<{ count: number; first: string | null }>;
  stewardCount: number;
  areaLists: AreaLists;
}>;

/** One region of EM-03. */
export type RegionLinkItem = Readonly<{
  regionId: string;
  name: string | null;
  status: "linked" | "detached";
  publication: PublicationView;
  suspended: boolean;
  /** ISO 8601. */
  linkedAt: string;
}>;

export type RegionLinksData = Readonly<{
  items: readonly RegionLinkItem[];
}>;

/** A candidate of CF-02 (EM-03's regions, CM-04's places). */
export type CandidateItem = Readonly<{
  id: string;
  name: string;
  meta: string;
  photoUrl: string | null;
  /** Why it cannot be chosen, when it cannot. */
  refusal: string | null;
  /** CM-04: a participating place leads to its participation instead. */
  participating?: boolean;
}>;

export type CandidatePage = Readonly<{
  items: readonly CandidateItem[];
  count: number;
}>;

/** A candidate listing of CM-04 (`listAttachableListings`). */
export type AttachableItem = Readonly<{
  id: string;
  name: string | null;
  offeringStatus: OfferingStatus;
}>;

/** Which side opened CM-04, and what it may do there. */
export type ParticipationSide = "place" | "occasion";

/** CM-04's content: the event, the place, the participation and the candidates. */
export type ParticipationEditorData = Readonly<{
  side: ParticipationSide;
  occasion: Readonly<{
    id: string;
    name: string | null;
    period: PeriodView | null;
    publication: PublicationView;
    suspended: boolean;
    holding: HoldingStatus | null;
  }>;
  place: Readonly<{
    id: string;
    name: string | null;
    operatingStatus: OperatingStatus | null;
    hasSteward: boolean;
  }>;
  /** `null` while the place does not take part (the add, or after it was dissolved). */
  participation: ParticipationItem | null;
  attachable: readonly AttachableItem[];
}>;

/** The 公開中・提供状態 words of an attached listing (CM-04, EM-01). */
export function attachedListingState(listing: AttachedListingItem): Readonly<{
  label: string;
  hidden: boolean;
}> {
  if (listing.deleted) return { label: "削除された掲載", hidden: true };
  if (listing.suspended) return { label: "運営による非公開", hidden: true };
  if (listing.publication.status === "unpublished") {
    return { label: "一時非公開", hidden: true };
  }
  if (listing.publication.status === "draft") {
    return { label: "下書き", hidden: true };
  }
  if (!listing.viewable) return { label: "店舗が非公開", hidden: true };
  switch (listing.offeringStatus.phase) {
    case "upcoming":
      return { label: "提供開始前", hidden: false };
    case "available":
      return { label: "提供中", hidden: false };
    case "ended":
      return { label: "提供終了", hidden: false };
  }
}
