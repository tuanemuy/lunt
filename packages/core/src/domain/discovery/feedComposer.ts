import type {
  ArticleId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { ListingEntry } from "./entry";

/** A feed listing in priority order: what the mixing rule looks at. */
export type FeedListingCandidate = Readonly<{
  listingId: ListingId;
  placeId: PlaceId;
  /** The region its summary names (the displayed region); `null` for none. */
  regionId: RegionId | null;
}>;

export const FeedListingCandidate = {
  /** The displayed region is the first of the place entry's regions. */
  of: (entry: ListingEntry): FeedListingCandidate => ({
    listingId: entry.listing.id,
    placeId: entry.place.place.id,
    regionId: entry.place.regions[0]?.id ?? null,
  }),
};

/** A large frame introducing a region, an article or an occasion. */
export type FeedFrame =
  | Readonly<{ kind: "region"; regionId: RegionId }>
  | Readonly<{ kind: "article"; articleId: ArticleId }>
  | Readonly<{ kind: "occasion"; occasionId: OccasionId }>;

export type FeedFrameKind = FeedFrame["kind"];

/** Each kind's frame candidates in that kind's own order. */
export type FeedFrameCandidates = Readonly<{
  regions: readonly RegionId[];
  articles: readonly ArticleId[];
  occasions: readonly OccasionId[];
}>;

export type FeedItem =
  | Readonly<{ kind: "listing"; listingId: ListingId }>
  | FeedFrame;

export type FeedPage = Readonly<{
  items: readonly FeedItem[];
  /** Every feed listing matching the criteria. */
  listingCount: number;
  hasMore: boolean;
}>;

/** What `FeedComposer.page` composes a page from. */
export type FeedPageInput = Readonly<{
  /** Candidates read from the head of the priority order. */
  listings: readonly FeedListingCandidate[];
  /** Whether `listings` holds every candidate. */
  exhausted: boolean;
  listingCount: number;
  frames: FeedFrameCandidates;
}>;

const LISTINGS_PER_FRAME = 6;
const FRAME_ROTATION = [
  "region",
  "article",
  "occasion",
] as const satisfies readonly FeedFrameKind[];

const conflicts = (a: FeedListingCandidate, b: FeedListingCandidate): boolean =>
  a.placeId === b.placeId ||
  (a.regionId !== null && b.regionId !== null && a.regionId === b.regionId);

/**
 * Places candidates while every placement is decided by the ones read: the
 * first candidate not conflicting with the previous one, or — only once
 * every candidate is read — the first remaining one. Stops at `upTo`
 * placements or at the first undecided position.
 */
function arrangeDecided(
  candidates: readonly FeedListingCandidate[],
  exhausted: boolean,
  upTo: number,
): readonly FeedListingCandidate[] {
  const remaining = [...candidates];
  const placed: FeedListingCandidate[] = [];
  while (placed.length < upTo && remaining.length > 0) {
    const previous = placed[placed.length - 1];
    const index =
      previous === undefined
        ? 0
        : remaining.findIndex((candidate) => !conflicts(candidate, previous));
    if (index === -1 && !exhausted) break;
    const [next] = remaining.splice(Math.max(index, 0), 1);
    if (next === undefined) break;
    placed.push(next);
  }
  return placed;
}

/**
 * The listing order of every candidate (V-45): the head first, then each
 * time the first remaining candidate not conflicting with the one placed
 * before it, falling back to the first remaining one only when all of
 * them conflict.
 */
const arrange = (
  candidates: readonly FeedListingCandidate[],
): readonly FeedListingCandidate[] =>
  arrangeDecided(candidates, true, candidates.length);

/** Slot 0 heads the feed and slot k follows the 6k-th listing. */
const slotCount = (listingCount: number): number =>
  listingCount === 0 ? 0 : Math.floor(listingCount / LISTINGS_PER_FRAME) + 1;

const framesOfKind = (
  candidates: FeedFrameCandidates,
): Readonly<Record<FeedFrameKind, readonly FeedFrame[]>> => ({
  region: [...new Set(candidates.regions)].map((regionId) => ({
    kind: "region",
    regionId,
  })),
  article: [...new Set(candidates.articles)].map((articleId) => ({
    kind: "article",
    articleId,
  })),
  occasion: [...new Set(candidates.occasions)].map((occasionId) => ({
    kind: "occasion",
    occasionId,
  })),
});

/**
 * The frame of each of the first `slots` slots (V-46, P-30): the rotation
 * region → article → occasion, each slot taking the next unused candidate
 * of the first kind (from the rotation's position) that has one, and
 * moving the rotation past that kind. Once no kind has a candidate left,
 * that slot and every later one is `null`. No target is used twice.
 */
function assignFrames(
  candidates: FeedFrameCandidates,
  slots: number,
): readonly (FeedFrame | null)[] {
  const byKind = framesOfKind(candidates);
  const used: Record<FeedFrameKind, number> = {
    region: 0,
    article: 0,
    occasion: 0,
  };
  let position = 0;
  const assigned: (FeedFrame | null)[] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    let frame: FeedFrame | null = null;
    for (let step = 0; step < FRAME_ROTATION.length && frame === null; step++) {
      const at = (position + step) % FRAME_ROTATION.length;
      const kind = FRAME_ROTATION[at];
      if (kind === undefined) continue;
      const next = byKind[kind][used[kind]];
      if (next === undefined) continue;
      used[kind] += 1;
      frame = next;
      position = (at + 1) % FRAME_ROTATION.length;
    }
    if (frame === null) {
      while (assigned.length < slots) assigned.push(null);
      break;
    }
    assigned.push(frame);
  }
  return assigned;
}

