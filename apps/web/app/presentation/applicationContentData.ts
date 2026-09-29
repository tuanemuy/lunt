// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import type {
  ApplicationContentView,
  ListingChangeView,
  ListingContentView,
  ListingPhotoView,
  ListingProposalView,
  PhotoView,
  PlaceChangeView,
  PlaceProfileView,
  PlaceStateView,
} from "@repo/core/application/application/detail";
import type {
  ApplicationStatusView,
  SubjectView,
} from "@repo/core/application/application/views";
import { NotFoundError } from "@repo/core/application/errors";
import type { AttachedListingView } from "@repo/core/application/occasion/attachedListings";
import { Address } from "@repo/core/domain/common/address";
import type { GeoPoint } from "@repo/core/domain/common/geo";
import { ApplicationId } from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import type {
  AttachedLine,
  ComparedRow,
  ContentData,
  ContentPhoto,
  ContentRow,
  ContentValue,
  StatusData,
  SubjectItem,
} from "./applicationContent";
import { subjectName } from "./applicationSubjects";
import { BROKEN_PREMISE_TEXT } from "./applicationWords";
import { jpDateWithWeekday, offeringSummary } from "./listingView";
import { OPERATING_STATUS_LABEL } from "./placeView";

const NONE = "（なし）";

const text = (value: string | null): ContentValue => ({
  kind: "text",
  text: value ?? NONE,
});

const quote = (value: string): ContentValue => ({ kind: "quote", text: value });

const photo = (
  view: PhotoView & Partial<Pick<ListingPhotoView, "framing">>,
  note: string | null = null,
): ContentPhoto => ({
  photoId: view.photoId,
  url: view.display?.url ?? null,
  framing: view.framing ?? null,
  note,
});

const photos = (
  views: readonly (PhotoView & Partial<Pick<ListingPhotoView, "framing">>)[],
  dropped: ReadonlySet<string> = new Set(),
): ContentValue => ({
  kind: "photos",
  photos: views.map((view) =>
    photo(view, dropped.has(view.photoId) ? "外された" : null),
  ),
});

const locationText = (location: GeoPoint): string =>
  `緯度 ${location.latitude} / 経度 ${location.longitude}`;

const addressValue = (address: Address): ContentValue => ({
  kind: "text",
  text: Address.text(address),
});

// --- Places -----------------------------------------------------------------

function profileRows(profile: PlaceProfileView): readonly ContentRow[] {
  return [
    { label: "写真", value: photos(profile.photos) },
    { label: "名称", value: text(profile.name) },
    { label: "所在地", value: addressValue(profile.address) },
    { label: "位置", value: text(locationText(profile.location)) },
    { label: "営業時間", value: text(profile.businessHours) },
    { label: "紹介", value: text(profile.description) },
    { label: "連絡先", value: text(profile.contact) },
  ];
}

function stateRows(state: PlaceStateView): readonly ContentRow[] {
  return [
    ...profileRows(state.profile),
    {
      label: "営業状況",
      value: text(OPERATING_STATUS_LABEL[state.operatingStatus]),
    },
  ];
}

const PLACE_FIELD_LABEL: Readonly<Record<PlaceChangeView["field"], string>> = {
  name: "名称",
  photos: "写真",
  description: "紹介",
  address: "所在地",
  location: "位置",
  businessHours: "営業時間",
  contact: "連絡先",
  operatingStatus: "営業状況",
};

function placeCompared(change: PlaceChangeView): ComparedRow {
  const label = PLACE_FIELD_LABEL[change.field];
  switch (change.field) {
    case "photos":
      return {
        label,
        current: photos(change.current),
        proposed: photos(change.proposed),
      };
    case "address":
      return {
        label,
        current: addressValue(change.current),
        proposed: addressValue(change.proposed),
      };
    case "location":
      return {
        label,
        current: text(locationText(change.current)),
        proposed: text(locationText(change.proposed)),
      };
    case "operatingStatus":
      return {
        label,
        current: text(OPERATING_STATUS_LABEL[change.current]),
        proposed: text(OPERATING_STATUS_LABEL[change.proposed]),
      };
    default:
      return {
        label,
        current: text(change.current),
        proposed: text(change.proposed),
      };
  }
}

// --- Listings ---------------------------------------------------------------

function listingRows(content: ListingContentView): readonly ContentRow[] {
  return [
    { label: "写真と見せる範囲", value: photos(content.photos) },
    { label: "名称", value: text(content.name) },
    { label: "カテゴリー", value: text(content.category?.name ?? null) },
    { label: "説明", value: text(content.description) },
    { label: "提供の設定", value: text(offeringSummary(content.offering)) },
  ];
}

const LISTING_FIELD_LABEL: Readonly<
  Record<ListingChangeView["field"], string>
> = {
  name: "名称",
  description: "説明",
  category: "カテゴリー",
  photos: "写真",
  offering: "提供の設定",
};

