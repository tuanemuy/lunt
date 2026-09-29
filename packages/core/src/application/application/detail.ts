import type {
  Application,
  ApplicationKind,
  ApplicationOf,
} from "@repo/core/domain/application/application";
import type { ClaimText } from "@repo/core/domain/application/stewardshipClaim";
import {
  type PlaceRef,
  Stewardship,
} from "@repo/core/domain/authority/stewardship";
import type { Address } from "@repo/core/domain/common/address";
import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import type { GeoPoint } from "@repo/core/domain/common/geo";
import type {
  ApplicationId,
  CategoryId,
  ListingId,
  OccasionId,
  PhotoId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { PhotoItem, PhotoSet } from "@repo/core/domain/common/photoSet";
import type { PhotoOrigin } from "@repo/core/domain/common/revisedPhotos";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import type { ListingContent } from "@repo/core/domain/listing/content";
import type { Listing } from "@repo/core/domain/listing/listing";
import type { Offering } from "@repo/core/domain/listing/offering";
import { ListingPatch } from "@repo/core/domain/listing/patch";
import type {
  Framing,
  ListingDescription,
  ListingName,
  ListingPhoto,
} from "@repo/core/domain/listing/values";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import type { Place } from "@repo/core/domain/place/place";
import type {
  BusinessHours,
  ContactInfo,
  PlaceDescription,
  PlaceName,
  PlacePhoto,
  PlaceProfile,
} from "@repo/core/domain/place/profile";
import {
  PlaceRevision,
  type PlaceState,
} from "@repo/core/domain/place/revision";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import type { CategoryView } from "../listing/managedListing";
import {
  type AttachedListingView,
  attachedListingViews,
  readListings,
} from "../occasion/attachedListings";
import { readCompanion } from "./companion";

// --- Views ------------------------------------------------------------------

/** A photo with the ref screens fetch it by (`PhotoStorage.displayRefs`). */
export type PhotoView = Readonly<{
  photoId: PhotoId;
  display: PhotoDisplayRef | null;
}>;

/** A listing photo: its framing too (`null` shows the whole photo). */
export type ListingPhotoView = PhotoView &
  Readonly<{ framing: Framing | null }>;

/**
 * A photo of a revision's photo item: whether the target had it at
 * submission (`current`) or the application brings it (`added`).
 */
export type Revised<V> = V & Readonly<{ origin: PhotoOrigin }>;

export type PlaceProfileView = Readonly<{
  name: PlaceName;
  /** In order; the first is the cover. */
  photos: readonly PhotoView[];
  description: PlaceDescription | null;
  address: Address;
  location: GeoPoint;
  businessHours: BusinessHours | null;
  contact: ContactInfo | null;
}>;

export type PlaceStateView = Readonly<{
  profile: PlaceProfileView;
  operatingStatus: OperatingStatus;
}>;

/** A listing's content; the category resolved to an active one. */
export type ListingContentView = Readonly<{
  name: ListingName | null;
  description: ListingDescription | null;
  category: CategoryView | null;
  photos: readonly ListingPhotoView[];
  offering: Offering;
}>;

type PlaceFieldValues = {
  name: PlaceName;
  photos: readonly PhotoView[];
  description: PlaceDescription | null;
  address: Address;
  location: GeoPoint;
  businessHours: BusinessHours | null;
  contact: ContactInfo | null;
  operatingStatus: OperatingStatus;
};

type PlaceProposals = Omit<PlaceFieldValues, "photos"> & {
  photos: readonly Revised<PhotoView>[];
};

/**
 * One item a place revision changes (`FieldPatch.compare`): the place's
 * value when read, and the application's.
 */
export type PlaceChangeView = {
  [F in keyof PlaceFieldValues]: Readonly<{
    field: F;
    current: PlaceFieldValues[F];
    proposed: PlaceProposals[F];
  }>;
}[keyof PlaceFieldValues];

type ListingFieldValues = {
  name: ListingName | null;
  description: ListingDescription | null;
  category: CategoryView | null;
  photos: readonly ListingPhotoView[];
  offering: Offering;
};

type ListingProposals = {
  name: ListingName;
  description: ListingDescription | null;
  category: CategoryView | null;
  photos: readonly Revised<ListingPhotoView>[];
  offering: Offering;
};

/** One item a listing revision changes, compared with the listing as read. */
export type ListingChangeView = {
  [F in keyof ListingFieldValues]: Readonly<{
    field: F;
    current: ListingFieldValues[F];
    proposed: ListingProposals[F];
  }>;
}[keyof ListingFieldValues];

/**
 * One item of a listing revision whose listing is gone: the proposed
 * value alone. The photo item keeps only the application's own photos
 * (the listing's went with it).
 */
export type ListingProposalView = {
  [F in keyof ListingProposals]: Readonly<{
    field: F;
    proposed: ListingProposals[F];
  }>;
}[keyof ListingProposals];

/**
 * A listing revision against the listing as read: the changed items side
 * by side and the listing with them laid on (`FieldPatch.preview` — what
 * approval would apply, photos removed since submission left out); or,
 * when the listing was deleted, only the proposed values.
 */
export type ListingRevisionView =
  | Readonly<{
      listing: "present";
      changes: readonly ListingChangeView[];
      preview: ListingContentView;
    }>
  | Readonly<{ listing: "deleted"; proposals: readonly ListingProposalView[] }>;

/**
 * What an application asks for, per kind, as MY-05 and CM-01 show it —
 * closed applications included, photos included. Revisions show only
 * their changed items against the target read now, and the target with
 * them laid on.
 */
export type ApplicationContentView =
  | Readonly<{
      kind: "registration";
      reservedPlaceId: PlaceId;
      profile: PlaceProfileView;
    }>
  | Readonly<{
      kind: "revision";
      placeId: PlaceId;
      changes: readonly PlaceChangeView[];
      preview: PlaceStateView;
    }>
  | Readonly<{
      kind: "stewardship";
      placeId: PlaceId;
      /** 店舗との関係. */
      relationship: ClaimText;
      /** 確認に使える連絡先または資料. */
      evidence: ClaimText;
    }>
  | Readonly<{
      kind: "listing";
      placeId: PlaceId;
      reservedListingId: ListingId;
      content: ListingContentView;
    }>
  | Readonly<{
      kind: "listingRevision";
      listingId: ListingId;
      placeId: PlaceId;
      revision: ListingRevisionView;
    }>
  | Readonly<{
      kind: "affiliation" | "leave";
      placeId: PlaceId;
      regionId: RegionId;
    }>
  | Readonly<{
      kind: "participation";
      placeId: PlaceId;
      occasionId: OccasionId;
      /**
       * Every attached listing in the application's order with its state
       * read now — one no longer attachable, or deleted, stays listed.
       */
      listings: readonly AttachedListingView[];
      /** 参加日, ascending. */
      dates: readonly LocalDate[];
    }>;

// --- Reading ----------------------------------------------------------------

/** An application paired with its kind, so a switch narrows both. */
export type KindCase = {
  [K in ApplicationKind]: Readonly<{ kind: K; app: ApplicationOf<K> }>;
}[ApplicationKind];

export const kindCase = (app: Application): KindCase =>
  // The pair is built from the application's own kind.
  ({ kind: app.target.kind, app }) as KindCase;

/**
 * What an application's content view is built from, read inside the
 * reader's unit of work: the target a revision compares with (`null` when
 * gone), the category catalog listings resolve through, a registration's
 * companion claim, a claim's place stewardship.
 */
export type ContentSource =
  | Readonly<{
      kind: "registration";
      app: ApplicationOf<"registration">;
      companion: Application | null;
    }>
  | Readonly<{
      kind: "revision";
      app: ApplicationOf<"revision">;
      place: Place | null;
    }>
  | Readonly<{
      kind: "stewardship";
      app: ApplicationOf<"stewardship">;
      stewardship: Stewardship;
    }>
  | Readonly<{
      kind: "listing";
      app: ApplicationOf<"listing">;
      catalog: CategoryCatalog;
    }>
  | Readonly<{
      kind: "listingRevision";
      app: ApplicationOf<"listingRevision">;
      listing: Listing | null;
      place: Place | null;
      catalog: CategoryCatalog;
    }>
  | Readonly<{ kind: "affiliation"; app: ApplicationOf<"affiliation"> }>
  | Readonly<{ kind: "leave"; app: ApplicationOf<"leave"> }>
  | Readonly<{
      kind: "participation";
      app: ApplicationOf<"participation">;
      listings: readonly AttachedListingView[];
    }>;

type SourceContext = Pick<
  UnitOfWorkContext,
  | "applicationRepository"
  | "placeRepository"
  | "listingRepository"
  | "categoryCatalogRepository"
  | "stewardshipRepository"
>;

/** `today` dates an attached listing's offering status. */
export async function readContentSource(
  ctx: SourceContext,
  app: Application,
  today: LocalDate,
): Promise<ContentSource> {
  const c = kindCase(app);
  switch (c.kind) {
    case "registration":
      return { ...c, companion: await readCompanion(ctx, c.app.id) };
    case "revision": {
      const place = await ctx.placeRepository.findById(c.app.target.placeId);
      return { ...c, place: place?.entity ?? null };
    }
    case "stewardship": {
      const ref: PlaceRef = { kind: "place", id: c.app.target.placeId };
      const found = await ctx.stewardshipRepository.findById(ref);
      return {
        ...c,
        stewardship: Stewardship.orVacant(found?.entity ?? null, ref),
      };
    }
    case "listing": {
      const catalog = await ctx.categoryCatalogRepository.find();
      return { ...c, catalog: catalog.entity };
    }
    case "listingRevision": {
      const [listing, place, catalog] = await Promise.all([
        ctx.listingRepository.findById(c.app.target.listingId),
        ctx.placeRepository.findById(c.app.placeId),
        ctx.categoryCatalogRepository.find(),
      ]);
      return {
        ...c,
        listing: listing?.entity ?? null,
        place: place?.entity ?? null,
        catalog: catalog.entity,
      };
    }
    case "affiliation":
    case "leave":
      return c;
    case "participation":
      return {
        ...c,
        listings: await readAttachedListings(ctx, c.app, today),
      };
  }
}

/**
 * A participation application's attached listings as read now
 * (「添えた掲載」: all of them, deleted ones as deleted), their viewability
 * judged with the applying place.
 */
export async function readAttachedListings(
  ctx: Pick<SourceContext, "listingRepository" | "placeRepository">,
  app: ApplicationOf<"participation">,
  today: LocalDate,
): Promise<readonly AttachedListingView[]> {
  const { listingIds } = app.content;
  if (listingIds.length === 0) return [];
  const [listings, place] = await Promise.all([
    readListings(ctx, listingIds),
    ctx.placeRepository.findById(app.target.placeId),
  ]);
  return attachedListingViews(
    listingIds,
    listings,
    place?.entity ?? null,
    today,
  );
}

/** A registration's companion claim as read; `null` for other kinds. */
export const companionOf = (source: ContentSource): Application | null =>
  source.kind === "registration" ? source.companion : null;

// --- Building ---------------------------------------------------------------

const ids = <P extends PhotoItem>(photos: readonly P[]): readonly PhotoId[] =>
  photos.map((photo) => photo.photoId);

/** Every photo id the content view of `source` shows. */
export function photoIdsOf(source: ContentSource): readonly PhotoId[] {
  switch (source.kind) {
    case "registration":
      return ids(source.app.content.photos.items);
    case "revision": {
      const proposed = FieldPatch.valueOf(source.app.content, "photos") ?? [];
      return [
        ...ids(proposed),
        ...(source.place === null
          ? []
          : ids(source.place.profile.photos.items)),
      ];
    }
    case "stewardship":
    case "affiliation":
    case "leave":
    case "participation":
      return [];
    case "listing":
      return ids(source.app.content.photos.items);
    case "listingRevision": {
      const proposed = FieldPatch.valueOf(source.app.content, "photos") ?? [];
      return [
        ...ids(proposed),
        ...(source.listing === null
          ? []
          : ids(source.listing.content.photos.items)),
      ];
    }
  }
}

type Refs = ReadonlyMap<PhotoId, PhotoDisplayRef>;

const photoView = (refs: Refs, photo: PhotoItem): PhotoView => ({
  photoId: photo.photoId,
  display: refs.get(photo.photoId) ?? null,
});

const listingPhotoView = (
  refs: Refs,
  photo: ListingPhoto,
): ListingPhotoView => ({ ...photoView(refs, photo), framing: photo.framing });

const placePhotos = (
  refs: Refs,
  photos: PhotoSet<PlacePhoto>,
): readonly PhotoView[] => photos.items.map((p) => photoView(refs, p));

function profileView(refs: Refs, profile: PlaceProfile): PlaceProfileView {
  return {
    name: profile.name,
    photos: placePhotos(refs, profile.photos),
    description: profile.description,
    address: profile.address,
    location: profile.location,
    businessHours: profile.visitInfo.businessHours,
    contact: profile.visitInfo.contact,
  };
}

const stateView = (refs: Refs, state: PlaceState): PlaceStateView => ({
  profile: profileView(refs, state.profile),
  operatingStatus: state.operatingStatus,
});

function categoryOf(
  catalog: CategoryCatalog,
  id: CategoryId | null,
): CategoryView | null {
  const category = CategoryCatalog.resolveOrNull(catalog, id);
  return category === null ? null : { id: category.id, name: category.name };
}

function listingContentView(
  refs: Refs,
  catalog: CategoryCatalog,
  content: ListingContent,
): ListingContentView {
  return {
    name: content.name,
    description: content.description,
    category: categoryOf(catalog, content.categoryId),
    photos: content.photos.items.map((p) => listingPhotoView(refs, p)),
    offering: content.offering,
  };
}

function placeChanges(
  refs: Refs,
  place: Place,
  app: ApplicationOf<"revision">,
): readonly PlaceChangeView[] {
  return FieldPatch.compare(PlaceRevision.schema, place, app.content).map(
    (change): PlaceChangeView => {
      switch (change.field) {
        case "photos":
          return {
            field: "photos",
            current: placePhotos(refs, change.current),
            proposed: change.proposed.map((photo) => ({
              ...photoView(refs, photo),
              origin: photo.origin,
            })),
          };
        default:
          return change;
      }
    },
  );
}

function listingProposal(
  refs: Refs,
  catalog: CategoryCatalog,
  change: ListingPatch[number],
): ListingProposalView {
  switch (change.field) {
    case "categoryId":
      return {
        field: "category",
        proposed: categoryOf(catalog, change.value),
      };
    case "photos":
      return {
        field: "photos",
        proposed: change.value.map((photo) => ({
          ...listingPhotoView(refs, photo),
          origin: photo.origin,
        })),
      };
    case "name":
      return { field: "name", proposed: change.value };
    case "description":
      return { field: "description", proposed: change.value };
    case "offering":
      return { field: "offering", proposed: change.value };
  }
}

/** A proposed listing item beside the listing's value when read. */
function withCurrent(
  refs: Refs,
  catalog: CategoryCatalog,
  current: ListingContent,
  proposal: ListingProposalView,
): ListingChangeView {
  switch (proposal.field) {
    case "name":
      return { ...proposal, current: current.name };
    case "description":
      return { ...proposal, current: current.description };
    case "category":
      return { ...proposal, current: categoryOf(catalog, current.categoryId) };
    case "photos":
      return {
        ...proposal,
        current: current.photos.items.map((p) => listingPhotoView(refs, p)),
      };
    case "offering":
      return { ...proposal, current: current.offering };
  }
}

function listingRevisionView(
  refs: Refs,
  source: Extract<ContentSource, { kind: "listingRevision" }>,
): ListingRevisionView {
  const { app, listing, catalog } = source;
  if (listing === null) {
    return {
      listing: "deleted",
      proposals: app.content.flatMap((change): ListingProposalView[] => {
        if (change.field !== "photos") {
          return [listingProposal(refs, catalog, change)];
        }
        const added = change.value.filter((photo) => photo.origin === "added");
        return added.length === 0
          ? []
          : [
              listingProposal(refs, catalog, {
                field: "photos",
                value: added,
              }),
            ];
      }),
    };
  }
  const current = listing.content;
  return {
    listing: "present",
    changes: app.content.map((change) =>
      withCurrent(
        refs,
        catalog,
        current,
        listingProposal(refs, catalog, change),
      ),
    ),
    preview: listingContentView(
      refs,
      catalog,
      FieldPatch.preview(ListingPatch.schema, current, app.content),
    ),
  };
}

/** The content view of `source`, with the display refs of `photoIdsOf(source)`. */
export function contentView(
  source: ContentSource,
  refs: Refs,
): ApplicationContentView {
  switch (source.kind) {
    case "registration":
      return {
        kind: "registration",
        reservedPlaceId: source.app.reservedPlaceId,
        profile: profileView(refs, source.app.content),
      };
    case "revision": {
      const { app, place } = source;
      if (place === null) {
        throw new Error(
          `The place ${app.target.placeId} of a revision is gone`,
        );
      }
      return {
        kind: "revision",
        placeId: app.target.placeId,
        changes: placeChanges(refs, place, app),
        preview: stateView(refs, PlaceRevision.preview(place, app.content)),
      };
    }
    case "stewardship":
      return {
        kind: "stewardship",
        placeId: source.app.target.placeId,
        relationship: source.app.content.relationship,
        evidence: source.app.content.evidence,
      };
    case "listing":
      return {
        kind: "listing",
        placeId: source.app.target.placeId,
        reservedListingId: source.app.reservedListingId,
        content: listingContentView(refs, source.catalog, source.app.content),
      };
    case "listingRevision":
      return {
        kind: "listingRevision",
        listingId: source.app.target.listingId,
        placeId: source.app.placeId,
        revision: listingRevisionView(refs, source),
      };
    case "affiliation":
    case "leave":
      return {
        kind: source.kind,
        placeId: source.app.target.placeId,
        regionId: source.app.target.regionId,
      };
    case "participation":
      return {
        kind: "participation",
        placeId: source.app.target.placeId,
        occasionId: source.app.target.occasionId,
        listings: source.listings,
        dates: source.app.content.dates,
      };
  }
}

/** The registration id a companion claim refers to; `null` for other applications. */
export const registrationIdOf = (
  source: ContentSource,
): ApplicationId | null =>
  source.kind === "stewardship" ? source.app.target.registrationId : null;
