import { AccessPolicy } from "@repo/core/domain/authority/accessPolicy";
import type { Address } from "@repo/core/domain/common/address";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type {
  ListingId,
  PhotoId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { Publication } from "@repo/core/domain/common/publication";
import type { Version } from "@repo/core/domain/common/version";
import {
  type ActiveCategory,
  CategoryCatalog,
} from "@repo/core/domain/listing/categoryCatalog";
import { Listing } from "@repo/core/domain/listing/listing";
import type {
  Offering,
  OfferingStatus,
} from "@repo/core/domain/listing/offering";
import type {
  Framing,
  ListingDescription,
  ListingName,
  ListingPhoto,
} from "@repo/core/domain/listing/values";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import { Place } from "@repo/core/domain/place/place";
import type { PlaceName } from "@repo/core/domain/place/profile";
import type { TargetAccess } from "../authority/access";
import type { RequestContainer } from "../di/types";
import { NotFoundError, SystemError, SystemErrorCode } from "../errors";
import type { UnitOfWorkContext } from "../execution/unitOfWork";

/** An active category as listings show it (`CategoryCatalog.resolve`). */
export type CategoryView = Readonly<{ id: ActiveCategory["id"]; name: string }>;

/** A listing photo with the ref screens fetch it by. */
export type ListingPhotoView = Readonly<{
  photoId: PhotoId;
  framing: Framing | null;
  display: PhotoDisplayRef | null;
}>;

/** A region the place belongs to (empty until Region's stage). */
export type AffiliatedRegionView = Readonly<{ id: RegionId; name: string }>;

export type ListingPlaceView = Readonly<{
  id: PlaceId;
  name: PlaceName;
  address: Address;
  /** Suspended places hide their listings from viewers (SM-04). */
  suspended: boolean;
  /** Regions the place belongs to, in affiliation order. */
  regions: readonly AffiliatedRegionView[];
}>;

/**
 * One listing as the management screens show it (`getManagedListing` and
 * every usecase that answers with the same shape). The category is
 * resolved to an active one; the offering status is today's.
 */
export type ManagedListingView = Readonly<{
  id: ListingId;
  /** The version an edit (`updateListing`) starts from. */
  version: Version;
  updatedAt: Date;
  name: ListingName | null;
  description: ListingDescription | null;
  category: CategoryView | null;
  photos: readonly ListingPhotoView[];
  /** A takedown claim removed photos since the photos were last changed. */
  photosTakenDown: boolean;
  offering: Offering;
  publication: Publication;
  suspended: boolean;
  offeringStatus: OfferingStatus;
  place: ListingPlaceView;
  /** Whether the place has a steward, and whether the actor may manage this listing. */
  access: Readonly<{ hasSteward: boolean; manageable: boolean }>;
}>;

/** One row of a management list. */
export type ListingRowView = Readonly<{
  id: ListingId;
  placeId: PlaceId;
  name: ListingName | null;
  cover: ListingPhotoView | null;
  category: CategoryView | null;
  publication: Publication;
  suspended: boolean;
  offeringStatus: OfferingStatus;
  updatedAt: Date;
}>;

/** What a managed listing's view is built from, read inside the unit of work. */
export type ManagedListingRead = Readonly<{
  listing: Listing;
  catalog: CategoryCatalog;
  place: Place;
  access: TargetAccess;
}>;

type ReadContext = Pick<
  UnitOfWorkContext,
  "categoryCatalogRepository" | "placeRepository"
>;

/** The place of a listing, which always exists (places are never deleted). */
export async function requireListingPlace(
  ctx: Pick<UnitOfWorkContext, "placeRepository">,
  placeId: PlaceId,
): Promise<Place> {
  const found = await ctx.placeRepository.findById(placeId);
  if (found === null) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `The place ${placeId} of a listing does not exist`,
    );
  }
  return found.entity;
}

/** The catalog and the place a managed listing's view needs. */
export async function readViewContext(
  ctx: ReadContext,
  placeId: PlaceId,
): Promise<Readonly<{ catalog: CategoryCatalog; place: Place }>> {
  const [catalog, place] = await Promise.all([
    ctx.categoryCatalogRepository.find(),
    requireListingPlace(ctx, placeId),
  ]);
  return { catalog: catalog.entity, place };
}