function proposedValue(
  change: ListingProposalView,
  dropped: ReadonlySet<string>,
): ContentValue {
  switch (change.field) {
    case "photos":
      return photos(change.proposed, dropped);
    case "category":
      return text(change.proposed?.name ?? null);
    case "offering":
      return text(offeringSummary(change.proposed));
    case "name":
    case "description":
      return text(change.proposed);
  }
}

function currentValue(change: ListingChangeView): ContentValue {
  switch (change.field) {
    case "photos":
      return photos(change.current);
    case "category":
      return text(change.current?.name ?? null);
    case "offering":
      return text(offeringSummary(change.current));
    case "name":
    case "description":
      return text(change.current);
  }
}

// --- Participations -----------------------------------------------------------

const OFFERING_PHASE_LABEL = {
  upcoming: "提供開始前",
  available: "提供中",
  ended: "提供終了",
} as const;

/**
 * An attached listing as the application screens show it
 * (「管理する対象の状態」): one viewers cannot see names why and opens
 * nowhere but keeps its photo; a deleted one is shown as deleted, without
 * a photo.
 */
export function attachedLine(listing: AttachedListingView): AttachedLine {
  if (listing.deleted) {
    return {
      id: listing.id,
      name: "削除された掲載",
      state: "削除された掲載",
      hidden: true,
      href: null,
      photoUrl: null,
    };
  }
  const name = listing.name ?? "名称未設定の掲載";
  const hidden = (state: string): AttachedLine => ({
    id: listing.id,
    name,
    state,
    hidden: true,
    href: null,
    // Only a deleted listing has no photo; a hidden one keeps its cover.
    photoUrl: listing.cover?.display?.url ?? null,
  });
  if (listing.suspended) return hidden("運営による非公開");
  if (listing.publication.status === "unpublished") return hidden("一時非公開");
  if (listing.publication.status === "draft") return hidden("下書き");
  if (!listing.viewable) return hidden("店舗が非公開");
  return {
    id: listing.id,
    name,
    state: OFFERING_PHASE_LABEL[listing.offeringStatus.phase],
    hidden: false,
    href: `/listings/${encodeURIComponent(listing.id)}`,
    photoUrl: listing.cover?.display?.url ?? null,
  };
}

/** 参加日: `10月10日（土）、10月11日（日）`. */
export const participationDatesText = (dates: readonly string[]): string =>
  dates.length === 0 ? NONE : dates.map(jpDateWithWeekday).join("、");

// --- Content ----------------------------------------------------------------

const plain = (rows: readonly ContentRow[]): ContentData => ({
  rows,
  compare: null,
  preview: null,
  targetGone: false,
  droppedPhotos: 0,
  noPhotoLeft: false,
});

/** The content of an application as MY-05 and CM-01 show it. */
export function contentData(view: ApplicationContentView): ContentData {
  switch (view.kind) {
    case "registration":
      return plain(profileRows(view.profile));
    case "stewardship":
      return plain([
        { label: "店舗との関係", value: quote(view.relationship) },
        { label: "確認に使える連絡先・資料", value: quote(view.evidence) },
      ]);
    case "listing":
      return plain(listingRows(view.content));
    case "affiliation":
    case "leave":
      return plain([
        {
          label: "申請の種類",
          value: text(view.kind === "affiliation" ? "所属" : "離脱"),
        },
      ]);
    case "participation":
      return plain([
        {
          label: "添えた掲載",
          value: {
            kind: "listings",
            listings: view.listings.map(attachedLine),
          },
        },
        { label: "参加日", value: text(participationDatesText(view.dates)) },
      ]);
    case "revision":
      return {
        ...plain([]),
        compare: view.changes.map(placeCompared),
        preview: stateRows(view.preview),
      };
    case "listingRevision": {
      const { revision } = view;
      if (revision.listing === "deleted") {
        return {
          ...plain(
            revision.proposals.map((proposal) => ({
              label: LISTING_FIELD_LABEL[proposal.field],
              value: proposedValue(proposal, new Set()),
            })),
          ),
          targetGone: true,
        };
      }
      const kept = new Set(revision.preview.photos.map((p) => p.photoId));
      const dropped = new Set(
        revision.changes.flatMap((change) =>
          change.field === "photos"
            ? change.proposed
                .map((p) => p.photoId)
                .filter((id) => !kept.has(id))
            : [],
        ),
      );
      return {
        ...plain([]),
        compare: revision.changes.map((change) => ({
          label: LISTING_FIELD_LABEL[change.field],
          current: currentValue(change),
          proposed: proposedValue(change, dropped),
        })),
        preview: listingRows(revision.preview),
        droppedPhotos: dropped.size,
        noPhotoLeft: revision.preview.photos.length === 0,
      };
    }
  }
}

// --- Status, subjects, links -----------------------------------------------

