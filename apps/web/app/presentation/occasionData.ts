// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { listApplicationsForSubject } from "@repo/core/application/application/listApplicationsForSubject";
import { viewMembers } from "@repo/core/application/authority/viewMembers";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { findSelectionCandidates } from "@repo/core/application/discovery/findSelectionCandidates";
import { viewPlace } from "@repo/core/application/discovery/viewPlace";
import {
  ForbiddenError,
  isNotFoundError,
  NotFoundError,
} from "@repo/core/application/errors";
import type { AttachedListingView } from "@repo/core/application/occasion/attachedListings";
import { getManagedOccasion } from "@repo/core/application/occasion/getManagedOccasion";
import { getParticipationDetails } from "@repo/core/application/occasion/getParticipationDetails";
import { listAttachableListings } from "@repo/core/application/occasion/listAttachableListings";
import {
  listOccasionParticipants,
  type ParticipantView,
} from "@repo/core/application/occasion/listOccasionParticipants";
import { listOccasionRegionLinks } from "@repo/core/application/occasion/listOccasionRegionLinks";
import type { ManagedOccasionView } from "@repo/core/application/occasion/managedOccasion";
import type { ParticipationView } from "@repo/core/application/occasion/participationViews";
import type { Actor } from "@repo/core/domain/common/actor";
import { Address } from "@repo/core/domain/common/address";
import {
  OccasionId,
  PlaceId,
  type PlaceId as PlaceIdType,
} from "@repo/core/domain/common/ids";
import { requireActor } from "./actor";
import { loadAreaLists, townOfAddress } from "./areaData";
import { missingChildFirst } from "./childTargets";
import { publicationView } from "./listingData";
import {
  APPLICATION_PAGE_SIZE,
  type AttachedListingItem,
  type CandidatePage,
  OCCASION_PROXY_UNAVAILABLE,
  type OccasionEditorData,
  type OccasionFrame,
  occasionName,
  occasionStateText,
  PARTICIPANT_PAGE_SIZE,
  type ParticipantBoardData,
  type ParticipantItem,
  type ParticipationEditorData,
  type ParticipationItem,
  type ParticipationSide,
  type RegionLinkItem,
  type RegionLinksData,
  type SubjectApplicationItem,
} from "./occasionView";
import type { AreaLists } from "./placeView";
import { participationApplicationItem } from "./subjectApplications";

const OCCASION_NOT_FOUND = "OCCASION_NOT_FOUND";

/** An event id from the URL; one that cannot be an id names no event (CS-17). */
export function occasionIdOf(raw: string): OccasionId {
  try {
    return OccasionId.create(raw);
  } catch {
    throw new NotFoundError(
      OCCASION_NOT_FOUND,
      `No occasion has the id ${raw}`,
    );
  }
}

function placeIdOf(raw: string): PlaceIdType {
  try {
    return PlaceId.create(raw);
  } catch {
    throw new NotFoundError("PLACE_NOT_FOUND", `No place has the id ${raw}`);
  }
}

async function actorAndContainer() {
  const container = await getContainer();
  return { container, actor: await requireActor(container) };
}

/**
 * The EM screens' check on an event read with `inspect_target` (its event
 * operators and every service operator): only `manage_target` may go on.
 * The read let the actor in, so a refusal here is an operator facing an
 * event that has an event operator (CS-15). Every EM loader repeats it,
 * since the RSC render endpoints can be called without the area's guard.
 */
export function requireOccasionManagement(view: ManagedOccasionView): void {
  if (!view.access.manageable) {
    throw new ForbiddenError(
      OCCASION_PROXY_UNAVAILABLE,
      "The occasion has an occasion operator, so an operator may not manage it",
    );
  }
}

function frameOf(view: ManagedOccasionView): OccasionFrame {
  return {
    occasionId: view.id,
    name: view.name,
    period:
      view.period === null
        ? null
        : { start: view.period.start, end: view.period.end },
    publication: publicationView(view.publication),
    suspended: view.suspended,
    holding: view.holdingStatus,
    viewable: view.viewable,
    basis: view.access.basis === "steward" ? "steward" : "proxy",
    hasSteward: view.access.hasSteward,
  };
}

async function readManaged(
  container: RequestContainer,
  actor: Actor,
  rawId: string,
): Promise<ManagedOccasionView> {
  const view = await getManagedOccasion({
    container,
    actor,
    input: { occasionId: occasionIdOf(rawId) },
  });
  requireOccasionManagement(view);
  return view;
}

/**
 * See `loadOccasionFrameFn`. `path` is the screen's, so a refusal gives
 * way to a missing store the screen (CM-04) is about.
 */
