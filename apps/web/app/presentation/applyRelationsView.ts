import type { ApproverSeatKind } from "@repo/core/domain/application/approverSeat";
import type { ApplicationStatusKind } from "@repo/core/domain/application/status";
import type { ApplyMode, ApplyRefusal } from "./applyView";
import type { OfferingStatus } from "./listingView";
import type { AttachedListingItem, PeriodView } from "./occasionView";

/*
 * What RQ-05 所属・離脱の申請 and RQ-06 参加の申請 show, as plain
 * serializable data. Client-safe: types only from the core.
 */

/** A submitted application, as the completion shows it: the one MY-05 opens, and who decides it now. */
export type SubmittedApplication = Readonly<{
  applicationId: string;
  approver: string;
}>;

/**
 * Who decides a just-submitted affiliation, leave or participation, named
 * as MY-05 decides it: the region's / event's stewards (`stewards`), or the
 * service operators while it has none (不在の代行).
 */
export const submittedApprover = (
  approver: ApproverSeatKind,
  stewards: string,
): string => (approver === "operator" ? "サービス運営者" : stewards);

/** 申請者の立場: as the store's steward (the store applies), or as an individual. */
export type ActingAs = "steward" | "individual";

/** 所属 or 離脱. */
export type MembershipKind = "affiliation" | "leave";

/** `mode` of `/apply/affiliation` (P0 付録). */
export const MEMBERSHIP_MODE = {
  join: "affiliation",
  leave: "leave",
} as const satisfies Readonly<Record<string, MembershipKind>>;

export type MembershipMode = keyof typeof MEMBERSHIP_MODE;

export const MEMBERSHIP_KIND_LABEL = {
  affiliation: "所属",
  leave: "離脱",
} as const satisfies Readonly<Record<MembershipKind, string>>;

/** Where 「受け付けない事情」 sends the user from a candidate that cannot be chosen. */
export type RefusalLink =
  /** The same applicant's active application (MY-05). */
  | Readonly<{ kind: "application"; applicationId: string }>
  /** The store's 所属地域の状況 (SM-05), for its steward. */
  | Readonly<{ kind: "affiliationStatus"; placeId: string }>
  /** The store's participation (CM-04), for its steward. */
  | Readonly<{ kind: "participation"; placeId: string; occasionId: string }>;

/** Why a candidate cannot be chosen (CF-02: 選べない対象を理由とともに示す). */
export type CandidateRefusal = Readonly<{
  /** 所属中 / 申請中 / 参加中, beside the name. */
  badge: string | null;
  reason: string;
  go: RefusalLink | null;
}>;

/** A badge of a candidate's state (公開の取り下げ, 運営による非公開, 代表地域). */
export type StateBadge = Readonly<{
  label: string;
  tone: "accent" | "muted" | "alert" | "neutral";
}>;

/** A region to affiliate with or leave. */
export type RegionOption = Readonly<{
  regionId: string;
  name: string;
  meta: string;
  photoUrl: string | null;
  badges: readonly StateBadge[];
  /** Viewers can open its DT-03. */
  viewable: boolean;
  refusal: CandidateRefusal | null;
}>;

/** A store to apply for, and as whom. */
export type PlaceOption = Readonly<{
  placeId: string;
  name: string;
  /** 所属地域 · 所在地. */
  meta: string;
  /** 管理者のいない店舗 · 営業中 / 営業中 · 運営による非公開. */
  sub: string;
  /** 営業中・休業・閉店. */
  operating: string;
  /** The place's address, or `""` when it cannot be read. */
  address: string;
  photoUrl: string | null;
  actingAs: ActingAs;
  /** Viewers can open its DT-02. */
  viewable: boolean;
  /** For the region or event the entry chose (DT-03, DT-04): whether it may apply for it. */
  refusal: CandidateRefusal | null;
}>;

/**
 * An application in progress (確認中・差し戻し) the viewer made as an
 * individual about the store (`listMyActiveApplicationsAboutPlace`), to
 * check before applying again (REG-03). Opens its MY-05.
 */
export type MyActiveApplicationItem = Readonly<{
  applicationId: string;
  /** 所属の申請 · 白波横丁. */
  title: string;
  status: ApplicationStatusKind;
}>;

