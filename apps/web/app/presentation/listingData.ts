// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { getContainer } from "@repo/core/application/di/containerStore";
import { NotFoundError } from "@repo/core/application/errors";
import { getManagedListing } from "@repo/core/application/listing/getManagedListing";
import { listCategories } from "@repo/core/application/listing/listCategories";
import { listPlaceListings } from "@repo/core/application/listing/listPlaceListings";
import type {
  ListingPhotoView,
  ManagedListingView,
} from "@repo/core/application/listing/managedListing";
import { previewListing } from "@repo/core/application/listing/previewListing";
import { getManagedPlace } from "@repo/core/application/place/getManagedPlace";
import { Address } from "@repo/core/domain/common/address";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { Publication } from "@repo/core/domain/common/publication";
import type { ListingShelf } from "@repo/core/domain/listing/listing";
import { requireActor } from "./actor";
import { toListingPreviewViews } from "./detailView";
import type {
  CategoryOption,
  ListingEditorData,
  ListingPhotoItem,
  ListingPreviewData,
  ListingRowsPage,
  ListingShelfCountsView,
  ListingShelfKey,
  PublicationView,
} from "./listingView";
import { requireManagement } from "./shopData";
import { listingIdOf, placeIdOf } from "./targetIds";

const SHELVES: Readonly<Record<ListingShelfKey, ListingShelf>> = {
  published: { publication: "published", phase: null },
  draft: { publication: "draft", phase: null },
  hidden: { publication: "hidden", phase: null },
  ended: { publication: null, phase: "ended" },
};

export const publicationView = (publication: Publication): PublicationView => ({
  status: publication.status,
  reason: publication.status === "unpublished" ? publication.reason : null,
});

export const listingPhotoItem = (
  photo: ListingPhotoView,
): ListingPhotoItem => ({
  photoId: photo.photoId,
  url: photo.display?.url ?? null,
  framing: photo.framing,
});

async function actorAndContainer() {
  const container = await getContainer();
  return { container, actor: await requireActor(container) };
}

/** SM-03: one page of a store's listings in a 区分, with every 区分's count. */
export async function loadListingRows(
  rawPlaceId: string,
  shelf: ListingShelfKey | null,
  pagination: Pagination,
): Promise<
  Readonly<{ rows: ListingRowsPage; counts: ListingShelfCountsView }>
> {
  const { container, actor } = await actorAndContainer();
  const placeId = placeIdOf(rawPlaceId);
  const view = await listPlaceListings({
    container,
    actor,
    input: {
      placeId,
      shelf:
        shelf === null ? { publication: null, phase: null } : SHELVES[shelf],
      pagination,
    },
  });
  const { publication, phase } = view.counts;
  return {
    rows: {
      count: view.count,
      items: view.items.map((row) => ({
        id: row.id,
        name: row.name,
        cover: row.cover === null ? null : listingPhotoItem(row.cover),
        category: row.category?.name ?? null,
        publication: publicationView(row.publication),
        suspended: row.suspended,
        offeringStatus: row.offeringStatus,
      })),
    },
    counts: {
      all: publication.published + publication.draft + publication.hidden,
      published: publication.published,
      draft: publication.draft,
      hidden: publication.hidden,
      ended: phase.ended,
    },
  };
}

/** The active categories, in creation order. */
export async function loadCategoryOptions(): Promise<
  readonly CategoryOption[]
> {
  const categories = await listCategories({ container: await getContainer() });
  return categories.map(({ id, name }) => ({ id, name }));
}

/** The names of the store's regions, first affiliation first. */
const regionNames = (
  regions: readonly Readonly<{ name: string | null }>[],
): readonly string[] =>
  regions.map((region) => region.name ?? "名称未設定の地域");

/** SM-04 (新規): the categories and the store the listing will belong to. */
export async function loadNewListing(rawPlaceId: string): Promise<
  Readonly<{
    categories: readonly CategoryOption[];
    place: Readonly<{
      id: string;
      name: string;
      address: string;
      regions: readonly string[];
    }>;
  }>
> {
  const { container, actor } = await actorAndContainer();
  const [view, categories] = await Promise.all([
    getManagedPlace({
      container,
      actor,
      input: { placeId: placeIdOf(rawPlaceId) },
    }),
    loadCategoryOptions(),
  ]);
  requireManagement(view.management.allowed);
  return {
    categories,
    place: {
      id: view.place.id,
      name: view.place.profile.name,
      address: Address.text(view.place.profile.address),
      regions: regionNames(view.regions),
    },
  };
}

function editorData(view: ManagedListingView): ListingEditorData {
  return {
    id: view.id,
    version: view.version,
    name: view.name ?? "",
    description: view.description ?? "",
    categoryId: view.category?.id ?? null,
    photos: view.photos.map(listingPhotoItem),
    photosTakenDown: view.photosTakenDown,
    offering: view.offering,
    publication: publicationView(view.publication),
    suspended: view.suspended,
    offeringStatus: view.offeringStatus,
    place: {
      id: view.place.id,
      name: view.place.name,
      address: Address.text(view.place.address),
      suspended: view.place.suspended,
      regions: regionNames(view.place.regions),
    },
  };
}

/**
 * The listing of `rawListingId`, which must belong to the store the URL
 * names — another store's listing reads as missing (CS-17).
 */
async function managedListingOf(
  rawPlaceId: string,
  rawListingId: string,
): Promise<ManagedListingView> {
  const { container, actor } = await actorAndContainer();
  const view = await getManagedListing({
    container,
    actor,
    input: { listingId: listingIdOf(rawListingId) },
  });
  if (view.place.id !== placeIdOf(rawPlaceId)) {
    throw new NotFoundError(
      "LISTING_NOT_FOUND",
      "The listing belongs to another store",
    );
  }
  requireManagement(view.access.manageable);
  return view;
}

/** SM-04 (編集). */
export async function loadListingEditor(
  rawPlaceId: string,
  rawListingId: string,
): Promise<ListingEditorData> {
  return editorData(await managedListingOf(rawPlaceId, rawListingId));
}

/** SM-04 after a duplication: the source's name, if it is still there. */
export async function loadListingName(
  rawPlaceId: string,
  rawListingId: string,
): Promise<string | null> {
  try {
    return (await managedListingOf(rawPlaceId, rawListingId)).name;
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/** CM-03: the stored content shaped as viewers would see it. */
export async function loadListingPreview(
  rawPlaceId: string,
  rawListingId: string,
): Promise<ListingPreviewData> {
  const { container, actor } = await actorAndContainer();
  const listingId = listingIdOf(rawListingId);
  const view = await previewListing({ container, actor, input: { listingId } });
  const { detail, summary } = view.preview;
  if (detail.place.placeId !== placeIdOf(rawPlaceId)) {
    throw new NotFoundError(
      "LISTING_NOT_FOUND",
      "The listing belongs to another store",
    );
  }
  const { hero, card } = toListingPreviewViews(
    listingId,
    view.preview,
    view.category?.name ?? null,
    view.photoRefs,
    LocalDate.fromInstant(container.clock.now()),
  );
  return {
    id: listingId,
    name: detail.name,
    hero,
    card,
    placeName: summary.placeName,
    publication: publicationView(view.publication),
    suspended: view.suspended,
    placeSuspended: view.placeSuspended,
  };
}
