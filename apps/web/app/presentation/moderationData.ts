// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.

import { listApplicationsAwaitingReview } from "@repo/core/application/application/listApplicationsAwaitingReview";
import { listApplicationsForSubject } from "@repo/core/application/application/listApplicationsForSubject";
import { viewMembers } from "@repo/core/application/authority/viewMembers";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { readArticle } from "@repo/core/application/discovery/readArticle";
import { viewListing } from "@repo/core/application/discovery/viewListing";
import { viewOccasion } from "@repo/core/application/discovery/viewOccasion";
import { viewPlace } from "@repo/core/application/discovery/viewPlace";
import { viewRegion } from "@repo/core/application/discovery/viewRegion";
import { getManagedListing } from "@repo/core/application/listing/getManagedListing";
import { getConfirmationRequest } from "@repo/core/application/moderation/getConfirmationRequest";
import { getInfoReport } from "@repo/core/application/moderation/getInfoReport";
import { getTakedownClaim } from "@repo/core/application/moderation/getTakedownClaim";
import { listConfirmationRequestsForPlace } from "@repo/core/application/moderation/listConfirmationRequestsForPlace";
import { listOpenTakedownClaims } from "@repo/core/application/moderation/listOpenTakedownClaims";
import { listUnresolvedInfoReports } from "@repo/core/application/moderation/listUnresolvedInfoReports";
import type { InfoReportTargetView } from "@repo/core/application/moderation/views";
import { getManagedOccasion } from "@repo/core/application/occasion/getManagedOccasion";
import { getManagedPlace } from "@repo/core/application/place/getManagedPlace";
import { getManagedRegion } from "@repo/core/application/region/getManagedRegion";
import type { Actor } from "@repo/core/domain/common/actor";
import { Address } from "@repo/core/domain/common/address";
import { ArticleId, type PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { ContentRef } from "@repo/core/domain/common/refs";
import { requireActor } from "./actor";
import { subjectTitle } from "./applicationSubjects";
import { APPLICATION_KIND_TITLE } from "./applicationWords";
import { periodText } from "./detailView";
import { classifyError } from "./errorState";
import { publicationView } from "./listingData";
import { listingStateText, type PublicationView } from "./listingView";
import {
  CATEGORY_LABEL,
  type ClaimTargetState,
  type ConfirmationRequestData,
  dayText,
  INBOX_PAGE_SIZE,
  type InboxClaimRow,
  type InboxReportRow,
  type InfoReportData,
  type InfoReportPage,
  isReportTargetKind,
  isTakedownTargetKind,
  type OpsInboxData,
  REPORT_STATUS_LABEL,
  type ReportTargetRow,
  requestTitle,
  type ShopTodo,
  STANDING_LABEL,
  type TakedownClaimData,
  type TakedownPage,
  type TakedownPhoto,
  type TakedownTargetRow,
} from "./moderation";
import { claimIdOf, reportIdOf } from "./moderationIds";
import { occasionStateText } from "./occasionView";
import { requireOperator } from "./operatorAccess";
import { OPERATING_STATUS_LABEL, placeStateText } from "./placeView";
import { regionPublicationLabel, regionStateText } from "./regionView";
import { inboxApplicationRow } from "./subjectApplications";
import {
  listingIdOf,
  occasionIdOf,
  parseTargetId,
  placeIdOf,
  regionIdOf,
} from "./targetIds";

async function actorAndContainer() {
  const container = await getContainer();
  return { container, actor: await requireActor(container) };
}

/** A read whose not-found (or an id that names nothing) means "not viewable". */
async function orNull<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    const { kind } = classifyError(error);
    if (kind === "notFound" || kind === "invalidInput") return null;
    throw error;
  }
}

const OTHER_LISTINGS = 1;

type ViewedTarget = Readonly<{
  target: ReportTargetRow;
  place: ReportTargetRow | null;
  photos: readonly Readonly<{ photoId: string; url: string | null }>[];
  placeIsVacant: boolean;
}>;

