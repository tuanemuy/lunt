// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { listApplicationsForSubject } from "@repo/core/application/application/listApplicationsForSubject";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import type { AttachedListingView } from "@repo/core/application/occasion/attachedListings";
import { getPlaceParticipations } from "@repo/core/application/occasion/getPlaceParticipations";
import { getPlaceAffiliationStatus } from "@repo/core/application/region/getPlaceAffiliationStatus";
import type { ApplicationKind } from "@repo/core/domain/application/application";
import type { Actor } from "@repo/core/domain/common/actor";
import type { DateRange } from "@repo/core/domain/common/dateRange";
import type { PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { requireActor } from "./actor";
import { applicationTitle } from "./applicationSubjects";
import {
  APPLICATION_KIND_TITLE,
  monthDayText,
  STATUS_LABEL,
  STATUS_TONE,
} from "./applicationWords";
import { jpDateWithWeekday, listingStateText } from "./listingView";
import { PAGINATION_MAX_LIMIT } from "./pagination";
import type {
  AffiliationStatusData,
  AttachedListingLine,
  PendingApplicationItem,
  ShopEventsData,
} from "./shopRelations";
import { placeIdOf } from "./targetIds";

async function actorAndContainer() {
  const container = await getContainer();
  return { container, actor: await requireActor(container) };
}

/** `3月` in `today`'s year, `2025年3月` otherwise (Japan time). */
function monthText(instant: Date, today: LocalDate): string {
  const [year, month] = LocalDate.fromInstant(instant).split("-").map(Number);
  const [thisYear] = today.split("-").map(Number);
  return year === thisYear ? `${month}月` : `${year}年${month}月`;
}

/** The most applications of a store SM-05 and SM-06 read (a store has few in progress). */
const PENDING_LIMIT = 100;

/**
 * The store's applications of `kinds` under review or returned
 * (`listApplicationsForSubject`: those made as its steward), each leading
 * to its MY-05.
 */
async function pendingApplications(
  container: RequestContainer,
  actor: Actor,
  placeId: PlaceId,
  kinds: readonly ApplicationKind[],
): Promise<readonly PendingApplicationItem[]> {
  const page = await listApplicationsForSubject({
    container,
    actor,
    input: {
      subject: { kind: "place", id: placeId },
      pagination: { page: 1, limit: PENDING_LIMIT },
    },
  });
  return page.items
    .filter((item) => kinds.includes(item.kind))
    .map((item) => ({
      applicationId: item.id,
      title: `${APPLICATION_KIND_TITLE[item.kind]} · ${applicationTitle(item)}`,
      meta: `申請者 ${item.applicant.kind === "place" ? (item.applicant.name ?? "この店舗") : "あなた"} · ${monthDayText(item.submittedAt.toISOString())}`,
      status: STATUS_LABEL[item.status.kind],
      tone: STATUS_TONE[item.status.kind],
    }));
}

/** SM-05. */
export async function loadAffiliationStatus(
  rawPlaceId: string,
): Promise<AffiliationStatusData> {
  const { container, actor } = await actorAndContainer();
  const today = LocalDate.fromInstant(container.clock.now());
  const placeId = placeIdOf(rawPlaceId);
  const [status, pending] = await Promise.all([
    getPlaceAffiliationStatus({ container, actor, input: { placeId } }),
    pendingApplications(container, actor, placeId, ["affiliation", "leave"]),
  ]);
  return {
    regions: status.regions.map((region) => ({
      regionId: region.regionId,
      name: region.name,
      photoUrl: region.cover?.displayRef.url ?? null,
      since: monthText(region.affiliatedAt, today),
      publication: region.publication.status,
      suspended: region.suspended,
      viewable: region.viewable,
    })),
    representative:
      status.representative === null
        ? null
        : {
            regionId: status.representative.regionId,
            chosen: status.representative.chosen,
          },
    displayedRegionId: status.displayedRegionId,
    pending,
  };
}

function periodText(period: DateRange | null): string | null {
  if (period === null) return null;
  const from = jpDateWithWeekday(period.start);
  return period.start === period.end
    ? from
    : `${from}〜${jpDateWithWeekday(period.end)}`;
}

function listingLine(listing: AttachedListingView): AttachedListingLine {
  if (listing.deleted) return { listingId: listing.id, deleted: true };
  return {
    listingId: listing.id,
    deleted: false,
    name: listing.name,
    stateText: listingStateText(
      {
        status: listing.publication.status,
        reason:
          listing.publication.status === "unpublished"
            ? listing.publication.reason
            : null,
      },
      listing.suspended,
      listing.offeringStatus,
    ),
    viewable: listing.viewable,
  };
}

/** The pages SM-06 reads at most (a store takes part in few occasions). */
const MAX_PAGES = 20;

/** SM-06: every participation of the store, newest first. */
export async function loadShopEvents(
  rawPlaceId: string,
): Promise<ShopEventsData> {
  const { container, actor } = await actorAndContainer();
  const placeId = placeIdOf(rawPlaceId);
  const items: ShopEventsData["items"][number][] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const read = await getPlaceParticipations({
      container,
      actor,
      input: { placeId, pagination: { page, limit: PAGINATION_MAX_LIMIT } },
    });
    for (const { occasion, participation } of read.items) {
      items.push({
        occasionId: occasion.id,
        name: occasion.name,
        photoUrl: occasion.cover?.displayRef.url ?? null,
        periodText: periodText(occasion.period),
        publication: occasion.publication.status,
        suspended: occasion.suspended,
        holding: occasion.holdingStatus,
        listings: participation.listings.map(listingLine),
        days: participation.visibleDates.map(jpDateWithWeekday),
        outOfPeriodDays: participation.outOfPeriodDates.map(jpDateWithWeekday),
      });
    }
    if (read.items.length === 0 || items.length >= read.count) break;
  }
  return {
    items,
    pending: await pendingApplications(container, actor, placeId, [
      "participation",
    ]),
  };
}
