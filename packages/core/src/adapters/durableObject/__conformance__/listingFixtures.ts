import { NotFoundError } from "@repo/core/application/errors";
import type { CategoryId, ListingId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import {
  CategoryCatalog,
  INITIAL_CATEGORY_NAMES,
} from "@repo/core/domain/listing/categoryCatalog";
import type { Listing, ListingShelf } from "@repo/core/domain/listing/listing";
import type { OfferingPhaseRecord } from "@repo/core/domain/listing/offeringWatch";
import { CategoryName } from "@repo/core/domain/listing/values";
import type { ConformanceHarness } from "./harness";

export {
  type ContentSpec,
  day,
  listingFactory,
  openDates,
  period,
  TODAY,
} from "@repo/core/domain/listing/testing/samples";

export const page = (p: number, limit = 100): Pagination => ({
  page: p,
  limit,
});

export const ALL: ListingShelf = { publication: null, phase: null };

export const keyword = (input: string): SearchKeyword =>
  SearchKeyword.create(input);

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