/** RQ-07 / RQ-08's store or listing as viewers see it, or `null` when it is not viewable. */
async function viewTarget(
  container: RequestContainer,
  kind: string,
  id: string,
): Promise<ViewedTarget | null> {
  if (!isReportTargetKind(kind)) return null;
  if (kind === "place") {
    const output = await orNull(
      viewPlace({ container, actor: null, input: { placeId: placeIdOf(id) } }),
    );
    if (output === null) return null;
    const { place, photos } = output;
    const [cover] = place.photos;
    const row: ReportTargetRow = {
      kind: "place",
      id: place.placeId,
      name: place.name,
      meta: "店舗",
      sub: Address.text(place.address),
      photoUrl:
        cover === undefined ? null : (photos[cover.photoId]?.url ?? null),
    };
    return {
      target: row,
      place: null,
      photos: place.photos.map(({ photoId }) => ({
        photoId,
        url: photos[photoId]?.url ?? null,
      })),
      placeIsVacant: output.placeIsVacant,
    };
  }
  const output = await orNull(
    viewListing({
      container,
      input: {
        listingId: listingIdOf(id),
        otherListingsLimit: OTHER_LISTINGS,
      },
    }),
  );
  if (output === null) return null;
  const { listing, photos } = output;
  const [cover] = listing.photos;
  const placeCover = listing.place.cover;
  return {
    target: {
      kind: "listing",
      id: listing.listingId,
      name: listing.name,
      meta: `掲載 · ${listing.category.name}`,
      sub: listing.place.name,
      photoUrl:
        cover === undefined ? null : (photos[cover.photoId]?.url ?? null),
    },
    place: {
      kind: "place",
      id: listing.place.placeId,
      name: listing.place.name,
      meta: "掲載の店舗",
      sub: Address.text(listing.place.address),
      photoUrl:
        placeCover === null ? null : (photos[placeCover.photoId]?.url ?? null),
    },
    photos: listing.photos.map(({ photoId }) => ({
      photoId,
      url: photos[photoId]?.url ?? null,
    })),
    placeIsVacant: output.placeIsVacant,
  };
}

type ViewedClaimTarget = Readonly<{
  target: TakedownTargetRow;
  photos: readonly TakedownPhoto[];
}>;

/** RQ-07's region (DT-03) as viewers see it, or `null` when it is not viewable. */
async function viewRegionTarget(
  container: RequestContainer,
  id: string,
): Promise<ViewedClaimTarget | null> {
  const output = await orNull(
    viewRegion({ container, input: { regionId: regionIdOf(id) } }),
  );
  if (output === null) return null;
  const { region, photos } = output;
  const [cover] = region.photos;
  return {
    target: {
      kind: "region",
      id: region.regionId,
      name: region.name,
      meta: "地域",
      sub: Address.text(region.address),
      photoUrl:
        cover === undefined ? null : (photos[cover.photoId]?.url ?? null),
    },
    photos: region.photos.map(({ photoId }) => ({
      photoId,
      url: photos[photoId]?.url ?? null,
    })),
  };
}

/** RQ-07's event (DT-04) as viewers see it, or `null` when it is not viewable. */
async function viewOccasionTarget(
  container: RequestContainer,
  id: string,
): Promise<ViewedClaimTarget | null> {
  const output = await orNull(
    viewOccasion({
      container,
      actor: null,
      input: { occasionId: occasionIdOf(id) },
    }),
  );
  if (output === null) return null;
  const { occasion, photos } = output;
  const [cover] = occasion.photos;
  const [region] = output.regions;
  const today = LocalDate.fromInstant(container.clock.now());
  return {
    target: {
      kind: "occasion",
      id: occasion.occasionId,
      name: occasion.name,
      meta: `イベント · ${periodText(occasion.period, today)}`,
      sub: region?.name ?? Address.text(occasion.venue.address),
      photoUrl:
        cover === undefined ? null : (photos[cover.photoId]?.url ?? null),
    },
    photos: occasion.photos.map(({ photoId }) => ({
      photoId,
      url: photos[photoId]?.url ?? null,
    })),
  };
}

