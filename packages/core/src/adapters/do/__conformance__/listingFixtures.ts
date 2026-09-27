import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { NotFoundError } from "@repo/core/application/errors";
import {
  CategoryId,
  ListingId,
  PhotoId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import {
  CategoryCatalog,
  INITIAL_CATEGORY_NAMES,
} from "@repo/core/domain/listing/categoryCatalog";
import type { ListingContent } from "@repo/core/domain/listing/content";
import {
  Listing,
  type ListingShelf,
  type PublishedListing,
  type UnpublishedListing,
} from "@repo/core/domain/listing/listing";
import {
  Offering,
  OfferingPeriod,
  OpenDates,
} from "@repo/core/domain/listing/offering";
import type { OfferingPhaseRecord } from "@repo/core/domain/listing/offeringWatch";
import {
  CategoryName,
  type Framing,
  ListingDescription,
  ListingName,
  type ListingPhoto,
} from "@repo/core/domain/listing/values";
import type { ConformanceHarness } from "./harness";

export const TODAY = LocalDate.parse("2026-07-10");

export const day = (iso: string): LocalDate => LocalDate.parse(iso);

export const period = (start: string | null, end: string | null): Offering => ({
  kind: "period",
  period: OfferingPeriod.create({
    start: start === null ? null : day(start),
    end: end === null ? null : day(end),
  }),
});

export const openDates = (...dates: readonly string[]): Offering => ({
  kind: "dates",
  dates: OpenDates.create(dates.map(day)),
});

export type ContentSpec = Readonly<{
  name?: string | null;
  description?: string | null;
  categoryId?: CategoryId | null;
  /** A count of fresh photos, or the photos themselves. */
  photos?: number | readonly ListingPhoto[];
  offering?: Offering;
}>;

export const page = (p: number, limit = 100): Pagination => ({
  page: p,
  limit,
});

export const ALL: ListingShelf = { publication: null, phase: null };

export const keyword = (input: string): SearchKeyword =>
  SearchKeyword.create(input);

/**
 * Listings built through the domain (never SQL) with ids minted in
 * ascending order and an `updatedAt` that moves forward on every build,
 * so a later listing is newer unless a test pins `at`.
 */
export function listingFactory() {
  const ids = new FakeIdGenerator();
  let clock = Date.parse("2026-07-01T00:00:00.000Z");
  const tick = (): Date => {
    clock += 60_000;
    return new Date(clock);
  };
  const place = (): PlaceId => PlaceId.create(ids.next());
  const category = (): CategoryId => CategoryId.create(ids.next());
  const photo = (framing: Framing | null = null): ListingPhoto => ({
    photoId: PhotoId.create(ids.next()),
    framing,
  });
  const listingId = (): ListingId => ListingId.create(ids.next());

  /** A catalog whose active categories are `categoryIds` (used to build content only). */
  const catalogOf = (categoryIds: readonly CategoryId[]): CategoryCatalog => {
    const [first, ...rest] = categoryIds.map((id, i) => ({
      id,
      name: CategoryName.create(`カテゴリー${i + 1}`),
    }));
    if (first === undefined) return CategoryCatalog.empty();
    return CategoryCatalog.establish(
      CategoryCatalog.empty(),
      [first, ...rest],
      tick(),
    ).entity;
  };

  const defaultCategory = category();

  const content = (spec: ContentSpec = {}): ListingContent => {
    const photos =
      spec.photos === undefined
        ? [photo()]
        : typeof spec.photos === "number"
          ? Array.from({ length: spec.photos }, () => photo())
          : spec.photos;
    const name = spec.name === undefined ? "掲載" : spec.name;
    const description = spec.description ?? null;
    return {
      name: name === null ? null : ListingName.create(name),
      description:
        description === null ? null : ListingDescription.create(description),
      categoryId:
        spec.categoryId === undefined ? defaultCategory : spec.categoryId,
      photos: PhotoSet.of(photos, "LISTING"),
      offering: spec.offering ?? Offering.none(),
    };
  };

  const draft = (
    placeId: PlaceId,
    spec: ContentSpec = {},
    at: Date = tick(),
    id: ListingId = listingId(),
  ) => {
    const c = content(spec);
    return Listing.createDraft(
      { id, placeId, content: c },
      catalogOf(c.categoryId === null ? [] : [c.categoryId]),
      at,
    ).entity;
  };

  const published = (
    placeId: PlaceId,
    spec: ContentSpec = {},
    at: Date = tick(),
    id: ListingId = listingId(),
  ): PublishedListing =>
    Listing.publish(draft(placeId, spec, at, id), at).entity;

  const unpublished = (
    placeId: PlaceId,
    spec: ContentSpec = {},
    at: Date = tick(),
  ): UnpublishedListing =>
    Listing.unpublish(published(placeId, spec, at), at).entity;

  const suspended = (listing: Listing, at: Date = tick()): Listing =>
    Listing.suspend(listing, at).entity;

  const manuallyEnded = (
    placeId: PlaceId,
    spec: ContentSpec = {},
    at: Date = tick(),
  ): PublishedListing =>
    Listing.endOffering(published(placeId, spec, at), at).entity;

  return {
    ids,
    tick,
    place,
    category,
    photo,
    listingId,
    catalogOf,
    defaultCategory,
    content,
    draft,
    published,
    unpublished,
    suspended,
    manuallyEnded,
  };
}

export async function insertListings(
  h: ConformanceHarness,
  ...listings: readonly Listing[]
): Promise<void> {
  await h.uow.run(async ({ listingRepository }) => {
    for (const listing of listings) await listingRepository.insert(listing);
  });
}

export function findListing(
  h: ConformanceHarness,
  id: ListingId,
): Promise<Versioned<Listing> | null> {
  return h.uow.run(({ listingRepository }) => listingRepository.findById(id));
}

export async function getListing(
  h: ConformanceHarness,
  id: ListingId,
): Promise<Versioned<Listing>> {
  const found = await findListing(h, id);
  if (found === null) throw new NotFoundError("TEST", `no listing ${id}`);
  return found;
}

export function saveListing(
  h: ConformanceHarness,
  listing: Listing,
  expectedVersion: ExpectedVersion<Listing>,
): Promise<void> {
  return h.uow.run(({ listingRepository }) =>
    listingRepository.save(listing, expectedVersion),
  );
}

export function deleteListing(
  h: ConformanceHarness,
  id: ListingId,
  expectedVersion: ExpectedVersion<Listing>,
): Promise<void> {
  return h.uow.run(({ listingRepository }) =>
    listingRepository.delete(id, expectedVersion),
  );
}

export const idsOf = (listings: readonly Listing[]): readonly ListingId[] =>
  listings.map((listing) => listing.id);

export function recordPhase(
  h: ConformanceHarness,
  entry: OfferingPhaseRecord,
): Promise<void> {
  return h.uow.run(({ offeringPhaseLedger }) =>
    offeringPhaseLedger.record(entry),
  );
}

/** The four opening categories as the catalog's first `save` would hold them. */
export function openingCatalog(
  categoryIds: readonly CategoryId[],
  now: Date,
): CategoryCatalog {
  const initial = INITIAL_CATEGORY_NAMES.map((name, i) => {
    const id = categoryIds[i];
    if (id === undefined) throw new Error("four category ids");
    return { id, name: CategoryName.create(name) };
  });
  const [first, ...rest] = initial;
  if (first === undefined) throw new Error("four category ids");
  return CategoryCatalog.establish(
    CategoryCatalog.empty(),
    [first, ...rest],
    now,
  ).entity;
}