/** The status with what it carries, for the screens. */
export function statusData(status: ApplicationStatusView): StatusData {
  switch (status.kind) {
    case "underReview":
      return {
        kind: "underReview",
        since: status.since.toISOString(),
        answering:
          status.answering === null
            ? null
            : {
                request: status.answering.request,
                reply: status.answering.reply,
              },
      };
    case "returned":
      return { kind: "returned", request: status.request };
    case "approved":
      return {
        kind: "approved",
        overdueProxy:
          "reviewAs" in status && status.reviewAs === "overdue_proxy",
      };
    case "rejected":
      return {
        kind: "rejected",
        reason: status.reason,
        overdueProxy:
          "reviewAs" in status && status.reviewAs === "overdue_proxy",
      };
    case "withdrawn":
      return { kind: "withdrawn" };
    case "lapsed":
      return {
        kind: "lapsed",
        premises: status.brokenPremises.map((key) => BROKEN_PREMISE_TEXT[key]),
      };
  }
}

/** Where a content target opens for viewers (DT-01 / DT-02; DT-03 / DT-04 later). */
export function viewerPath(ref: ContentRef): string | null {
  const id = encodeURIComponent(ref.id);
  switch (ref.kind) {
    case "place":
      return `/places/${id}`;
    case "listing":
      return `/listings/${id}`;
    case "region":
      return `/regions/${id}`;
    case "occasion":
      return `/events/${id}`;
    case "article":
      return `/articles/${id}`;
  }
}

const SUBJECT_LABEL: Readonly<Record<SubjectView["ref"]["kind"], string>> = {
  place: "店舗",
  listing: "掲載",
  region: "地域",
  occasion: "イベント",
};

/** 「まだない対象」: what does not exist until the approval. */
const NOT_YET_NOTE: Readonly<Record<SubjectView["ref"]["kind"], string>> = {
  place: "店舗はまだありません。登録が承認されると、店舗ができます。",
  listing: "掲載はまだありません。承認されると、掲載ができます。",
  region: "地域はまだありません。",
  occasion: "イベントはまだありません。",
};

/**
 * The subjects as rows: a 「まだない対象」 names the store from the
 * application's content and opens nowhere (never shown as hidden).
 */
export function subjectItems<S extends SubjectView>(
  subjects: readonly S[],
  noteOf: (subject: S) => string | null = () => null,
): readonly SubjectItem[] {
  return subjects.map((subject) => ({
    label: SUBJECT_LABEL[subject.ref.kind],
    name: subjectName(subject),
    href: subject.notYet ? null : viewerPath(subject.ref),
    note: subject.notYet ? NOT_YET_NOTE[subject.ref.kind] : noteOf(subject),
  }));
}

/**
 * An application id from the URL. One that cannot be an id names no
 * application (CS-06 / CS-17), not an input error.
 */
export function applicationIdOf(raw: string): ApplicationId {
  try {
    return ApplicationId.create(raw);
  } catch {
    throw new NotFoundError(
      "APPLICATION_NOT_FOUND",
      `No application has the id ${raw}`,
    );
  }
}

/**
 * The screen an application of this kind is submitted on (RQ-02〜RQ-06)
 * with its own parameters, where 再提出 (`resubmit`) and 再申請 (`reapply`)
 * continue it with the application's id. A claim filed with a
 * registration continues on RQ-03 of the reserved store. RQ-05 and RQ-06
 * take the place and the region / event in the query
 * (`/apply/affiliation?placeId=…&regionId=…&mode=join|leave`,
 * `/apply/participation?placeId=…&occasionId=…`).
 */
export function applyHref(
  content: ApplicationContentView,
  mode: "resubmit" | "reapply",
  applicationId: string,
): string {
  const continued = `${mode}=${encodeURIComponent(applicationId)}`;
  const place = encodeURIComponent(
    content.kind === "registration" ? "" : content.placeId,
  );
  switch (content.kind) {
    case "registration":
      return `/apply/places/new?${continued}`;
    case "revision":
      return `/apply/places/${place}/revision?${continued}`;
    case "stewardship":
      return `/apply/places/${place}/stewardship?${continued}`;
    case "listing":
      return `/apply/places/${place}/listings/new?${continued}`;
    case "listingRevision":
      return `/apply/listings/${encodeURIComponent(content.listingId)}/revision?${continued}`;
    case "affiliation":
    case "leave":
      return `/apply/affiliation?placeId=${place}&regionId=${encodeURIComponent(content.regionId)}&mode=${content.kind === "affiliation" ? "join" : "leave"}&${continued}`;
    case "participation":
      return `/apply/participation?placeId=${place}&occasionId=${encodeURIComponent(content.occasionId)}&${continued}`;
  }
}

/** The store an application's content is about; `null` for a registration. */
export function contentPlaceId(content: ApplicationContentView): string | null {
  return content.kind === "registration" ? null : content.placeId;
}

/** SM-01 of a store. */
export const shopHomePath = (placeId: string): string =>
  `/manage/places/${encodeURIComponent(placeId)}`;