/** RQ-07's article (DT-05) as viewers read it, or `null` when it is not published. */
async function viewArticleTarget(
  container: RequestContainer,
  id: string,
): Promise<ViewedClaimTarget | null> {
  const output = await orNull(
    readArticle({
      container,
      input: {
        articleId: parseTargetId(ArticleId.create, id, "ARTICLE_NOT_FOUND"),
      },
    }),
  );
  if (output === null) return null;
  const { article, photos } = output;
  const [cover] = article.photos;
  return {
    target: {
      kind: "article",
      id: article.articleId,
      name: article.title,
      meta: "読みもの",
      sub: null,
      photoUrl:
        cover === undefined ? null : (photos[cover.photoId]?.url ?? null),
    },
    photos: article.photos.map(({ photoId }) => ({
      photoId,
      url: photos[photoId]?.url ?? null,
    })),
  };
}

/** RQ-07 (no login): a store, listing, region, event or article viewers can see. */
export async function loadTakedownPage(
  kind: string,
  id: string,
): Promise<TakedownPage> {
  if (!isTakedownTargetKind(kind)) return { kind: "unavailable" };
  const container = await getContainer();
  const viewed =
    kind === "region"
      ? await viewRegionTarget(container, id)
      : kind === "occasion"
        ? await viewOccasionTarget(container, id)
        : kind === "article"
          ? await viewArticleTarget(container, id)
          : await viewTarget(container, kind, id);
  if (viewed === null) return { kind: "unavailable" };
  return { kind: "form", target: viewed.target, photos: viewed.photos };
}

/** RQ-08 (the route has required the login). */
export async function loadInfoReportPage(
  kind: string,
  id: string,
): Promise<InfoReportPage> {
  const container = await getContainer();
  const viewed = await viewTarget(container, kind, id);
  if (viewed === null) return { kind: "unavailable" };
  return {
    kind: viewed.placeIsVacant ? "refused" : "form",
    target: viewed.target,
    place: viewed.place,
  };
}

// ---------------------------------------------------------------- OM-01

const TARGET_KIND_LABEL = {
  place: "店舗",
  listing: "掲載",
  region: "地域",
  occasion: "イベント",
  article: "読みもの",
} as const satisfies Readonly<Record<ContentRef["kind"], string>>;

function reportTargetTitle(target: InfoReportTargetView): {
  title: string;
  kindLabel: string;
} {
  if (target.target.kind === "place") {
    return {
      title: target.placeName ?? "（名称のない店舗）",
      kindLabel: "店舗",
    };
  }
  const listing = target.exists
    ? (target.listingName ?? "名称未設定の掲載")
    : target.listingName === null
      ? "削除された掲載"
      : `${target.listingName}（削除済み）`;
  return {
    title: listing,
    kindLabel: `掲載 · ${target.placeName ?? "店舗"}`,
  };
}

/** OM-01: the four kinds awaiting the operators, oldest first. */
export async function loadOpsInbox(): Promise<OpsInboxData> {
  const { container, actor } = await actorAndContainer();
  const pagination = { page: 1, limit: INBOX_PAGE_SIZE };
  const [asApprover, asOverdueProxy, claims, reports] = await Promise.all([
    listApplicationsAwaitingReview({
      container,
      actor,
      input: { section: "asApprover", pagination },
    }),
    listApplicationsAwaitingReview({
      container,
      actor,
      input: { section: "asOverdueProxy", pagination },
    }),
    listOpenTakedownClaims({ container, actor, input: { pagination } }),
    listUnresolvedInfoReports({ container, actor, input: { pagination } }),
  ]);
  return {
    asApprover: {
      count: asApprover.count,
      items: asApprover.items.map((item) =>
        inboxApplicationRow(item, "asApprover"),
      ),
    },
    asOverdueProxy: {
      count: asOverdueProxy.count,
      items: asOverdueProxy.items.map((item) =>
        inboxApplicationRow(item, "asOverdueProxy"),
      ),
    },
    claims: {
      count: claims.count,
      items: claims.items.map(
        (claim): InboxClaimRow => ({
          claimId: claim.claimId,
          title: claim.targetName ?? "（削除された対象）",
          sub: TARGET_KIND_LABEL[claim.target.kind],
          claimant: `${claim.email}（${STANDING_LABEL[claim.standing]}）`,
          status: `未対応 · ${dayText(claim.receivedAt.toISOString())}に受付`,
        }),
      ),
    },
    reports: {
      count: reports.count,
      items: reports.items.map((report): InboxReportRow => {
        const { title, kindLabel } = reportTargetTitle(report.target);
        return {
          reportId: report.reportId,
          title,
          sub: `${CATEGORY_LABEL[report.category]}の連絡 · ${kindLabel}`,
          reporter: report.reporterEmail ?? "退会した利用者",
          status: `${REPORT_STATUS_LABEL[report.status]} · ${dayText(
            report.receivedAt.toISOString(),
          )}に受付`,
        };
      }),
    },
  };
}