export async function loadOccasionFrame(
  container: RequestContainer,
  actor: Actor,
  rawId: string,
  path: string | null = null,
): Promise<OccasionFrame> {
  const view = await readManaged(container, actor, rawId).catch(
    async (error: unknown) => {
      throw await missingChildFirst(container, actor, path, error);
    },
  );
  return frameOf(view);
}

export const attachedItem = (
  listing: AttachedListingView,
): AttachedListingItem =>
  listing.deleted
    ? { id: listing.id, deleted: true }
    : {
        id: listing.id,
        deleted: false,
        name: listing.name,
        photoUrl: listing.cover?.display?.url ?? null,
        publication: publicationView(listing.publication),
        suspended: listing.suspended,
        offeringStatus: listing.offeringStatus,
        viewable: listing.viewable,
      };

const participationItem = (p: ParticipationView): ParticipationItem => ({
  version: p.version,
  listings: p.listings.map(attachedItem),
  dates: p.dates,
  outOfPeriodDates: p.outOfPeriodDates,
});

const participantItem = (item: ParticipantView): ParticipantItem => ({
  placeId: item.place.id,
  name: item.place.name,
  photoUrl: item.place.cover?.displayRef.url ?? null,
  operatingStatus: item.place.operatingStatus,
  suspended: item.place.suspended,
  hasSteward: item.placeHasSteward,
  participation: participationItem(item.participation),
});

/** One page of EM-01's participants (CF-05). */
export async function loadParticipantPage(
  rawId: string,
  page: number,
): Promise<Readonly<{ items: readonly ParticipantItem[]; count: number }>> {
  const { container, actor } = await actorAndContainer();
  const result = await listOccasionParticipants({
    container,
    actor,
    input: {
      occasionId: occasionIdOf(rawId),
      pagination: { page, limit: PARTICIPANT_PAGE_SIZE },
    },
  });
  return { items: result.items.map(participantItem), count: result.count };
}

/** EM-01: a page of the participation applications, active ones first (CF-05). */
export async function loadOccasionApplicationPage(
  rawId: string,
  page: number,
): Promise<
  Readonly<{ items: readonly SubjectApplicationItem[]; count: number }>
> {
  const { container, actor } = await actorAndContainer();
  const result = await listApplicationsForSubject({
    container,
    actor,
    input: {
      subject: { kind: "occasion", id: occasionIdOf(rawId) },
      pagination: { page, limit: APPLICATION_PAGE_SIZE },
    },
  });
  return {
    items: result.items.map(participationApplicationItem),
    count: result.count,
  };
}

/** Every participant of the event (a management list, capped by its size). */
async function allParticipants(
  container: RequestContainer,
  actor: Actor,
  occasionId: OccasionId,
): Promise<readonly ParticipantView[]> {
  const items: ParticipantView[] = [];
  for (let page = 1; ; page += 1) {
    const result = await listOccasionParticipants({
      container,
      actor,
      input: { occasionId, pagination: { page, limit: 100 } },
    });
    items.push(...result.items);
    if (items.length >= result.count || result.items.length === 0) {
      return items;
    }
  }
}

