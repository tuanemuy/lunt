import type { PhotoId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import { Pagination } from "@repo/core/domain/common/pagination";
import type { BrowseCriteria } from "@repo/core/domain/discovery/browseCriteria";
import type { ListingEntry } from "@repo/core/domain/discovery/entry";
import {
  FeedComposer,
  type FeedItem,
  FeedListingCandidate,
  type FeedPage,
} from "@repo/core/domain/discovery/feedComposer";
import type { FeedQuery } from "@repo/core/domain/discovery/ports/feedCandidateQueries";
import {
  type ListingSummary,
  type OccasionSummary,
  type RegionSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import type { RequestContainer } from "../di/types";
import type { ServiceArgs } from "../types";
import { type BrowseCriteriaInput, resolveBrowseCriteria } from "./criteria";
import {
  listingSummaryPhotoIds,
  occasionSummaryPhotoIds,
  type PhotoRefs,
  type PointInput,
  photoRefsOf,
  pointFromInput,
  regionSummaryPhotoIds,
  todayOf,
} from "./views";

export type ReadFeedInput = Readonly<{
  criteria: BrowseCriteriaInput;
  /** The viewer's position when they allowed it; orders nearest first. */
  origin: PointInput | null;
  /** Counted in listings; frames come on top. */
  pagination: Pagination;
}>;

/**
 * One item of the feed: a listing card, or a large frame introducing a
 * region or an occasion. Article frames join with stage 5.
 */
export type FeedEntry =
  | Readonly<{ kind: "listing"; summary: ListingSummary }>
  | Readonly<{ kind: "region"; summary: RegionSummary }>
  | Readonly<{ kind: "occasion"; summary: OccasionSummary }>;

export type ReadFeedOutput = Readonly<{
  /** The page's listings and frames in feed order. */
  items: readonly FeedEntry[];
  /** Every feed listing matching the criteria (the same on every page). */
  listingCount: number;
  hasMore: boolean;
  /** The conditions in force: retired categories and repeats dropped. */
  effective: BrowseCriteria;
  photos: PhotoRefs;
}>;

/** Candidates are read in pages of this size (`FeedComposer`「ページ」). */
const READ_LIMIT = Pagination.maxLimit;

type Candidates = Readonly<{
  listings: readonly ListingEntry[];
  exhausted: boolean;
  count: number;
  pagesRead: number;
}>;

/** Reads the next candidate page and appends it. */
async function readMore(
  container: Pick<RequestContainer, "feedCandidateQueries">,
  query: FeedQuery,
  read: Candidates,
): Promise<Candidates> {
  const page = read.pagesRead + 1;
  const next = await container.feedCandidateQueries.findListings(query, {
    page,
    limit: READ_LIMIT,
  });
  const seen = new Set(read.listings.map((entry) => entry.listing.id));
  const listings = [
    ...read.listings,
    ...next.items.filter((entry) => !seen.has(entry.listing.id)),
  ];
  return {
    listings,
    exhausted:
      next.items.length < READ_LIMIT || page * READ_LIMIT >= next.count,
    count: next.count,
    pagesRead: page,
  };
}

/** The first `wanted` candidates of a frame kind, read in pages of 100. */
async function readFrames<T>(
  wanted: number,
  read: (pagination: Pagination) => Promise<Readonly<{ items: readonly T[] }>>,
): Promise<readonly T[]> {
  const frames: T[] = [];
  for (let page = 1; frames.length < wanted; page += 1) {
    const next = await read({ page, limit: READ_LIMIT });
    frames.push(...next.items);
    if (next.items.length < READ_LIMIT) break;
  }
  return frames.slice(0, wanted);
}

type Composed = Readonly<{
  page: FeedPage;
  listings: ReadonlyMap<string, ListingEntry>;
  regions: ReadonlyMap<string, PublishedRegion>;
  occasions: ReadonlyMap<string, PublishedOccasion>;
}>;

async function compose(
  container: Pick<RequestContainer, "feedCandidateQueries">,
  query: FeedQuery,
  pagination: Pagination,
): Promise<Composed> {
  const required = FeedComposer.requirement(pagination);
  const start = required.listings - pagination.limit;
  let read: Candidates = {
    listings: [],
    exhausted: false,
    count: 0,
    pagesRead: 0,
  };
  do {
    read = await readMore(container, query, read);
  } while (
    !read.exhausted &&
    read.listings.length < required.listings &&
    start < read.count
  );
  const framesPerKind =
    start < read.count
      ? FeedComposer.slotCount(Math.min(required.listings, read.count))
      : 0;
  const [regions, occasions] = await Promise.all([
    readFrames(framesPerKind, (p) =>
      container.feedCandidateQueries.findRegionFrames(query, p),
    ),
    readFrames(framesPerKind, (p) =>
      container.feedCandidateQueries.findOccasionFrames(query, p),
    ),
  ]);
  const frames = {
    regions: regions.map((region) => region.id),
    articles: [],
    occasions: occasions.map((occasion) => occasion.id),
  };
  for (;;) {
    const page = FeedComposer.page(
      {
        listings: read.listings.map(FeedListingCandidate.of),
        exhausted: read.exhausted,
        listingCount: read.count,
        frames,
      },
      pagination,
    );
    if (page !== null) {
      return {
        page,
        listings: new Map(read.listings.map((e) => [e.listing.id, e])),
        regions: new Map(regions.map((region) => [region.id, region])),
        occasions: new Map(occasions.map((o) => [o.id, o])),
      };
    }
    read = await readMore(container, query, read);
  }
}

const displayed = { kind: "displayed" } as const;

function photoIdsOfEntry(item: FeedEntry): readonly PhotoId[] {
  switch (item.kind) {
    case "listing":
      return listingSummaryPhotoIds(item.summary);
    case "region":
      return regionSummaryPhotoIds(item.summary);
    case "occasion":
      return occasionSummaryPhotoIds(item.summary);
  }
}

/**
 * The item's summary, or none when its target dropped out between reads
 * (and for an article frame, which cannot occur before stage 5).
 */
function entryOf(
  composed: Composed,
  item: FeedItem,
  today: LocalDate,
): readonly FeedEntry[] {
  switch (item.kind) {
    case "listing": {
      const entry = composed.listings.get(item.listingId);
      return entry === undefined
        ? []
        : [
            {
              kind: "listing",
              summary: ViewProjection.listingSummary(entry, displayed, today),
            },
          ];
    }
    case "region": {
      const region = composed.regions.get(item.regionId);
      return region === undefined
        ? []
        : [{ kind: "region", summary: ViewProjection.regionSummary(region) }];
    }
    case "occasion": {
      const occasion = composed.occasions.get(item.occasionId);
      return occasion === undefined
        ? []
        : [
            {
              kind: "occasion",
              summary: ViewProjection.occasionSummary(occasion, today),
            },
          ];
    }
    case "article":
      return [];
  }
}

/**
 * DIS-01, DIS-02, DIS-03, DIS-04, DIS-06 (VW-01): the feed — feed listings
 * matching the criteria mixed by `FeedComposer`, nearest first with an
 * origin and newest first without, with region, article and occasion
 * frames at the head and after every sixth listing. Pages count listings;
 * each page is composed from the head of the candidates, so consecutive
 * pages join into the feed composed at once while the candidates stay put.
 * No matching listing gives an empty feed without frames. Articles join
 * with stage 5 (until then there is no article frame). Needs no login.
 *
 * @throws BusinessRuleError `COMMON_INVALID_INPUT` for a pagination out of
 *   bounds, `COMMON_INVALID_GEO_POINT` for an origin out of range, and the
 *   area and category value objects' codes for malformed ones.
 */
export async function readFeed({
  container,
  input,
}: ServiceArgs<ReadFeedInput>): Promise<ReadFeedOutput> {
  const pagination = Pagination.create(input.pagination);
  const criteria = await resolveBrowseCriteria(container, input.criteria);
  const today = todayOf(container);
  const composed = await compose(
    container,
    {
      criteria,
      origin: input.origin === null ? null : pointFromInput(input.origin),
      today,
    },
    pagination,
  );
  const items = composed.page.items.flatMap((item) =>
    entryOf(composed, item, today),
  );
  return {
    items,
    listingCount: composed.page.listingCount,
    hasMore: composed.page.hasMore,
    effective: criteria.effective,
    photos: await photoRefsOf(container, items.flatMap(photoIdsOfEntry)),
  };
}
