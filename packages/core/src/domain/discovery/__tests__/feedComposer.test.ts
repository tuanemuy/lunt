import {
  ArticleId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FeedComposer,
  type FeedFrameCandidates,
  type FeedItem,
  type FeedListingCandidate,
  type FeedPage,
} from "../feedComposer";

const candidate = (
  listing: string,
  place: string,
  region: string | null = null,
): FeedListingCandidate => ({
  listingId: ListingId.create(listing),
  placeId: PlaceId.create(place),
  regionId: region === null ? null : RegionId.create(region),
});

const ids = (candidates: readonly FeedListingCandidate[]) =>
  candidates.map((c) => c.listingId);

const frames = (
  regions: number,
  articles: number,
  occasions: number,
): FeedFrameCandidates => ({
  regions: Array.from({ length: regions }, (_, i) => RegionId.create(`r${i}`)),
  articles: Array.from({ length: articles }, (_, i) =>
    ArticleId.create(`a${i}`),
  ),
  occasions: Array.from({ length: occasions }, (_, i) =>
    OccasionId.create(`o${i}`),
  ),
});

/** `n` listings of different places and regions. */
const distinct = (n: number) =>
  Array.from({ length: n }, (_, i) => candidate(`l${i}`, `p${i}`, `x${i}`));

/** An item as a short label: `L` for a listing, the frame's id otherwise. */
function labelOf(item: FeedItem): string {
  switch (item.kind) {
    case "listing":
      return "L";
    case "region":
      return item.regionId;
    case "article":
      return item.articleId;
    case "occasion":
      return item.occasionId;
  }
}

const shape = (items: readonly FeedItem[]) => items.map(labelOf);

const composeAll = (
  listings: readonly FeedListingCandidate[],
  frameCandidates: FeedFrameCandidates,
  pagination: Readonly<{ page: number; limit: number }>,
): FeedPage => {
  const page = FeedComposer.page(
    {
      listings,
      exhausted: true,
      listingCount: listings.length,
      frames: frameCandidates,
    },
    pagination,
  );
  if (page === null) throw new Error("exhausted candidates always compose");
  return page;
};

/**
 * Composes like `readFeed`: reads `chunk` candidates at a time from the
 * head until the requirement is met and `page` decides.
 */
const composeReading = (
  listings: readonly FeedListingCandidate[],
  frameCandidates: FeedFrameCandidates,
  pagination: Readonly<{ page: number; limit: number }>,
  chunk: number,
): FeedPage => {
  const { listings: wanted } = FeedComposer.requirement(pagination);
  let read = Math.min(listings.length, Math.max(chunk, wanted));
  for (;;) {
    const page = FeedComposer.page(
      {
        listings: listings.slice(0, read),
        exhausted: read >= listings.length,
        listingCount: listings.length,
        frames: frameCandidates,
      },
      pagination,
    );
    if (page !== null) return page;
    read = Math.min(listings.length, read + chunk);
  }
};

describe("FeedComposer.conflicts", () => {
  it("holds for the same place, or the same non-null region", () => {
    expect(
      FeedComposer.conflicts(candidate("1", "p", "x"), candidate("2", "p")),
    ).toBe(true);
    expect(
      FeedComposer.conflicts(
        candidate("1", "p", "x"),
        candidate("2", "q", "x"),
      ),
    ).toBe(true);
    expect(
      FeedComposer.conflicts(candidate("1", "p"), candidate("2", "q")),
    ).toBe(false);
    expect(
      FeedComposer.conflicts(
        candidate("1", "p", "x"),
        candidate("2", "q", "y"),
      ),
    ).toBe(false);
  });
});

describe("FeedComposer.arrange", () => {
  it("keeps a listing of the same place from following another when another candidate remains", () => {
    const a1 = candidate("a1", "A", "X");
    const a2 = candidate("a2", "A", "X");
    const b1 = candidate("b1", "B", "Y");
    expect(ids(FeedComposer.arrange([a1, a2, b1]))).toEqual(["a1", "b1", "a2"]);
  });

  it("brings the first non-conflicting candidate forward however far it is, then runs the rest together", () => {
    const as = Array.from({ length: 20 }, (_, i) =>
      candidate(`a${i + 1}`, "A", "X"),
    );
    const b1 = candidate("b1", "B", "Y");
    expect(ids(FeedComposer.arrange([...as, b1]))).toEqual([
      "a1",
      "b1",
      ...as.slice(1).map((c) => c.listingId),
    ]);
  });

  it("does not treat listings without a region name as the same region", () => {
    const list = [
      candidate("1", "p"),
      candidate("2", "q"),
      candidate("3", "r"),
    ];
    expect(ids(FeedComposer.arrange(list))).toEqual(["1", "2", "3"]);
  });

  it("is a permutation of its input", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            place: fc.integer({ min: 0, max: 4 }),
            region: fc.option(fc.integer({ min: 0, max: 3 })),
          }),
          { maxLength: 40 },
        ),
        (specs) => {
          const list = specs.map((s, i) =>
            candidate(
              `l${i}`,
              `p${s.place}`,
              s.region === null ? null : `x${s.region}`,
            ),
          );
          const arranged = FeedComposer.arrange(list);
          expect([...ids(arranged)].sort()).toEqual([...ids(list)].sort());
        },
      ),
    );
  });
});