/** `NotFoundError` unless the listing exists. */
export async function requireListing(
  ctx: Pick<UnitOfWorkContext, "listingRepository">,
  listingId: ListingId,
) {
  const found = await ctx.listingRepository.findById(listingId);
  if (found === null) {
    throw new NotFoundError("LISTING_NOT_FOUND", "The listing does not exist");
  }
  return found;
}

/**
 * Display refs for `photoIds`, asked 100 at a time (`PhotoStorage`'s
 * limit). Called outside any unit of work.
 */
export async function displayRefsOf(
  container: RequestContainer,
  photoIds: readonly PhotoId[],
): Promise<ReadonlyMap<PhotoId, PhotoDisplayRef>> {
  const unique = [...new Set(photoIds)];
  const refs = new Map<PhotoId, PhotoDisplayRef>();
  for (let start = 0; start < unique.length; start += IdBatch.maxSize) {
    const batch = await container.photoStorage.displayRefs(
      unique.slice(start, start + IdBatch.maxSize),
    );
    for (const [id, ref] of batch) refs.set(id, ref);
  }
  return refs;
}

export const categoryView = (
  catalog: CategoryCatalog,
  listing: Listing,
): CategoryView | null => {
  const category = CategoryCatalog.resolveOrNull(
    catalog,
    listing.content.categoryId,
  );
  return category === null ? null : { id: category.id, name: category.name };
};

export const photoView = (
  photo: ListingPhoto,
  refs: ReadonlyMap<PhotoId, PhotoDisplayRef>,
): ListingPhotoView => ({
  photoId: photo.photoId,
  framing: photo.framing,
  display: refs.get(photo.photoId) ?? null,
});

/** Whether the place has a steward and whether the actor may manage its listings. */
export const accessView = (
  access: TargetAccess,
): ManagedListingView["access"] => ({
  hasSteward: access.stewardship.status === "stewarded",
  manageable: AccessPolicy.decide(access.authority, {
    kind: "manage_target",
    standing: access.standing,
  }).allowed,
});

export const placeView = (place: Place): ListingPlaceView => ({
  id: place.id,
  name: place.profile.name,
  address: place.profile.address,
  suspended: Place.isSuspended(place),
  // Region affiliations land with Region (stage 3); until then none
  // (`spec/domains/index.md` 「開発の順序との対応」).
  regions: [],
});

/**
 * Builds the managed view of `read.listing` (「管理する掲載の読み取りの組み
 * 立て」): resolves the category, derives today's offering status and asks
 * `PhotoStorage` for display refs — outside the unit of work.
 */
export async function presentManagedListing(
  container: RequestContainer,
  read: ManagedListingRead,
): Promise<ManagedListingView> {
  const { listing, catalog, place, access } = read;
  const refs = await displayRefsOf(
    container,
    listing.content.photos.items.map((photo) => photo.photoId),
  );
  const today = LocalDate.fromInstant(container.clock.now());
  return {
    id: listing.id,
    version: listing.version,
    updatedAt: listing.updatedAt,
    name: listing.content.name,
    description: listing.content.description,
    category: categoryView(catalog, listing),
    photos: listing.content.photos.items.map((photo) => photoView(photo, refs)),
    photosTakenDown: listing.content.photos.takenDown,
    offering: listing.content.offering,
    publication: listing.publication,
    suspended: listing.suspension.suspended,
    offeringStatus: Listing.offeringStatus(listing, today),
    place: placeView(place),
    access: accessView(access),
  };
}

/** The first photo of each listing, the cover a list shows. */
export const coverIds = (listings: readonly Listing[]): readonly PhotoId[] =>
  listings.flatMap((listing) => {
    const [cover] = listing.content.photos.items;
    return cover === undefined ? [] : [cover.photoId];
  });

export function listingRow(
  listing: Listing,
  catalog: CategoryCatalog,
  refs: ReadonlyMap<PhotoId, PhotoDisplayRef>,
  today: LocalDate,
): ListingRowView {
  const [cover] = listing.content.photos.items;
  return {
    id: listing.id,
    placeId: listing.placeId,
    name: listing.content.name,
    cover: cover === undefined ? null : photoView(cover, refs),
    category: categoryView(catalog, listing),
    publication: listing.publication,
    suspended: listing.suspension.suspended,
    offeringStatus: Listing.offeringStatus(listing, today),
    updatedAt: listing.updatedAt,
  };
}