/** RQ-05 の入力・再提出. */
export type MembershipFormData = Readonly<{
  mode: ApplyMode;
  /** `place`: SM-05, DT-02, MY-05 name the store; `region`: DT-03 names the region, the store is chosen here. */
  opening: "place" | "region";
  kind: MembershipKind;
  /** The kind is not chosen here: DT-03 (所属) and a resubmission. */
  kindFixed: boolean;
  /** The store chosen; `null` until one is chosen (DT-03). */
  place: PlaceOption | null;
  /** DT-03: the stores the actor manages, each judged for `region`. */
  managed: readonly PlaceOption[];
  /** The region the entry chose (DT-03, SM-05's leave, a reapplication, a resubmission). */
  region: RegionOption | null;
  /** The regions `place` is affiliated with that its applicant may leave; empty when none or not read. */
  affiliated: readonly RegionOption[];
  /** The viewer's applications in progress about `place` when they apply for it as an individual; empty otherwise. */
  mine: readonly MyActiveApplicationItem[];
}>;

/** An event to take part in. */
export type OccasionOption = Readonly<{
  occasionId: string;
  name: string;
  /** `null` when it cannot be read (not viewable) or has no period. */
  period: PeriodView | null;
  periodText: string;
  venue: string;
  photoUrl: string | null;
  /** Viewers can open its DT-04. */
  viewable: boolean;
  refusal: CandidateRefusal | null;
}>;

/** A listing the store can attach (`listAttachableListings`). */
export type AttachableOption = Readonly<{
  id: string;
  name: string | null;
  /** The listing's representative photo. */
  photoUrl: string | null;
  offeringStatus: OfferingStatus;
}>;

/** The chosen event for the chosen store, and what the store can attach to it. */
/** The store's listings as RQ-06 offers them for the event. */
export type ParticipationListings = Readonly<{
  attachable: readonly AttachableOption[];
  /** The store has listings not published (下書き・一時非公開・運営による非公開): 先に SM-04 で公開する. */
  unpublished: boolean;
}>;

export type ParticipationChoice = ParticipationListings &
  Readonly<{
    occasion: OccasionOption;
    /** Empty (and `unpublished` false) when the event cannot be applied for. */
    attachable: readonly AttachableOption[];
  }>;

/** RQ-06 の入力・再提出. */
export type ParticipationFormData = Readonly<{
  mode: ApplyMode;
  /** `place`: SM-06 or MY-05 name the store; `occasion`: DT-04 names the event, the store is chosen here. */
  opening: "place" | "occasion";
  place: PlaceOption | null;
  /** DT-04: the stores the actor manages. */
  managed: readonly PlaceOption[];
  /** The event and the store's attachable listings, once both are chosen. */
  choice: ParticipationChoice | null;
  start: Readonly<{ listingIds: readonly string[]; dates: readonly string[] }>;
  /** The listings of `start` as the application holds them (a resubmission), with their states. */
  held: readonly AttachedListingItem[];
  /** A reapplication: what the ended application had that cannot be attached now. */
  removed: Readonly<{
    listings: readonly AttachedListingItem[];
    dates: readonly string[];
  }> | null;
}>;

/**
 * Why RQ-05 / RQ-06 cannot be started or submitted, beyond the reasons
 * RQ-02〜RQ-04 share (`ApplyRefusal`).
 */
