import {
  PERIODS,
  type PlaceSpec,
} from "@repo/core/adapters/do/__conformance__/discoveryFixtures";
import { AreaSelection } from "@repo/core/domain/area/areaSelection";
import { GeoPoint } from "@repo/core/domain/common/geo";
import type { ListingId, PlaceId } from "@repo/core/domain/common/ids";
import { Listing } from "@repo/core/domain/listing/listing";
import type { Place } from "@repo/core/domain/place/place";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import type { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import type { BrowseCriteriaInput } from "../criteria";
import { type FeedEntry, type ReadFeedOutput, readFeed } from "../readFeed";
import { type DiscoveryKit, discoveryKit } from "./kit";

const NO_CRITERIA: BrowseCriteriaInput = { areas: [], categoryIds: [] };

type ReadOptions = Readonly<{
  criteria?: BrowseCriteriaInput;
  origin?: GeoPoint | null;
  pagination?: Readonly<{ page: number; limit: number }>;
}>;

const read = (k: DiscoveryKit, options: ReadOptions = {}) =>
  readFeed({
    container: k.container,
    input: {
      criteria: options.criteria ?? NO_CRITERIA,
      origin: options.origin ?? null,
      pagination: options.pagination ?? { page: 1, limit: 20 },
    },
  });

/** An item as an id: a listing's id, or the frame's kind and id. */
function labelOf(item: FeedEntry): string {
  switch (item.kind) {
    case "listing":
      return item.summary.listingId;
    case "region":
      return `region:${item.summary.regionId}`;
    case "article":
      return `article:${item.summary.articleId}`;
    case "occasion":
      return `occasion:${item.summary.occasionId}`;
  }
}

const labels = (out: ReadFeedOutput): readonly string[] =>
  out.items.map(labelOf);

const SHAPE_LETTER = {
  listing: "L",
  region: "R",
  article: "A",
  occasion: "O",
} as const satisfies Record<FeedEntry["kind"], string>;

/** Items as kinds: `L` for a listing, `R` / `A` / `O` for a frame. */
const shape = (out: ReadFeedOutput): string =>
  out.items.map((item) => SHAPE_LETTER[item.kind]).join("");

const listingsIn = (out: ReadFeedOutput) =>
  out.items.flatMap((item) => (item.kind === "listing" ? [item.summary] : []));

const listingIdsIn = (out: ReadFeedOutput): readonly ListingId[] =>
  listingsIn(out).map((summary) => summary.listingId);

const framesIn = (out: ReadFeedOutput) =>
  labels(out).filter((label) => label.includes(":"));

/** How many listings precede each frame: the feed's intervals. */
const framePositions = (out: ReadFeedOutput): readonly number[] =>
  out.items.flatMap((item, i) =>
    item.kind === "listing"
      ? []
      : [out.items.slice(0, i).filter((x) => x.kind === "listing").length],
  );

const ORIGIN = GeoPoint.create(35, 139);
const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;
const north = (metres: number) =>
  GeoPoint.create(
    ORIGIN.latitude + metres / METRES_PER_DEGREE,
    ORIGIN.longitude,
  );
const locatedAt = (point: GeoPoint): PlaceSpec => ({
  profile: {
    location: { latitude: point.latitude, longitude: point.longitude },
  },
});

/** A place (in `regions` when given) with one feed listing. */
async function placeWithListing(
  k: DiscoveryKit,
  spec: PlaceSpec = {},
  regions: readonly Region[] = [],
) {
  const P = await k.w.place(spec);
  if (regions.length > 0) {
    await k.w.affiliate(
      P.id,
      regions.map((r) => r.id),
    );
  }
  const L = await k.w.available(P.id);
  return { P, L };
}

/** `n` feed listings at distinct places without regions; newest first. */
async function distinctListings(k: DiscoveryKit, n: number) {
  const made: ListingId[] = [];
  for (let i = 0; i < n; i += 1) made.push((await placeWithListing(k)).L.id);
  return made.reverse();
}

/** An upcoming occasion with one place taking part. */
async function occasionWithParticipant(
  k: DiscoveryKit,
  spec: Parameters<DiscoveryKit["w"]["occasion"]>[0] = {},
) {
  const E = await k.w.occasion(spec);
  const P = await k.w.place();
  await k.w.participate(E.id, P.id);
  return E;
}

/** Whether two neighbouring listings share a place or a named region. */
const consecutiveConflicts = (
  out: ReadFeedOutput,
  placeOf: ReadonlyMap<ListingId, PlaceId>,
) => {
  const summaries = listingsIn(out);
  return summaries.slice(1).some((summary, i) => {
    const previous = summaries[i];
    if (previous === undefined) return false;
    return (
      placeOf.get(summary.listingId) === placeOf.get(previous.listingId) ||
      (summary.region !== null && summary.region === previous.region)
    );
  });
};

describe("readFeed", () => {
  describe("対象と表示範囲", () => {
    it("readFeed#1 複数の地域の店舗に、商品・体験・景色・見どころのフィード対象の掲載がある。公開中の地域、公開中の読みもの、参加店舗を持つ開催前のイベントがある。選定の操作は誰も行っていない / 条件もカテゴリーも選ばずに読む", async () => {
      const k = await discoveryKit();
      const X = await k.w.region({ name: "谷中" });
      const Y = await k.w.region({ name: "根津" });
      const Z = await k.w.region({ name: "千駄木" });
      const A = await k.w.article({ title: "路地の話" });
      const E = await occasionWithParticipant(k);
      const made = [];
      for (const [i, categoryId] of k.categoryIds.entries()) {
        for (const region of [X, Y, Z]) {
          const P = await k.w.place();
          await k.w.affiliate(P.id, [region.id]);
          made.push(
            await k.w.store(
              k.w.f.published(P.id, { categoryId, name: `掲載${i}` }),
            ),
          );
        }
      }
      const out = await read(k);
      expect(shape(out)).toBe(`R${"L".repeat(6)}A${"L".repeat(6)}O`);
      expect(framesIn(out)).toEqual([
        `region:${Z.id}`,
        `article:${A.id}`,
        `occasion:${E.id}`,
      ]);
      const regions = listingsIn(out).map((summary) => summary.region);
      expect(new Set(regions)).toEqual(new Set(["谷中", "根津", "千駄木"]));
      expect(regions.slice(1).every((r, i) => r !== regions[i])).toBe(true);
      expect(out.listingCount).toBe(made.length);
    });

    it("readFeed#2 上と同じ / 読む", async () => {
      const k = await discoveryKit();
      const A = await k.w.article({ title: "路地の話", photos: 2 });
      const R = await k.w.region({
        name: "谷中",
        content: { tagline: "路地を歩く" },
      });
      const E = await occasionWithParticipant(k, {
        name: "朝市",
        tagline: "朝の市",
      });
      const P = await k.w.place({ profile: { name: "山田珈琲店" } });
      await k.w.affiliate(P.id, [R.id]);
      const L = await k.w.store(k.w.f.published(P.id, { name: "桃" }));
      for (let i = 0; i < 12; i += 1) await placeWithListing(k);
      const out = await read(k);
      const listing = out.items.find(
        (item) => item.kind === "listing" && item.summary.listingId === L.id,
      );
      const [photo] = L.content.photos.items;
      expect(listing).toEqual({
        kind: "listing",
        summary: {
          listingId: L.id,
          placeId: P.id,
          cover: {
            source: "own",
            photoId: photo?.photoId,
            framing: photo?.framing,
          },
          listingName: "桃",
          placeName: "山田珈琲店",
          region: "谷中",
          standing: {
            kind: "listing",
            offering: { phase: "available" },
            operating: "open",
          },
        },
      });
      expect(out.items[0]).toMatchObject({
        kind: "region",
        summary: {
          regionId: R.id,
          name: "谷中",
          tagline: "路地を歩く",
          cover: {
            source: "own",
            photoId: R.content.photos.items[0]?.photoId,
          },
        },
      });
      expect(out.items.find((item) => item.kind === "article")).toEqual({
        kind: "article",
        summary: {
          articleId: A.id,
          cover: {
            source: "own",
            photoId: A.content.photos.items[0]?.photoId,
            framing: null,
          },
          title: "路地の話",
        },
      });
      const occasion = out.items.find((item) => item.kind === "occasion");
      expect(occasion).toMatchObject({
        kind: "occasion",
        summary: {
          occasionId: E.id,
          name: "朝市",
          tagline: "朝の市",
          standing: { kind: "occasion", holding: "upcoming" },
        },
      });
      for (const item of out.items) {
        for (const id of [item.summary.cover.photoId]) {
          expect(out.photos[id]).toBeDefined();
        }
      }
    });

    it("readFeed#3 地域 X の枠の直後に並ぶ掲載の店舗は、地域 Y だけに所属している / 読む", async () => {
      const k = await discoveryKit();
      const Y = await k.w.region({ name: "根津" });
      const X = await k.w.region({ name: "谷中" });
      await placeWithListing(k, {}, [X]);
      const { L } = await placeWithListing(k, {}, [Y]);
      const out = await read(k);
      expect(labels(out).slice(0, 2)).toEqual([`region:${X.id}`, L.id]);
      expect(listingsIn(out)[0]?.region).toBe("根津");
    });

    it("readFeed#4 提供開始前の掲載、期日で提供終了になった掲載、管理する人が提供終了にした掲載、閉店した店舗の掲載がある / 読む", async () => {
      const k = await discoveryKit();
      const P = await k.w.place();
      await k.w.upcoming(P.id);
      await k.w.endedBySchedule(P.id);
      await k.w.endedByHand(P.id);
      const closed = await k.w.place({ status: "permanentlyClosed" });
      await k.w.available(closed.id);
      const shown = await k.w.available(P.id);
      const out = await read(k);
      expect(listingIdsIn(out)).toEqual([shown.id]);
      expect(out.listingCount).toBe(1);
    });

    it("readFeed#5 休業中の店舗のフィード対象の掲載と、イベントの参加に添えた掲載がある / 読む", async () => {
      const k = await discoveryKit();
      const resting = await k.w.place({ status: "temporarilyClosed" });
      const ofResting = await k.w.available(resting.id);
      const { P, L: attached } = await placeWithListing(k);
      const E = await k.w.occasion();
      await k.w.participate(E.id, P.id, { listingIds: [attached.id] });
      const out = await read(k);
      expect(listingIdsIn(out)).toEqual([attached.id, ofResting.id]);
      expect(listingsIn(out)[1]?.standing.operating).toBe("temporarilyClosed");
    });

    it("readFeed#6 下書き・一時非公開・運営による非公開の掲載と、非公開の店舗の公開中の掲載がある / 読む", async () => {
      const k = await discoveryKit();
      const P = await k.w.place();
      await k.w.draft(P.id);
      await k.w.unpublished(P.id);
      await k.w.suspendedListing(P.id);
      const hidden = await k.w.place({ suspended: true });
      await k.w.available(hidden.id);
      const out = await read(k);
      expect(out.items).toEqual([]);
      expect(out.listingCount).toBe(0);
    });

    it("readFeed#7 店舗の代表地域が公開の取り下げ中で、公開中の所属地域がほかに2つある / 読む", async () => {
      const k = await discoveryKit();
      const representative = await k.w.region({ name: "谷中" });
      const first = await k.w.region({ name: "根津" });
      const second = await k.w.region({ name: "千駄木" });
      const P = await k.w.place();
      await k.w.affiliate(P.id, [representative.id, first.id, second.id]);
      await k.w.unpublishRegion(representative);
      await k.w.available(P.id);
      const out = await read(k);
      expect(listingsIn(out)[0]?.region).toBe("根津");
    });

    it("readFeed#8 店舗に公開中の所属地域がない / 読む", async () => {
      const k = await discoveryKit();
      const R = await k.w.region({ state: "unpublished" });
      await placeWithListing(k, {}, [R]);
      const out = await read(k);
      expect(listingsIn(out)[0]?.region).toBeNull();
    });

    it("readFeed#9 開催前のイベント E に参加店舗があり、参加に添えた掲載は提供開始前だけ。終了したイベント、中止のイベント、参加店舗を持たない開催前のイベントがある / 読む", async () => {
      const k = await discoveryKit();
      const E = await k.w.occasion({ name: "朝市" });
      const P = await k.w.place();
      const U = await k.w.upcoming(P.id);
      await k.w.participate(E.id, P.id, { listingIds: [U.id] });
      await occasionWithParticipant(k, { period: PERIODS.ended });
      await occasionWithParticipant(k, { state: "cancelled" });
      await k.w.occasion();
      await distinctListings(k, 6);
      const out = await read(k);
      expect(framesIn(out)).toEqual([`occasion:${E.id}`]);
      expect(out.items[0]).toMatchObject({
        kind: "occasion",
        summary: { standing: { kind: "occasion", holding: "upcoming" } },
      });
    });

    it("readFeed#10 公開中の地域 R に所属する店舗の掲載が、提供終了のものだけ / 読む", async () => {
      const k = await discoveryKit();
      const R = await k.w.region();
      const P = await k.w.place();
      await k.w.affiliate(P.id, [R.id]);
      await k.w.endedBySchedule(P.id);
      await k.w.endedByHand(P.id);
      await distinctListings(k, 3);
      const out = await read(k);
      expect(framesIn(out)).toEqual([]);
      expect(shape(out)).toBe("LLL");
    });
  });

  describe("並び順と混ぜ方", () => {
    it("readFeed#11 別々の店舗・別々の地域の掲載 L1・L2・L3 が、この順に最初に公開された。L1 は一時非公開の後に再公開されている / 現在地なしで読む", async () => {
      const k = await discoveryKit();
      const regions = [
        await k.w.region(),
        await k.w.region(),
        await k.w.region(),
      ];
      const made = [];
      for (const region of regions) {
        made.push((await placeWithListing(k, {}, [region])).L);
      }
      const first = made[0];
      if (first === undefined) throw new Error("three listings");
      await k.w.updateListing(
        first,
        (s) => Listing.unpublish(s, k.w.f.tick()).entity,
      );
      await k.w.updateListing(
        first,
        (s) => Listing.publish(s, k.w.f.tick()).entity,
      );
      const out = await read(k, { origin: null });
      expect(listingIdsIn(out)).toEqual(made.map((l) => l.id).reverse());
    });

    it("readFeed#12 別々の店舗・別々の地域の掲載があり、店舗の位置が現在地から近い順に P1、P2、P3。地域とイベントも現在地からの距離が違う / 現在地つきで読む", async () => {
      const k = await discoveryKit();
      const { L: L1 } = await placeWithListing(k, locatedAt(north(100)));
      const { L: L2 } = await placeWithListing(k, locatedAt(north(500)));
      const Rnear = await k.w.region({ location: north(1_000) });
      const Rfar = await k.w.region({ location: north(5_000) });
      const { L: Lnear } = await placeWithListing(k, locatedAt(north(1_000)), [
        Rnear,
      ]);
      const { L: L3 } = await placeWithListing(k, locatedAt(north(2_000)));
      const { L: Lfar } = await placeWithListing(k, locatedAt(north(5_000)), [
        Rfar,
      ]);
      const far = [];
      for (const km of [8, 9, 10, 11, 12, 13, 14]) {
        far.push(
          (await placeWithListing(k, locatedAt(north(km * 1_000)))).L.id,
        );
      }
      await k.w.article();
      const newest = await k.w.article();
      const Enear = await occasionWithParticipant(k, {
        location: north(1_500),
      });
      await occasionWithParticipant(k, {
        location: north(3_000),
        period: PERIODS.ongoing,
      });
      const out = await read(k, { origin: ORIGIN });
      expect(labels(out)).toEqual([
        `region:${Rnear.id}`,
        L1.id,
        L2.id,
        Lnear.id,
        L3.id,
        Lfar.id,
        far[0],
        `article:${newest.id}`,
        ...far.slice(1),
        `occasion:${Enear.id}`,
      ]);
    });

    it("readFeed#13 新しい順で、店舗 A の掲載 a1、店舗 A の掲載 a2、別の地域の店舗 B の掲載 b1 / 読む", async () => {
      const k = await discoveryKit();
      const X = await k.w.region();
      const Y = await k.w.region();
      const A = await k.w.place();
      const B = await k.w.place();
      await k.w.affiliate(A.id, [X.id]);
      await k.w.affiliate(B.id, [Y.id]);
      const b1 = await k.w.available(B.id);
      const a2 = await k.w.available(A.id);
      const a1 = await k.w.available(A.id);
      expect(listingIdsIn(await read(k))).toEqual([a1.id, b1.id, a2.id]);
    });

    it("readFeed#14 近い順で、地域 X に所属する別々の店舗の掲載 x1・x2、地域 Y の店舗の掲載 y1（どの店舗も一覧に示す地域は所属する地域） / 現在地つきで読む", async () => {
      const k = await discoveryKit();
      const X = await k.w.region();
      const Y = await k.w.region();
      const { L: x1 } = await placeWithListing(k, locatedAt(north(100)), [X]);
      const { L: x2 } = await placeWithListing(k, locatedAt(north(200)), [X]);
      const { L: y1 } = await placeWithListing(k, locatedAt(north(300)), [Y]);
      expect(listingIdsIn(await read(k, { origin: ORIGIN }))).toEqual([
        x1.id,
        y1.id,
        x2.id,
      ]);
    });

    it("readFeed#15 フィード対象の掲載が、店舗 A の掲載3件だけ / 読む", async () => {
      const k = await discoveryKit();
      const A = await k.w.place();
      const made = [
        await k.w.available(A.id),
        await k.w.available(A.id),
        await k.w.available(A.id),
      ];
      expect(listingIdsIn(await read(k))).toEqual(
        made.map((l) => l.id).reverse(),
      );
    });

    it("readFeed#16 新しい順で、店舗 A の掲載 a1〜a20 の後に、別の地域の店舗 B の掲載 b1 / 読む", async () => {
      const k = await discoveryKit();
      const X = await k.w.region();
      const Y = await k.w.region();
      const A = await k.w.place();
      const B = await k.w.place();
      await k.w.affiliate(A.id, [X.id]);
      await k.w.affiliate(B.id, [Y.id]);
      const b1 = await k.w.available(B.id);
      const aListings = [];
      for (let i = 0; i < 20; i += 1) aListings.push(await k.w.available(A.id));
      const newestA = aListings.map((l) => l.id).reverse();
      const first = await read(k);
      const second = await read(k, { pagination: { page: 2, limit: 20 } });
      expect([...listingIdsIn(first), ...listingIdsIn(second)]).toEqual([
        newestA[0],
        b1.id,
        ...newestA.slice(1),
      ]);
    });

    it("readFeed#17 公開中の所属地域のない別々の店舗の掲載が、新しい順で並んでいる / 読む", async () => {
      const k = await discoveryKit();
      const newest = await distinctListings(k, 4);
      const out = await read(k);
      expect(listingIdsIn(out)).toEqual(newest);
      expect(listingsIn(out).every((summary) => summary.region === null)).toBe(
        true,
      );
    });
  });

  describe("大きな枠", () => {
    it("readFeed#18 フィード対象の掲載が13件。枠の候補は、地域2件、読みもの2件、イベント2件 / 読む", async () => {
      const k = await discoveryKit();
      const R1 = await k.w.region();
      const R2 = await k.w.region();
      await placeWithListing(k, {}, [R1]);
      await placeWithListing(k, {}, [R2]);
      await distinctListings(k, 11);
      await k.w.article();
      const A2 = await k.w.article();
      await occasionWithParticipant(k, { period: PERIODS.upcoming });
      const early = await occasionWithParticipant(k, {
        period: PERIODS.ongoing,
      });
      const out = await read(k);
      expect(shape(out)).toBe(`R${"L".repeat(6)}A${"L".repeat(6)}OL`);
      expect(framesIn(out)).toEqual([
        `region:${R2.id}`,
        `article:${A2.id}`,
        `occasion:${early.id}`,
      ]);
    });

    it("readFeed#19 フィード対象の掲載が13件。枠の候補は、地域2件とイベント1件で、読みものはない / 読む", async () => {
      const k = await discoveryKit();
      const R1 = await k.w.region();
      const R2 = await k.w.region();
      await placeWithListing(k, {}, [R1]);
      await placeWithListing(k, {}, [R2]);
      await distinctListings(k, 11);
      const E = await occasionWithParticipant(k);
      const out = await read(k);
      expect(shape(out)).toBe(`R${"L".repeat(6)}O${"L".repeat(6)}RL`);
      expect(framesIn(out)).toEqual([
        `region:${R2.id}`,
        `occasion:${E.id}`,
        `region:${R1.id}`,
      ]);
    });

    it("readFeed#20 フィード対象の掲載が13件。枠の候補は、地域1件だけ / 読む", async () => {
      const k = await discoveryKit();
      const R = await k.w.region();
      await placeWithListing(k, {}, [R]);
      await distinctListings(k, 12);
      const out = await read(k);
      expect(shape(out)).toBe(`R${"L".repeat(13)}`);
      expect(framesIn(out)).toEqual([`region:${R.id}`]);
    });

    it("readFeed#21 フィード対象の掲載があり、公開中の地域・読みもの・イベントが1つもない / 読む", async () => {
      const k = await discoveryKit();
      await k.w.region({ state: "draft" });
      await k.w.article({ state: "draft" });
      await k.w.article({ state: "unpublished" });
      await k.w.occasion({ state: "unpublished" });
      await distinctListings(k, 8);
      expect(shape(await read(k))).toBe("L".repeat(8));
    });
  });

  describe("ページ", () => {
    it("readFeed#22 フィード対象の掲載が14件。枠の候補は、地域・読みもの・イベントが1件ずつ。読み込みの間に候補は変わらない / 1ページ6件で、1〜3ページ目を同じ条件で読む", async () => {
      const k = await discoveryKit();
      const R = await k.w.region();
      await placeWithListing(k, {}, [R]);
      await distinctListings(k, 13);
      const A = await k.w.article();
      const E = await occasionWithParticipant(k);
      const pages = [];
      for (const page of [1, 2, 3]) {
        pages.push(await read(k, { pagination: { page, limit: 6 } }));
      }
      expect(pages.map(shape)).toEqual([
        `R${"L".repeat(6)}A`,
        `${"L".repeat(6)}O`,
        "LL",
      ]);
      expect(pages.flatMap(framesIn)).toEqual([
        `region:${R.id}`,
        `article:${A.id}`,
        `occasion:${E.id}`,
      ]);
      expect(pages.map((p) => p.listingCount)).toEqual([14, 14, 14]);
      expect(pages.map((p) => p.hasMore)).toEqual([true, true, false]);
      const whole = await read(k, { pagination: { page: 1, limit: 18 } });
      expect(pages.flatMap((p) => labels(p))).toEqual(labels(whole));
    });

    it("readFeed#23 同じ店舗・同じ地域の掲載が混ざった、フィード対象の掲載が30件 / 1ページ10件で1〜3ページ目を読み、別に1ページ30件で読む", async () => {
      const k = await discoveryKit();
      const regions = [
        await k.w.region({ name: "谷中" }),
        await k.w.region({ name: "根津" }),
        await k.w.region({ name: "千駄木" }),
      ];
      const places: Place[] = [];
      for (let i = 0; i < 6; i += 1) {
        const P = await k.w.place();
        const region = regions[i % regions.length];
        if (region !== undefined) await k.w.affiliate(P.id, [region.id]);
        places.push(P);
      }
      const placeOf = new Map<ListingId, PlaceId>();
      for (const P of places) {
        for (let i = 0; i < 5; i += 1) {
          placeOf.set((await k.w.available(P.id)).id, P.id);
        }
      }
      await occasionWithParticipant(k);
      await occasionWithParticipant(k);
      const articles = [await k.w.article(), await k.w.article()];
      const pages = [];
      for (const page of [1, 2, 3]) {
        pages.push(await read(k, { pagination: { page, limit: 10 } }));
      }
      const whole = await read(k, { pagination: { page: 1, limit: 30 } });
      expect(pages.flatMap((p) => labels(p))).toEqual(labels(whole));
      expect(listingIdsIn(whole)).toHaveLength(30);
      expect(consecutiveConflicts(whole, placeOf)).toBe(false);
      const frames = framesIn(whole);
      expect(frames).toHaveLength(6);
      expect(new Set(frames).size).toBe(frames.length);
      expect(frames.filter((frame) => frame.startsWith("article:"))).toEqual(
        articles.map((article) => `article:${article.id}`).reverse(),
      );
    });

    it("readFeed#24 フィード対象の掲載が5件 / 1ページ20件で2ページ目を読む", async () => {
      const k = await discoveryKit();
      await distinctListings(k, 5);
      const out = await read(k, { pagination: { page: 2, limit: 20 } });
      expect(out.items).toEqual([]);
      expect(out.listingCount).toBe(5);
      expect(out.hasMore).toBe(false);
    });
  });

  describe("絞り込み", () => {
    /**
     * readFeed#25〜#27 name three prefectures, but the test area master has
     * two (東京都, 大阪府). Substitute data, accepted by the Manager in P6:
     * prefecture A is 大阪府, town b is 銀座 (東京都), and 「都道府県 C の店舗」
     * is a place in 大手町 (東京都, outside town b).
     */
    const PREFECTURE_A = { unit: "prefecture", prefectureCode: "27" } as const;
    const TOWN_B = { unit: "area", areaCode: "1040061" } as const;

    async function fourListings(k: DiscoveryKit) {
      const [eat, buy, experience] = k.categoryIds;
      if (eat === undefined || buy === undefined || experience === undefined) {
        throw new Error("categories");
      }
      const inA = await k.w.place({
        profile: { address: SampleAddress.umeda() },
      });
      const inB = await k.w.place({
        profile: { address: SampleAddress.ginza() },
      });
      const inC = await k.w.place({
        profile: { address: SampleAddress.otemachi() },
      });
      return {
        eat,
        buy,
        eatInA: await k.w.store(k.w.f.published(inA.id, { categoryId: eat })),
        buyInB: await k.w.store(k.w.f.published(inB.id, { categoryId: buy })),
        experienceInB: await k.w.store(
          k.w.f.published(inB.id, { categoryId: experience }),
        ),
        eatInC: await k.w.store(k.w.f.published(inC.id, { categoryId: eat })),
      };
    }

    it("readFeed#25 都道府県 A の店舗の「食べる」の掲載、都道府県 B の町域 b の店舗の「買う」の掲載、町域 b の店舗の「体験」の掲載、都道府県 C の店舗の「食べる」の掲載がある / エリアに都道府県 A と町域 b、カテゴリーに「食べる」と「買う」を選んで読む", async () => {
      const k = await discoveryKit();
      const { eat, buy, eatInA, buyInB } = await fourListings(k);
      const more = [];
      for (let i = 0; i < 6; i += 1) {
        const P = await k.w.place({
          profile: { address: SampleAddress.umeda() },
        });
        more.push(await k.w.store(k.w.f.published(P.id, { categoryId: eat })));
      }
      await occasionWithParticipant(k, { address: SampleAddress.umeda() });
      await occasionWithParticipant(k, { address: SampleAddress.ginza() });
      const out = await read(k, {
        criteria: { areas: [PREFECTURE_A, TOWN_B], categoryIds: [eat, buy] },
      });
      expect(listingIdsIn(out)).toEqual([
        ...more.map((l) => l.id).reverse(),
        buyInB.id,
        eatInA.id,
      ]);
      expect(out.listingCount).toBe(8);
      const unfiltered = await read(k);
      expect(framePositions(out)).toEqual([0, 6]);
      expect(framePositions(out)).toEqual(framePositions(unfiltered));
      expect(framesIn(out)).toEqual(framesIn(unfiltered));
      expect(out.effective).toEqual({
        areas: [
          AreaSelection.create(PREFECTURE_A),
          AreaSelection.create(TOWN_B),
        ],
        categoryIds: [eat, buy],
      });
    });

    it("readFeed#26 上と同じ / エリアに都道府県 A だけを選んで読む。別に、カテゴリーに「食べる」だけを選んで読む", async () => {
      const k = await discoveryKit();
      const { eat, eatInA, eatInC } = await fourListings(k);
      const P = await k.w.place({
        profile: { address: SampleAddress.umeda() },
      });
      const otherInA = await k.w.store(
        k.w.f.published(P.id, { categoryId: k.categoryIds[3] }),
      );
      expect(
        listingIdsIn(
          await read(k, {
            criteria: { areas: [PREFECTURE_A], categoryIds: [] },
          }),
        ),
      ).toEqual([otherInA.id, eatInA.id]);
      expect(
        listingIdsIn(
          await read(k, { criteria: { areas: [], categoryIds: [eat] } }),
        ),
      ).toEqual([eatInC.id, eatInA.id]);
    });

    it("readFeed#27 条件を選んで読んだ後 / 条件を空にして読む", async () => {
      const k = await discoveryKit();
      const { eat } = await fourListings(k);
      const narrowed = await read(k, {
        criteria: { areas: [PREFECTURE_A], categoryIds: [eat] },
      });
      expect(narrowed.listingCount).toBe(1);
      const out = await read(k);
      expect(out.listingCount).toBe(4);
      expect(out.effective).toEqual({ areas: [], categoryIds: [] });
    });

    it("readFeed#28 選択エリアに、条件に合う掲載を持つ店舗が所属する地域 R1 と、条件に合う掲載を持たない地域 R2 がある。開催場所が選択エリアにあるイベント E1、選択エリアの外のイベント E2、読みものがある / エリアとカテゴリーを選んで読む", async () => {
      const k = await discoveryKit();
      const [eat, buy] = k.categoryIds;
      if (eat === undefined || buy === undefined) throw new Error("categories");
      const inArea = { profile: { address: SampleAddress.umeda() } };
      const R1 = await k.w.region();
      const R2 = await k.w.region();
      const P1 = await k.w.place(inArea);
      await k.w.affiliate(P1.id, [R1.id]);
      await k.w.store(k.w.f.published(P1.id, { categoryId: eat }));
      const P2 = await k.w.place(inArea);
      await k.w.affiliate(P2.id, [R2.id]);
      await k.w.store(k.w.f.published(P2.id, { categoryId: buy }));
      for (let i = 0; i < 11; i += 1) {
        const P = await k.w.place(inArea);
        await k.w.store(k.w.f.published(P.id, { categoryId: eat }));
      }
      const E1 = await occasionWithParticipant(k, {
        address: SampleAddress.umeda(),
      });
      await occasionWithParticipant(k, { address: SampleAddress.ginza() });
      const A = await k.w.article();
      const out = await read(k, {
        criteria: { areas: [PREFECTURE_A], categoryIds: [eat] },
      });
      expect(framesIn(out)).toEqual([
        `region:${R1.id}`,
        `article:${A.id}`,
        `occasion:${E1.id}`,
      ]);
      expect(out.listingCount).toBe(12);
    });

    it("readFeed#29 条件に合うフィード対象の掲載がない。公開中の地域・読みもの・イベントはある / 条件を選んで読む", async () => {
      const k = await discoveryKit();
      const R = await k.w.region();
      await placeWithListing(k, {}, [R]);
      await k.w.article();
      await occasionWithParticipant(k);
      const out = await read(k, {
        criteria: { areas: [PREFECTURE_A], categoryIds: [] },
      });
      expect(out).toMatchObject({ items: [], listingCount: 0, hasMore: false });
    });

    it("readFeed#30 選んだカテゴリーの1つが廃止されている / そのカテゴリーと現役のカテゴリーを選んで読む", async () => {
      const k = await discoveryKit();
      const [eat, buy, experience] = k.categoryIds;
      if (eat === undefined || buy === undefined || experience === undefined) {
        throw new Error("categories");
      }
      const P = await k.w.place();
      const ofBuy = await k.w.store(k.w.f.published(P.id, { categoryId: buy }));
      await k.w.store(k.w.f.published(P.id, { categoryId: eat }));
      await k.retireCategory(experience, eat);
      const out = await read(k, {
        criteria: { areas: [], categoryIds: [experience, buy] },
      });
      expect(listingIdsIn(out)).toEqual([ofBuy.id]);
      expect(out.effective).toEqual({ areas: [], categoryIds: [buy] });
    });

    it("readFeed#31 カテゴリー K が廃止され、移行先は M。K が保存されたままの掲載がある / カテゴリー M を選んで読む", async () => {
      const k = await discoveryKit();
      const [M, , K] = k.categoryIds;
      if (M === undefined || K === undefined) throw new Error("categories");
      const P = await k.w.place();
      const ofK = await k.w.store(k.w.f.published(P.id, { categoryId: K }));
      const ofM = await k.w.store(k.w.f.published(P.id, { categoryId: M }));
      await k.retireCategory(K, M);
      const out = await read(k, { criteria: { areas: [], categoryIds: [M] } });
      expect(listingIdsIn(out)).toEqual([ofM.id, ofK.id]);
    });
  });

  describe("候補の読み直し", () => {
    /** 150 listings of place A, then an older b1 of place B beyond them. */
    async function pastTheFirstRead(k: DiscoveryKit) {
      const A = await k.w.place(locatedAt(north(100)));
      const B = await k.w.place(locatedAt(north(1_000)));
      const b1 = await k.w.available(B.id);
      const as: ListingId[] = [];
      for (let i = 0; i < 150; i += 1) as.push((await k.w.available(A.id)).id);
      return { b1: b1.id, newestA: as.reverse() };
    }

    it("readFeed#32 新しい順で、店舗 A の掲載 a1〜a150 の後に、別の店舗 B の掲載 b1（最も古い） / 1ページ20件で読む", async () => {
      const k = await discoveryKit();
      const { b1, newestA } = await pastTheFirstRead(k);
      const out = await read(k);
      expect(listingIdsIn(out)).toEqual([
        newestA[0],
        b1,
        ...newestA.slice(1, 19),
      ]);
      expect(out.listingCount).toBe(151);
    });

    it("readFeed#33 店舗 A（現在地から 100 m）の掲載 a1〜a150（a1 が最も新しい）と、店舗 B（1 km）の掲載 b1 / 現在地つきで、1ページ20件で読む", async () => {
      const k = await discoveryKit();
      const { b1, newestA } = await pastTheFirstRead(k);
      const out = await read(k, { origin: ORIGIN });
      expect(listingIdsIn(out)).toEqual([
        newestA[0],
        b1,
        ...newestA.slice(1, 19),
      ]);
      expect(out.listingCount).toBe(151);
    });

    it("readFeed#34 同じ店舗・同じ地域の掲載が混ざった、フィード対象の掲載が 250 件。枠の候補は、地域とイベントが1件ずつ / 1ページ20件で 1〜13 ページ目を読み、別に 1ページ100件で 1〜3 ページ目を読む", async () => {
      const k = await discoveryKit();
      const R = await k.w.region({ name: "谷中" });
      const places: Place[] = [];
      for (let i = 0; i < 10; i += 1) {
        const P = await k.w.place();
        if (i < 6) await k.w.affiliate(P.id, [R.id]);
        places.push(P);
      }
      for (const [i, P] of places.entries()) {
        const n = i === 0 ? 70 : 20;
        for (let j = 0; j < n; j += 1) await k.w.available(P.id);
      }
      await occasionWithParticipant(k);
      const small = [];
      for (let page = 1; page <= 13; page += 1) {
        small.push(await read(k, { pagination: { page, limit: 20 } }));
      }
      const large = [];
      for (let page = 1; page <= 3; page += 1) {
        large.push(await read(k, { pagination: { page, limit: 100 } }));
      }
      expect(small.flatMap((p) => labels(p))).toEqual(
        large.flatMap((p) => labels(p)),
      );
      expect(new Set(small.map((p) => p.listingCount))).toEqual(new Set([250]));
      const last = small[12];
      if (last === undefined) throw new Error("page 13");
      expect(listingIdsIn(last)).toHaveLength(10);
      expect(last.hasMore).toBe(false);
      expect(small.flatMap(framesIn)).toHaveLength(2);
    });
  });
});
