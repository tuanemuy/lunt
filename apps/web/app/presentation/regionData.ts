// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { listApplicationsForSubject } from "@repo/core/application/application/listApplicationsForSubject";
import type {
  ApplicantView,
  ApplicationSummary,
} from "@repo/core/application/application/views";
import { viewMembers } from "@repo/core/application/authority/viewMembers";
import { getContainer } from "@repo/core/application/di/containerStore";
import { ForbiddenError } from "@repo/core/application/errors";
import { detachRegionLink } from "@repo/core/application/occasion/detachRegionLink";
import { listRegionOccasionLinks } from "@repo/core/application/occasion/listRegionOccasionLinks";
import { restoreRegionLink } from "@repo/core/application/occasion/restoreRegionLink";
import { excludeAffiliatedPlace } from "@repo/core/application/region/excludeAffiliatedPlace";
import {
  getManagedRegion,
  type ManagedRegionView,
} from "@repo/core/application/region/getManagedRegion";
import { listAffiliatedPlaces } from "@repo/core/application/region/listAffiliatedPlaces";
import { publishRegion } from "@repo/core/application/region/publishRegion";
import type { RegionContentFields } from "@repo/core/application/region/regions";
import { registerRegion } from "@repo/core/application/region/registerRegion";
import { unpublishRegion } from "@repo/core/application/region/unpublishRegion";
import { updateRegionContent } from "@repo/core/application/region/updateRegionContent";
import { TownRef } from "@repo/core/domain/area/townRef";
import { PhotoId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { Version } from "@repo/core/domain/common/version";
import { requireActor } from "./actor";
import { subjectName, subjectTitle } from "./applicationSubjects";
import {
  APPLICATION_KIND_TITLE,
  monthDayText,
  STATUS_LABEL,
  STATUS_TONE,
} from "./applicationWords";
import { loadAreaLists, townOfAddress } from "./areaData";
import { publicationView } from "./listingData";
import type { AreaLists } from "./placeView";
import type {
  RegionContentInput,
  RegionLinkChange,
  RegionPublicationChange,
} from "./region";
import {
  type AffiliatedPlaceItem,
  type AffiliationsData,
  type ListPage,
  REGION_LIST_PAGE_SIZE,
  REGION_PROXY_UNAVAILABLE,
  type RegionApplicationItem,
  type RegionEditorData,
  type RegionFrame,
  type RegionLinkItem,
} from "./regionView";
import { occasionIdOf, placeIdOf, regionIdOf } from "./targetIds";
import { parseGeneratedId } from "./validator";

async function actorAndContainer() {
  const container = await getContainer();
  return { container, actor: await requireActor(container) };
}

const FIRST_PAGE = { page: 1, limit: REGION_LIST_PAGE_SIZE } as const;

/**
 * The RM screens' check on a region read with `inspect_target` (its
 * stewards and every operator): only `manage_target` may go on. The read
 * let the actor in, so a refusal here is an operator facing a region that
 * has a steward (CS-15). Every RM loader repeats it, since the RSC render
 * endpoints can be called without the area's guard.
 */
function requireRegionManagement(view: ManagedRegionView): void {
  if (!view.management.allowed) {
    throw new ForbiddenError(
      REGION_PROXY_UNAVAILABLE,
      "The region has a steward, so an operator may not manage it",
    );
  }
}

async function managedRegion(rawRegionId: string) {
  const { container, actor } = await actorAndContainer();
  const regionId = regionIdOf(rawRegionId);
  const view = await getManagedRegion({
    container,
    actor,
    input: { regionId },
  });
  requireRegionManagement(view);
  return { container, actor, regionId, view };
}

/** See `loadRegionFrameFn`. */
export async function loadRegionFrame(
  rawRegionId: string,
): Promise<RegionFrame> {
  const { view } = await managedRegion(rawRegionId);
  const { region, management } = view;
  return {
    regionId: region.id,
    name: region.content.name,
    publication: publicationView(region.publication),
    suspended: view.suspended,
    basis:
      management.allowed && management.basis === "steward"
        ? "steward"
        : "proxy",
    hasSteward: view.hasSteward,
  };
}

/** The transport's content as `registerRegion` / `updateRegionContent` take it. */
function contentFieldsOf(input: RegionContentInput): RegionContentFields {
  return {
    name: input.name,
    tagline: input.tagline,
    description: input.description,
    photoIds: input.photoIds.map(PhotoId.create),
    address:
      input.address === null
        ? null
        : {
            town: TownRef.create(input.address.town),
            rest: input.address.rest,
          },
    location: input.location,
  };
}

/** RM-02 新規: registers the region as a draft (REG-12). */
export async function registerRegionAsOperator(
  rawRegionId: string,
  input: RegionContentInput,
): Promise<Readonly<{ regionId: string }>> {
  const { container, actor } = await actorAndContainer();
  const { region } = await registerRegion({
    container,
    actor,
    input: {
      regionId: parseGeneratedId(
        container.idGenerator,
        "regionId",
        rawRegionId,
      ),
      content: contentFieldsOf(input),
    },
  });
  return { regionId: region.id };
}

/** RM-02: saves the whole content; answers the version the next save sends. */
export async function saveRegionContent(
  rawRegionId: string,
  version: number,
  input: RegionContentInput,
): Promise<Readonly<{ version: number }>> {
  const { container, actor } = await actorAndContainer();
  const { region } = await updateRegionContent({
    container,
    actor,
    input: {
      regionId: regionIdOf(rawRegionId),
      version: Version.create(version),
      content: contentFieldsOf(input),
    },
  });
  return { version: region.version };
}

/** RM-02 (CF-08): publish or 公開の取り下げ. */
export async function changeRegionPublication(
  rawRegionId: string,
  change: RegionPublicationChange,
): Promise<Readonly<{ version: number }>> {
  const { container, actor } = await actorAndContainer();
  const input = { regionId: regionIdOf(rawRegionId) };
  const region =
    change === "publish"
      ? await publishRegion({ container, actor, input })
      : await unpublishRegion({ container, actor, input });
  return { version: region.version };
}

/** RM-01: a page of the affiliated places, newest affiliation first. */
export async function loadAffiliatedPlaces(
  rawRegionId: string,
  pagination: Pagination,
): Promise<ListPage<AffiliatedPlaceItem>> {
  const { container, actor } = await actorAndContainer();
  const page = await listAffiliatedPlaces({
    container,
    actor,
    input: { regionId: regionIdOf(rawRegionId), pagination },
  });
  return {
    count: page.count,
    items: page.items.map((place) => ({
      placeId: place.placeId,
      name: place.name,
      operatingStatus: place.operatingStatus,
      suspended: place.suspended,
    })),
  };
}

const APPLICATION_SHORT_TITLE: Readonly<Record<string, string>> = {
  affiliation: "所属",
  leave: "離脱",
};

function applicantLine(applicant: ApplicantView): string {
  return applicant.kind === "individual"
    ? `個人（${applicant.email ?? "退会した利用者"}）`
    : (applicant.name ?? "店舗");
}

function applicationItem(summary: ApplicationSummary): RegionApplicationItem {
  const place = summary.subjects.find(
    (subject) => subject.ref.kind === "place",
  );
  const { status } = summary;
  const overdue = "reviewAs" in status && status.reviewAs === "overdue_proxy";
  return {
    applicationId: summary.id,
    title: `${APPLICATION_SHORT_TITLE[summary.kind] ?? APPLICATION_KIND_TITLE[summary.kind]} · ${
      place === undefined ? subjectTitle(summary.subjects) : subjectName(place)
    }`,
    meta: [
      `申請者 ${applicantLine(summary.applicant)}`,
      monthDayText(summary.submittedAt.toISOString()),
      ...(overdue ? ["サービス運営者が期間超過の代行で判断"] : []),
    ].join(" · "),
    status: status.kind,
    statusLabel: STATUS_LABEL[status.kind],
    tone: STATUS_TONE[status.kind],
  };
}

async function readApplications(rawRegionId: string, pagination: Pagination) {
  const { container, actor } = await actorAndContainer();
  const page = await listApplicationsForSubject({
    container,
    actor,
    input: {
      subject: { kind: "region", id: regionIdOf(rawRegionId) },
      pagination,
    },
  });
  return {
    items: page.items.map(applicationItem),
    count: page.count,
    underReview: page.underReviewCount ?? 0,
  };
}

/** RM-01: a page of the affiliation / leave applications, active ones first. */
export async function loadRegionApplications(
  rawRegionId: string,
  pagination: Pagination,
): Promise<ListPage<RegionApplicationItem>> {
  const { items, count } = await readApplications(rawRegionId, pagination);
  return { items, count };
}

/** RM-01: the affiliated places and the affiliation / leave applications. */
export async function loadAffiliations(
  rawRegionId: string,
): Promise<AffiliationsData> {
  const { regionId } = await managedRegion(rawRegionId);
  const [places, applications] = await Promise.all([
    loadAffiliatedPlaces(regionId, FIRST_PAGE),
    readApplications(regionId, FIRST_PAGE),
  ]);
  return { regionId, places, applications };
}

/** RM-01: excludes an affiliated place (REG-10). */
export async function excludePlace(
  rawRegionId: string,
  rawPlaceId: string,
): Promise<void> {
  const { container, actor } = await actorAndContainer();
  await excludeAffiliatedPlace({
    container,
    actor,
    input: {
      regionId: regionIdOf(rawRegionId),
      placeId: placeIdOf(rawPlaceId),
    },
  });
}

/** RM-02 (編集). */
export async function loadRegionEditor(
  rawRegionId: string,
): Promise<RegionEditorData> {
  const { container, actor, regionId, view } = await managedRegion(rawRegionId);
  const { content } = view.region;
  const [town, members] = await Promise.all([
    content.address === null ? null : townOfAddress(container, content.address),
    viewMembers({
      container,
      actor,
      input: { target: { kind: "region", id: regionId } },
    }),
  ]);
  return {
    regionId,
    version: view.region.version,
    name: content.name ?? "",
    tagline: content.tagline ?? "",
    description: content.description ?? "",
    photos: view.photos.map((photo) => ({
      photoId: photo.photoId,
      url: photo.displayRef.url,
    })),
    photosTakenDown: view.photosTakenDown,
    town,
    addressRest: content.address?.rest ?? "",
    location:
      content.location === null
        ? null
        : {
            latitude: content.location.latitude,
            longitude: content.location.longitude,
          },
    publication: publicationView(view.region.publication),
    suspended: view.suspended,
    viewable: view.viewable,
    missing: view.missingRequirements,
    stewardCount: members.stewards.length,
    areaLists: await loadAreaLists(container, town),
  };
}

/** RM-02 新規: only the prefectures to start the address from. */
export async function loadNewRegionLists(): Promise<AreaLists> {
  return loadAreaLists(await getContainer(), null);
}

/** RM-03: a page of the linked occasions, newest link first. */
export async function loadRegionLinks(
  rawRegionId: string,
  pagination: Pagination,
): Promise<ListPage<RegionLinkItem>> {
  const { container, actor } = await actorAndContainer();
  const page = await listRegionOccasionLinks({
    container,
    actor,
    input: { regionId: regionIdOf(rawRegionId), pagination },
  });
  return {
    count: page.count,
    items: page.items.map(({ status, linkedAt, occasion }) => ({
      occasionId: occasion.id,
      name: occasion.name,
      status,
      linkedAt: linkedAt.toISOString(),
      period:
        occasion.period === null
          ? null
          : { start: occasion.period.start, end: occasion.period.end },
      publication: publicationView(occasion.publication),
      suspended: occasion.suspended,
      holdingStatus: occasion.holdingStatus,
      viewable:
        occasion.publication.status === "published" && !occasion.suspended,
    })),
  };
}

/** RM-03's first page, after the management check. */
export async function loadRegionLinksFirst(
  rawRegionId: string,
): Promise<ListPage<RegionLinkItem>> {
  const { regionId } = await managedRegion(rawRegionId);
  return loadRegionLinks(regionId, FIRST_PAGE);
}

/** RM-03: detaches an occasion's link, or revokes the detach (REG-11). */
export async function changeRegionLink(
  rawRegionId: string,
  rawOccasionId: string,
  change: RegionLinkChange,
): Promise<void> {
  const { container, actor } = await actorAndContainer();
  const input = {
    regionId: regionIdOf(rawRegionId),
    occasionId: occasionIdOf(rawOccasionId),
  };
  if (change === "detach") {
    await detachRegionLink({ container, actor, input });
  } else {
    await restoreRegionLink({ container, actor, input });
  }
}