/** A place's name as viewers see it, or `null` when they cannot. */
async function viewablePlaceName(
  container: RequestContainer,
  actor: Actor,
  placeId: PlaceIdType,
): Promise<string | null> {
  try {
    const viewed = await viewPlace({ container, actor, input: { placeId } });
    return viewed.place.name;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

/** EM-01, and the place a notification pointed at (`?participant=`). */
export async function loadParticipantBoard(
  rawId: string,
  rawFocus: string | null,
): Promise<ParticipantBoardData> {
  const { container, actor } = await actorAndContainer();
  const view = await readManaged(container, actor, rawId);
  const occasionId = view.id;
  const [participants, applications] = await Promise.all([
    listOccasionParticipants({
      container,
      actor,
      input: {
        occasionId,
        pagination: { page: 1, limit: PARTICIPANT_PAGE_SIZE },
      },
    }),
    listApplicationsForSubject({
      container,
      actor,
      input: {
        subject: { kind: "occasion", id: occasionId },
        pagination: { page: 1, limit: APPLICATION_PAGE_SIZE },
      },
    }),
  ]);
  const items = participants.items.map(participantItem);
  const focus = await (async () => {
    if (rawFocus === null) return null;
    let placeId: PlaceIdType;
    try {
      placeId = placeIdOf(rawFocus);
    } catch {
      return null;
    }
    const listed = items.find((item) => item.placeId === placeId);
    if (listed !== undefined) {
      return { placeId, name: listed.name, participating: true };
    }
    const details = await getParticipationDetails({
      container,
      actor,
      input: { occasionId, placeId },
    }).catch((error: unknown) => {
      if (isNotFoundError(error)) return null;
      throw error;
    });
    return {
      placeId,
      name: await viewablePlaceName(container, actor, placeId),
      participating: details?.participation != null,
    };
  })();
  return {
    participants: items,
    count: participants.count,
    applications: applications.items.map(participationApplicationItem),
    applicationCount: applications.count,
    underReviewCount: applications.underReviewCount ?? 0,
    focus,
  };
}

/** EM-02 (編集). */
export async function loadOccasionEditor(
  rawId: string,
): Promise<OccasionEditorData> {
  const { container, actor } = await actorAndContainer();
  const view = await readManaged(container, actor, rawId);
  const town =
    view.address === null ? null : await townOfAddress(container, view.address);
  const [areaLists, links, members] = await Promise.all([
    loadAreaLists(container, town),
    listOccasionRegionLinks({
      container,
      actor,
      input: { occasionId: view.id, pagination: { page: 1, limit: 1 } },
    }),
    view.access.basis === "steward"
      ? viewMembers({
          container,
          actor,
          input: { target: { kind: "occasion", id: view.id } },
        }).then((result) => result.stewards.length)
      : Promise.resolve(0),
  ]);
  const [firstLink] = links.items;
  return {
    occasionId: view.id,
    version: view.version,
    name: view.name ?? "",
    period:
      view.period === null
        ? null
        : { start: view.period.start, end: view.period.end },
    town,
    addressRest: view.address?.rest ?? "",
    addressText: view.address === null ? null : Address.text(view.address),
    location:
      view.location === null
        ? null
        : {
            latitude: view.location.latitude,
            longitude: view.location.longitude,
          },
    photos: view.photos.map((photo) => ({
      photoId: photo.photoId,
      url: photo.display?.url ?? "",
    })),
    photosTakenDown: view.photosTakenDown,
    description: view.description ?? "",
    tagline: view.tagline ?? "",
    publication: publicationView(view.publication),
    suspended: view.suspended,
    cancelled: view.cancelled,
    holding: view.holdingStatus,
    viewable: view.viewable,
    missing: view.missingRequirements,
    linkedRegions: {
      count: links.count,
      first: firstLink?.region.name ?? null,
    },
    stewardCount: members,
    areaLists,
  };
}

/** EM-02 (新規): only the prefectures to start the address from. */
export async function loadNewOccasionLists(): Promise<AreaLists> {
  return loadAreaLists(await getContainer(), null);
}

async function allRegionLinks(
  container: RequestContainer,
  actor: Actor,
  occasionId: OccasionId,
): Promise<readonly RegionLinkItem[]> {
  const items: RegionLinkItem[] = [];
  for (let page = 1; ; page += 1) {
    const result = await listOccasionRegionLinks({
      container,
      actor,
      input: { occasionId, pagination: { page, limit: 100 } },
    });
    items.push(
      ...result.items.map((link) => ({
        regionId: link.region.id,
        name: link.region.name,
        photoUrl: link.region.cover?.displayRef.url ?? null,
        status: link.status,
        publication: publicationView(link.region.publication),
        suspended: link.region.suspended,
        linkedAt: link.linkedAt.toISOString(),
      })),
    );
    if (items.length >= result.count || result.items.length === 0) {
      return items;
    }
  }
}

/** EM-03. */
export async function loadRegionLinks(rawId: string): Promise<RegionLinksData> {
  const { container, actor } = await actorAndContainer();
  const view = await readManaged(container, actor, rawId);
  return { items: await allRegionLinks(container, actor, view.id) };
}

const CANDIDATE_LIMIT = 20;

const areaText = (address: Address): string =>
  `${address.prefecture}${address.municipality}${address.town}`;

/** EM-03 CF-02: published regions matching `keyword`, and why a linked or detached one cannot be chosen. */
export async function findRegionCandidates(
  rawId: string,
  keyword: string,
): Promise<CandidatePage> {
  const { container, actor } = await actorAndContainer();
  const view = await readManaged(container, actor, rawId);
  const [found, links] = await Promise.all([
    findSelectionCandidates({
      container,
      input: {
        scope: { kind: "region" },
        keyword,
        pagination: { page: 1, limit: CANDIDATE_LIMIT },
      },
    }),
    allRegionLinks(container, actor, view.id),
  ]);
  if (found.candidates.kind !== "region") return { items: [], count: 0 };
  const status = new Map(links.map((link) => [link.regionId, link.status]));
  return {
    items: found.candidates.items.map((region) => {
      const linked = status.get(region.regionId);
      return {
        id: region.regionId,
        name: region.name,
        meta: `${areaText(region.address)} · 公開中`,
        photoUrl: found.photos[region.cover.photoId]?.url ?? null,
        refusal:
          linked === "linked"
            ? "関連づけ済みのため選べません"
            : linked === "detached"
              ? "地域の運営者が関連づけを解除したため選べません"
              : null,
      };
    }),
    count: found.candidates.count,
  };
}

/** CM-04 追加 CF-02: viewable places without a steward, and whether each already takes part. */
export async function findPlaceCandidates(
  rawId: string,
  keyword: string,
): Promise<CandidatePage> {
  const { container, actor } = await actorAndContainer();
  const view = await readManaged(container, actor, rawId);
  const [found, participants] = await Promise.all([
    findSelectionCandidates({
      container,
      input: {
        scope: { kind: "place", vacantOnly: true },
        keyword,
        pagination: { page: 1, limit: CANDIDATE_LIMIT },
      },
    }),
    allParticipants(container, actor, view.id),
  ]);
  if (found.candidates.kind !== "place") return { items: [], count: 0 };
  const taking = new Set(participants.map((item) => item.place.id));
  return {
    items: found.candidates.items.map(({ summary }) => {
      const participating = taking.has(summary.placeId);
      const cover = summary.cover;
      return {
        id: summary.placeId,
        name: summary.name,
        meta: [
          Address.text(summary.address),
          ...(summary.region === null ? [] : [summary.region]),
        ].join(" · "),
        photoUrl:
          cover === null ? null : (found.photos[cover.photoId]?.url ?? null),
        refusal: participating ? "参加中のため選べません" : null,
        participating,
      };
    }),
    count: found.candidates.count,
  };
}

/**
 * CM-04's content from one side: the place's steward
 * (`/manage/places/$placeId/events/$occasionId`) or the event's operator
 * (`/manage/events/$occasionId/participants/…`). `ForbiddenError` when the
 * side the URL names is not the one the viewer may act on.
 */
export async function loadParticipationEditor(
  input: Readonly<{
    side: ParticipationSide;
    occasionId: string;
    placeId: string;
  }>,
): Promise<ParticipationEditorData> {
  const { container, actor } = await actorAndContainer();
  const occasionId = occasionIdOf(input.occasionId);
  const placeId = placeIdOf(input.placeId);
  if (input.side === "occasion") {
    await readManaged(container, actor, input.occasionId);
  }
  const details = await getParticipationDetails({
    container,
    actor,
    input: { occasionId, placeId },
  });
  if (input.side === "place" && details.side !== "place") {
    throw new ForbiddenError(
      "PLACE_NOT_STEWARDED",
      "Only the place's stewards change its participation from the place",
    );
  }
  const attachable = await listAttachableListings({
    container,
    actor,
    input: { occasionId, placeId, pagination: { page: 1, limit: 100 } },
  });
  const { occasion, place } = details;
  return {
    side: input.side,
    occasion: {
      id: occasion.id,
      name: occasion.name,
      period:
        occasion.period === null
          ? null
          : { start: occasion.period.start, end: occasion.period.end },
      publication: publicationView(occasion.publication),
      suspended: occasion.suspended,
      holding: occasion.holdingStatus,
      photoUrl: occasion.cover?.displayRef.url ?? null,
    },
    place: {
      id: placeId,
      name: place.name,
      operatingStatus: place.operatingStatus,
      hasSteward: details.placeHasSteward,
      photoUrl: place.cover?.displayRef.url ?? null,
    },
    participation:
      details.participation === null
        ? null
        : participationItem(details.participation),
    attachable: attachable.items.map((listing) => ({
      id: listing.id,
      name: listing.name,
      photoUrl: listing.cover?.display?.url ?? null,
      offeringStatus: listing.offeringStatus,
    })),
  };
}

/**
 * CM-02's facts about an event (`membersData.ts`): its name and state as
 * its event operators see them, whether the viewer is one, and whether it
 * has none. `inspect_target`: its operators and service operators.
 */
export async function readOccasionMembersTarget(
  container: RequestContainer,
  actor: Actor,
  rawId: string,
): Promise<
  Readonly<{ name: string; state: string; steward: boolean; vacant: boolean }>
> {
  const view = await getManagedOccasion({
    container,
    actor,
    input: { occasionId: occasionIdOf(rawId) },
  });
  return {
    name: occasionName(view.name),
    state: occasionStateText({
      publication: publicationView(view.publication),
      suspended: view.suspended,
      holding: view.holdingStatus,
    }),
    steward: view.access.basis === "steward",
    vacant: !view.access.hasSteward,
  };
}