// ---------------------------------------------------------------- OM-04

async function claimTargetState(
  container: RequestContainer,
  actor: Actor,
  target: ContentRef,
  viewable: boolean,
  publication: PublicationView | null,
): Promise<{ state: ClaimTargetState; placeName: string | null }> {
  switch (target.kind) {
    case "listing": {
      const view = await orNull(
        getManagedListing({
          container,
          actor,
          input: { listingId: target.id },
        }),
      );
      if (view === null) return { state: { kind: "gone" }, placeName: null };
      return {
        state: {
          kind: "present",
          viewable,
          stateText: listingStateText(
            publicationView(view.publication),
            view.suspended,
            view.offeringStatus,
          ),
          suspended: view.suspended || view.place.suspended,
        },
        placeName: view.place.name,
      };
    }
    case "place": {
      const view = await orNull(
        getManagedPlace({ container, actor, input: { placeId: target.id } }),
      );
      if (view === null) return { state: { kind: "gone" }, placeName: null };
      return {
        state: {
          kind: "present",
          viewable,
          stateText: placeStateText({
            operatingStatus: view.place.operatingStatus,
            suspended: view.suspended,
          }),
          suspended: view.suspended,
        },
        placeName: null,
      };
    }
    case "region": {
      const view = await orNull(
        getManagedRegion({ container, actor, input: { regionId: target.id } }),
      );
      if (view === null) return { state: { kind: "gone" }, placeName: null };
      return {
        state: {
          kind: "present",
          viewable,
          stateText: regionStateText({
            publication: publicationView(view.region.publication),
            suspended: view.suspended,
          }),
          suspended: view.suspended,
        },
        placeName: null,
      };
    }
    case "occasion": {
      const view = await orNull(
        getManagedOccasion({
          container,
          actor,
          input: { occasionId: target.id },
        }),
      );
      if (view === null) return { state: { kind: "gone" }, placeName: null };
      return {
        state: {
          kind: "present",
          viewable,
          stateText: occasionStateText({
            publication: publicationView(view.publication),
            suspended: view.suspended,
            holding: view.holdingStatus,
          }),
          suspended: view.suspended,
        },
        placeName: null,
      };
    }
    case "article":
      if (publication === null) {
        return { state: { kind: "gone" }, placeName: null };
      }
      return {
        state: {
          kind: "present",
          viewable,
          stateText: articleStateText(publication),
          suspended: false,
        },
        placeName: null,
      };
  }
}

/** 下書き / 公開中 / 公開の取り下げ (as OM-04 words regions and events), with AM-01's takedown reason. */
function articleStateText(publication: PublicationView): string {
  const label = regionPublicationLabel(publication);
  return publication.reason === "photoTakedown"
    ? `${label} · 申立てによる写真の削除で取り下げ`
    : label;
}

/** OM-04: one claim with its target's current state and photos. */
export async function loadTakedownClaim(
  rawClaimId: string,
): Promise<TakedownClaimData> {
  const { container, actor } = await actorAndContainer();
  const detail = await getTakedownClaim({
    container,
    actor,
    input: { claimId: claimIdOf(rawClaimId) },
  });
  await requireOperator(container, actor);
  const { state, placeName } = detail.targetExists
    ? await claimTargetState(
        container,
        actor,
        detail.target,
        detail.targetViewable,
        detail.targetPublication,
      )
    : { state: { kind: "gone" } as const, placeName: null };
  return {
    claimId: detail.claimId,
    status: detail.status,
    standing: detail.standing,
    target: {
      kind: detail.target.kind,
      id: detail.target.id,
      name: detail.targetName,
      placeName,
    },
    targetState: state,
    photos:
      state.kind === "gone"
        ? []
        : detail.photos.map((photo) => ({
            photoId: photo.photoId,
            url: photo.displayRef.url,
            claimed: photo.claimed,
          })),
    removedClaimedCount: detail.removedClaimedPhotoIds.length,
    claimedCount: detail.claimedPhotoIds.length,
    reason: detail.reason,
    email: detail.email,
    receivedAt: detail.receivedAt.toISOString(),
    outcome: detail.outcome,
  };
}