/**
 * How many candidates composing up to the page needs at least: every
 * listing up to the page's end and `slotCount` of that many per frame kind.
 */
const requirement = (
  pagination: Pagination,
): Readonly<{ listings: number; framesPerKind: number }> => {
  const listings = pagination.page * pagination.limit;
  return { listings, framesPerKind: slotCount(listings) };
};

/**
 * The page's items: its `limit` listings from `(page − 1) × limit` of the
 * arranged order, slot 0 ahead of the first page's listings and slot k
 * right after the 6k-th listing, on whichever page holds it. `null` while
 * the candidates read do not decide the order up to the page's end — read
 * more and compose again. A page past the end has no items.
 */
function page(input: FeedPageInput, pagination: Pagination): FeedPage | null {
  const start = (pagination.page - 1) * pagination.limit;
  const end = pagination.page * pagination.limit;
  const hasMore = end < input.listingCount;
  const empty = { items: [], listingCount: input.listingCount, hasMore };
  if (start >= input.listingCount && !input.exhausted) return empty;
  const wanted = Math.min(end, input.listingCount);
  const arranged = arrangeDecided(input.listings, input.exhausted, end);
  if (arranged.length < wanted && !input.exhausted) return null;
  const shown = arranged.slice(start, end);
  if (shown.length === 0) return empty;
  const lastIndex = start + shown.length - 1;
  const frames = assignFrames(
    input.frames,
    Math.floor((lastIndex + 1) / LISTINGS_PER_FRAME) + 1,
  );
  const items: FeedItem[] = [];
  const pushFrame = (slot: number) => {
    const frame = frames[slot];
    if (frame !== undefined && frame !== null) items.push(frame);
  };
  if (start === 0) pushFrame(0);
  shown.forEach((candidate, offset) => {
    items.push({ kind: "listing", listingId: candidate.listingId });
    const placedCount = start + offset + 1;
    if (placedCount % LISTINGS_PER_FRAME === 0) {
      pushFrame(placedCount / LISTINGS_PER_FRAME);
    }
  });
  return { items, listingCount: input.listingCount, hasMore };
}

/**
 * The feed's composition (`spec/domains/discovery.md` 「FeedComposer」):
 * from the listings' priority order and the frame candidates' orders, the
 * one order of listings and large frames. Independent of storage; the same
 * candidates always give the same feed, and pages composed from the head
 * join into the feed composed at once.
 */
export const FeedComposer = {
  LISTINGS_PER_FRAME,
  FRAME_ROTATION,
  conflicts,
  arrange,
  slotCount,
  assignFrames,
  requirement,
  page,
};