export type RelationRefusal =
  | ApplyRefusal
  /** CS-05: not (or no longer) the steward of the store it applies as. */
  | Readonly<{
      kind: "notSteward";
      placeId: string;
      placeName: string;
      /** The store has no steward: an individual may apply from DT-02. */
      vacant: boolean;
      /** Found at submission (申請は提出していません). */
      atSubmit: boolean;
    }>
  /** CS-05 of RQ-06 from DT-04: the user manages no store. */
  | Readonly<{ kind: "noManagedPlace"; occasionId: string }>
  /** 所属がすでにある. */
  | Readonly<{
      kind: "affiliated";
      placeId: string;
      placeName: string;
      regionName: string;
      steward: boolean;
    }>
  /** 所属がない (離脱). */
  | Readonly<{
      kind: "notAffiliated";
      placeId: string;
      placeName: string;
      regionName: string;
      steward: boolean;
    }>
  /** The region or the event cannot be viewed: choose another. */
  | Readonly<{ kind: "targetUnavailable"; subject: "region" | "occasion" }>
  /** イベントが終了または中止している. */
  | Readonly<{ kind: "occasionClosed"; occasionName: string }>
  /** 参加がすでにある. */
  | Readonly<{
      kind: "participating";
      placeId: string;
      occasionId: string;
      occasionName: string;
    }>
  /** The same applicant's application is under review or returned (MY-05). */
  | Readonly<{
      kind: "activeRelation";
      applicationId: string;
      what: string;
    }>;

/** A screen's first load: the form, or the reason it cannot start. */
export type RelationPage<D> =
  | Readonly<{ kind: "form"; data: D }>
  | Readonly<{ kind: "refused"; refusal: RelationRefusal }>;

/** SM-05 of a store (another area). */
export const affiliationStatusPath = (placeId: string): string =>
  `/manage/places/${encodeURIComponent(placeId)}/regions`;

/** SM-06 of a store (another area). */
export const shopEventsPath = (placeId: string): string =>
  `/manage/places/${encodeURIComponent(placeId)}/events`;

/** CM-04 from the store's side (another area). */
export const shopParticipationPath = (
  placeId: string,
  occasionId: string,
): string =>
  `/manage/places/${encodeURIComponent(placeId)}/events/${encodeURIComponent(occasionId)}`;

/** Where a candidate's refusal leads, with its words. */
export function refusalLinkOf(
  go: RefusalLink,
): Readonly<{ href: string; label: string }> {
  switch (go.kind) {
    case "application":
      return {
        href: `/me/applications/${encodeURIComponent(go.applicationId)}`,
        label: "申請を見る",
      };
    case "affiliationStatus":
      return {
        href: affiliationStatusPath(go.placeId),
        label: "所属地域の状況",
      };
    case "participation":
      return {
        href: shopParticipationPath(go.placeId, go.occasionId),
        label: "参加内容を変える",
      };
  }
}

/** RQ-05 with the entry's parameters. */
export function membershipApplyHref(
  params: Readonly<{
    placeId?: string;
    regionId?: string;
    mode?: MembershipMode;
  }>,
): string {
  const search = new URLSearchParams();
  if (params.placeId !== undefined) search.set("placeId", params.placeId);
  if (params.regionId !== undefined) search.set("regionId", params.regionId);
  if (params.mode !== undefined) search.set("mode", params.mode);
  return `/apply/affiliation?${search.toString()}`;
}

/** RQ-06 with the entry's parameters. */
export function participationApplyHref(
  params: Readonly<{ placeId?: string; occasionId?: string }>,
): string {
  const search = new URLSearchParams();
  if (params.placeId !== undefined) search.set("placeId", params.placeId);
  if (params.occasionId !== undefined) {
    search.set("occasionId", params.occasionId);
  }
  return `/apply/participation?${search.toString()}`;
}

/** How RQ-05 was opened (`/apply/affiliation`'s parameters). */
export type MembershipEntry = Readonly<{
  placeId: string | null;
  regionId: string | null;
  mode: MembershipMode | null;
  resubmit: string | null;
  reapply: string | null;
}>;

/** How RQ-06 was opened (`/apply/participation`'s parameters). */
export type ParticipationEntry = Readonly<{
  placeId: string | null;
  occasionId: string | null;
  resubmit: string | null;
  reapply: string | null;
}>;

/** RQ-05's heading before its form decides it (loading, a problem, a refusal). */
export function membershipHeading(entry: MembershipEntry): string {
  if (entry.resubmit !== null) return "所属・離脱の申請を再提出";
  if (entry.placeId === null && entry.regionId !== null) return "所属を申請";
  return "所属・離脱を申請";
}

/** RQ-06's heading before its form decides it. */
export const participationHeading = (entry: ParticipationEntry): string =>
  entry.resubmit !== null ? "参加の申請を再提出" : "イベントに参加";