describe("FeedComposer.slotCount", () => {
  it("is 0 without listings, else one slot ahead plus one per six listings", () => {
    expect([0, 1, 5, 6, 12, 13].map(FeedComposer.slotCount)).toEqual([
      0, 1, 1, 2, 3, 3,
    ]);
  });
});

describe("FeedComposer.assignFrames", () => {
  it("rotates region → article → occasion", () => {
    expect(
      shape(
        FeedComposer.assignFrames(frames(2, 2, 2), 4).flatMap((f) =>
          f === null ? [] : [f],
        ),
      ),
    ).toEqual(["r0", "a0", "o0", "r1"]);
  });

  it("skips a kind without candidates", () => {
    expect(
      shape(
        FeedComposer.assignFrames(frames(2, 0, 1), 3).flatMap((f) =>
          f === null ? [] : [f],
        ),
      ),
    ).toEqual(["r0", "o0", "r1"]);
  });

  it("leaves the slots after every candidate is used empty, never repeating one", () => {
    expect(FeedComposer.assignFrames(frames(1, 0, 0), 3)).toEqual([
      { kind: "region", regionId: "r0" },
      null,
      null,
    ]);
    expect(
      FeedComposer.assignFrames(
        {
          regions: [RegionId.create("r"), RegionId.create("r")],
          articles: [],
          occasions: [],
        },
        2,
      ),
    ).toEqual([{ kind: "region", regionId: "r" }, null]);
  });
});

describe("FeedComposer.page", () => {
  it("places slot 0 first and slot k after the 6k-th listing", () => {
    expect(
      shape(
        composeAll(distinct(13), frames(2, 2, 2), { page: 1, limit: 20 }).items,
      ),
    ).toEqual([
      "r0",
      ...Array(6).fill("L"),
      "a0",
      ...Array(6).fill("L"),
      "o0",
      "L",
    ]);
  });

  it("counts pages in listings, a slot joining the page that holds its listing", () => {
    const list = distinct(14);
    const pages = [1, 2, 3].map((page) =>
      composeAll(list, frames(1, 1, 1), { page, limit: 6 }),
    );
    expect(pages.map((p) => shape(p.items))).toEqual([
      ["r0", ...Array(6).fill("L"), "a0"],
      [...Array(6).fill("L"), "o0"],
      ["L", "L"],
    ]);
    expect(pages.map((p) => p.listingCount)).toEqual([14, 14, 14]);
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false]);
  });

  it("gives an empty page past the end, and no frame without listings", () => {
    expect(
      composeAll(distinct(5), frames(1, 1, 1), { page: 2, limit: 20 }),
    ).toEqual({
      items: [],
      listingCount: 5,
      hasMore: false,
    });
    expect(composeAll([], frames(1, 1, 1), { page: 1, limit: 20 })).toEqual({
      items: [],
      listingCount: 0,
      hasMore: false,
    });
    expect(
      FeedComposer.page(
        {
          listings: distinct(3),
          exhausted: false,
          listingCount: 250,
          frames: frames(1, 1, 1),
        },
        { page: 30, limit: 10 },
      ),
    ).toEqual({ items: [], listingCount: 250, hasMore: false });
  });

  it("is undecided while the candidates read all conflict with the last one placed", () => {
    const list = [
      candidate("a1", "A"),
      candidate("a2", "A"),
      candidate("b1", "B"),
    ];
    const pagination = { page: 1, limit: 2 };
    expect(
      FeedComposer.page(
        {
          listings: list.slice(0, 2),
          exhausted: false,
          listingCount: 3,
          frames: frames(0, 0, 0),
        },
        pagination,
      ),
    ).toBeNull();
    expect(composeReading(list, frames(0, 0, 0), pagination, 2).items).toEqual([
      { kind: "listing", listingId: "a1" },
      { kind: "listing", listingId: "b1" },
    ]);
  });

  it("requires page × limit listings and slotCount of that per kind", () => {
    expect(FeedComposer.requirement({ page: 3, limit: 10 })).toEqual({
      listings: 30,
      framesPerKind: 6,
    });
  });

  it("joins pages read from the head into the feed composed at once", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            place: fc.integer({ min: 0, max: 5 }),
            region: fc.option(fc.integer({ min: 0, max: 3 })),
          }),
          { maxLength: 60 },
        ),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 7 }),
        fc.tuple(
          fc.integer({ min: 0, max: 4 }),
          fc.integer({ min: 0, max: 4 }),
          fc.integer({ min: 0, max: 4 }),
        ),
        (specs, limit, chunk, [r, a, o]) => {
          const list = specs.map((s, i) =>
            candidate(
              `l${i.toString().padStart(3, "0")}`,
              `p${s.place}`,
              s.region === null ? null : `x${s.region}`,
            ),
          );
          const frameCandidates = frames(r, a, o);
          const whole = composeAll(list, frameCandidates, {
            page: 1,
            limit: Math.max(1, list.length),
          });
          const pageCount = Math.ceil(list.length / limit) + 1;
          const joined = Array.from({ length: pageCount }, (_, i) =>
            composeReading(
              list,
              frameCandidates,
              { page: i + 1, limit },
              chunk,
            ),
          ).flatMap((page) => page.items);
          expect(joined).toEqual(whole.items);
        },
      ),
    );
  });
});