// ---------------------------------------------------------------- OM-05

/** OM-05: one report, the reporter, and the store as it stands now. */
export async function loadInfoReport(
  rawReportId: string,
): Promise<InfoReportData> {
  const { container, actor } = await actorAndContainer();
  const detail = await getInfoReport({
    container,
    actor,
    input: { reportId: reportIdOf(rawReportId) },
  });
  await requireOperator(container, actor);
  const placeId: PlaceId = detail.target.target.placeId;
  const [place, members] = await Promise.all([
    orNull(getManagedPlace({ container, actor, input: { placeId } })),
    orNull(
      viewMembers({
        container,
        actor,
        input: { target: { kind: "place", id: placeId } },
      }),
    ),
  ]);
  const { target } = detail.target;
  return {
    reportId: detail.reportId,
    status: detail.status,
    category: detail.category,
    content: detail.content,
    target: {
      kind: target.kind,
      placeId: target.placeId,
      listingId: target.kind === "listing" ? target.listingId : null,
      placeName: detail.target.placeName,
      listingName: detail.target.listingName,
      exists: detail.target.exists,
      viewable: detail.targetViewable,
    },
    reporterEmail: detail.reporterEmail,
    receivedAt: detail.receivedAt.toISOString(),
    requestedAt: detail.requestedAt?.toISOString() ?? null,
    place:
      place === null
        ? null
        : {
            stateText: `${OPERATING_STATUS_LABEL[place.place.operatingStatus]} · ${
              place.suspended ? "店舗は非公開" : "店舗ページ公開中"
            }`,
            suspended: place.suspended,
            stewardCount: detail.placeHasSteward
              ? (members?.stewards.length ?? 0)
              : 0,
          },
  };
}

// ---------------------------------------------------------------- SM-07

/** SM-07: one request to the actor's store (the place layout has checked the store). */
export async function loadConfirmationRequest(
  rawReportId: string,
): Promise<ConfirmationRequestData> {
  const { container, actor } = await actorAndContainer();
  const detail = await getConfirmationRequest({
    container,
    actor,
    input: { reportId: reportIdOf(rawReportId) },
  });
  const { target } = detail.target;
  return {
    reportId: detail.reportId,
    status: detail.status,
    category: detail.category,
    content: detail.content,
    requestedAt: detail.requestedAt.toISOString(),
    target: {
      kind: target.kind,
      placeId: target.placeId,
      listingId: target.kind === "listing" ? target.listingId : null,
      placeName: detail.target.placeName,
      listingName: detail.target.listingName,
      exists: detail.target.exists,
    },
  };
}

const TODO_LIMIT = 100;

/** SM-01's 対応が必要なこと: the returned applications and the open requests. */
export async function loadShopTodo(
  container: RequestContainer,
  actor: Actor,
  placeId: PlaceId,
): Promise<ShopTodo> {
  const [applications, requests] = await Promise.all([
    listApplicationsForSubject({
      container,
      actor,
      input: {
        subject: { kind: "place", id: placeId },
        pagination: { page: 1, limit: TODO_LIMIT },
      },
    }),
    listConfirmationRequestsForPlace({
      container,
      actor,
      input: { placeId, pagination: { page: 1, limit: TODO_LIMIT } },
    }),
  ]);
  return {
    returned: applications.items
      .filter((item) => item.status.kind === "returned")
      .map((item) => ({
        applicationId: item.id,
        title: `${APPLICATION_KIND_TITLE[item.kind]} · ${subjectTitle(item.subjects)}`,
      })),
    requests: {
      count: requests.count,
      items: requests.items.map((item) => ({
        reportId: item.reportId,
        title: requestTitle(item.category, {
          kind: item.target.target.kind,
          placeName: item.target.placeName,
          listingName: item.target.listingName,
          exists: item.target.exists,
        }),
        requestedAt: item.requestedAt.toISOString(),
      })),
    },
  };
}
