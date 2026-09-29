import { Address } from "@repo/core/domain/common/address";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import { Listing } from "@repo/core/domain/listing/listing";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { Place } from "@repo/core/domain/place/place";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import {
  authorityIds,
  insertStewardships,
  stewardshipOf,
  withoutSteward,
} from "./authorityFixtures";
import {
  type DiscoveryHarness,
  type DiscoveryHarnessFactory,
  discoveryWorld,
  PERIODS,
  TODAY,
} from "./discoveryFixtures";
import { day, period } from "./listingFixtures";
import { insertPlaces, newPlace, placeProfile } from "./placeFixtures";

type Page = Readonly<{ page: number; limit: number }>;

const PAGE: Page = { page: 1, limit: 10 };

const keyword = (text: string) => SearchKeyword.create(text);

/** An address in 港区 (its `Address.text` contains 「港」). */
const minatoAddress = () =>
  Address.of(
    {
      areaCode: AreaCode.create("1050011"),
      prefecture: "東京都",
      municipality: "港区",
      town: "芝公園",
    },
    "4-2",
  );

/** Ids and relevances of a page, for order checks. */
const ranked = <T>(
  page: Readonly<{
    items: readonly Readonly<{ entry: T; relevance: number }>[];
  }>,
  idOf: (entry: T) => string,
) => page.items.map((item) => [idOf(item.entry), item.relevance] as const);

const placeIdOf = (entry: Readonly<{ place: Place }>) => entry.place.id;
const listingIdOf = (entry: Readonly<{ listing: Listing }>) => entry.listing.id;
const idOf = (entry: Readonly<{ id: string }>) => entry.id;

const idsOf = <T>(
  page: Readonly<{ items: readonly Readonly<{ entry: T }>[] }>,
  id: (entry: T) => string,
) => page.items.map((item) => id(item.entry));

/**
 * `KeywordSearchQueries` contract
 * (`spec/testcases/ports/keywordSearchQueries.md`). Stage 3a implements
 * places, listings, regions and occasions; rows that need articles
 * (`searchArticles`) stay `todo` until stage 5, each with an extra test of
 * the same rule over the four kinds.
 */
export function describeKeywordSearchQueriesContract(
  makeHarness: DiscoveryHarnessFactory,
): void {
  describe("KeywordSearchQueries contract", () => {
    const setup = async () => {
      const h = await makeHarness();
      return { h, w: discoveryWorld(h) };
    };

    const places = (
      h: DiscoveryHarness,
      text: string,
      options: Readonly<{ vacantOnly?: boolean; pagination?: Page }> = {},
    ) =>
      h.keywordSearchQueries.searchPlaces(
        { keyword: keyword(text), vacantOnly: options.vacantOnly ?? false },
        options.pagination ?? PAGE,
      );

    const listings = (h: DiscoveryHarness, text: string, pagination = PAGE) =>
      h.keywordSearchQueries.searchListings(keyword(text), pagination);

    const regions = (h: DiscoveryHarness, text: string, pagination = PAGE) =>
      h.keywordSearchQueries.searchRegions(keyword(text), pagination);

    const occasions = (
      h: DiscoveryHarness,
      text: string,
      options: Readonly<{
        openOnly?: boolean;
        today?: LocalDate;
        pagination?: Page;
      }> = {},
    ) =>
      h.keywordSearchQueries.searchOccasions(
        {
          keyword: keyword(text),
          openOnly: options.openOnly ?? false,
          today: options.today ?? TODAY,
        },
        options.pagination ?? PAGE,
      );

    const named = (w: ReturnType<typeof discoveryWorld>, name: string) =>
      w.place({ profile: { name } });

    /** Pages 1–3 of 3 each: their sizes, counts and ids in order. */
    const threePages = async <T>(
      read: (
        pagination: Page,
      ) => Promise<
        Readonly<{ items: readonly Readonly<{ entry: T }>[]; count: number }>
      >,
      id: (entry: T) => string,
    ) => {
      const pages = [
        await read({ page: 1, limit: 3 }),
        await read({ page: 2, limit: 3 }),
        await read({ page: 3, limit: 3 }),
      ];
      return {
        sizes: pages.map((p) => p.items.length),
        counts: pages.map((p) => p.count),
        ids: pages.flatMap((p) => idsOf(p, id)),
      };
    };

    describe("一致と関連度", () => {
      it("keywordSearchQueries#1 店舗「山田」「山田珈琲店」「喫茶山田屋」、紹介にだけ「山田」を含む店舗「海の家」、どこにも「山田」を含まない店舗「港食堂」。どの所在地も「山田」を含まない / 「山田」で searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        const exact = await named(w, "山田");
        const prefix = await named(w, "山田珈琲店");
        const inside = await named(w, "喫茶山田屋");
        await w.place({
          profile: { name: "海の家", description: "山田さんの店" },
        });
        await named(w, "港食堂");
        const page = await places(h, "山田");
        expect(ranked(page, placeIdOf)).toEqual([
          [exact.id, 4],
          [prefix.id, 3],
          [inside.id, 2],
        ]);
        expect(page.count).toBe(3);
      });

      it("keywordSearchQueries#2 所在地（Address.text）にだけ「銀座」を含む店舗 P と、名称が「銀座食堂」で所在地にも「銀座」を含む店舗 Q / 「銀座」で searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place({
          profile: { name: "港食堂", address: SampleAddress.ginza() },
        });
        const Q = await w.place({
          profile: { name: "銀座食堂", address: SampleAddress.ginza() },
        });
        expect(ranked(await places(h, "銀座"), placeIdOf)).toEqual([
          [Q.id, 3],
          [P.id, 1],
        ]);
      });

      it("keywordSearchQueries#3 名称が「CAFE Lunt」の店舗 / 「cafe」で searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await named(w, "CAFE Lunt");
        expect(ranked(await places(h, "cafe"), placeIdOf)).toEqual([[P.id, 3]]);
      });

      it("keywordSearchQueries#4 掲載「山田の桃」（説明に「直売」を含む）と、掲載「山田のぶどう」（「直売」をどこにも含まない） / 「山田 直売」で searchListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const peach = await w.store(
          w.f.published(P.id, { name: "山田の桃", description: "農園の直売" }),
        );
        await w.store(
          w.f.published(P.id, { name: "山田のぶどう", description: "甘い" }),
        );
        expect(ranked(await listings(h, "山田 直売"), listingIdOf)).toEqual([
          [peach.id, 4],
        ]);
      });

      it("keywordSearchQueries#5 名称が「山田珈琲」の店舗と「珈琲山田」の店舗 / 「山田 珈琲」で searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        const a = await named(w, "山田珈琲");
        const b = await named(w, "珈琲山田");
        const page = await places(h, "山田 珈琲");
        expect(page.items.map((item) => item.relevance)).toEqual([5, 5]);
        expect([...idsOf(page, placeIdOf)].sort()).toEqual([a.id, b.id].sort());
      });

      it("keywordSearchQueries#6 名称が「桃」の掲載と、説明にだけ「桃」を含む掲載 / 「桃」で searchListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const inDescription = await w.store(
          w.f.published(P.id, { name: "果物", description: "桃の季節" }),
        );
        const exact = await w.store(w.f.published(P.id, { name: "桃" }));
        expect(ranked(await listings(h, "桃"), listingIdOf)).toEqual([
          [exact.id, 4],
          [inDescription.id, 1],
        ]);
      });

      it("keywordSearchQueries#7 名称・キャッチコピー・紹介・所在地のそれぞれにだけ「港」を含む地域が1つずつ / 「港」で searchRegions を呼ぶ", async () => {
        const { h, w } = await setup();
        const inName = await w.region({ name: "港町" });
        const inTagline = await w.region({ content: { tagline: "港の風" } });
        const inDescription = await w.region({
          content: { description: "港のそば" },
        });
        const inAddress = await w.region({
          content: { address: minatoAddress() },
        });
        const page = await regions(h, "港");
        expect(ranked(page, idOf)[0]).toEqual([inName.id, 3]);
        expect(page.items.slice(1).map((item) => item.relevance)).toEqual([
          1, 1, 1,
        ]);
        expect([...idsOf(page, idOf)].slice(1).sort()).toEqual(
          [inTagline.id, inDescription.id, inAddress.id].sort(),
        );
      });

      it("keywordSearchQueries#8 キャッチコピーを持たない地域 / その地域のどこにもない語で searchRegions を呼ぶ", async () => {
        const { h, w } = await setup();
        const R = await w.region({ content: { tagline: null } });
        expect(R.content.tagline).toBeNull();
        expect(await regions(h, "どこにもない語")).toEqual({
          items: [],
          count: 0,
        });
      });

      it("keywordSearchQueries#9 名称・キャッチコピー・紹介・開催場所の所在地のそれぞれにだけ「港」を含むイベントが1つずつ / 「港」で searchOccasions を呼ぶ", async () => {
        const { h, w } = await setup();
        const inName = await w.occasion({ name: "港まつり" });
        const inTagline = await w.occasion({ tagline: "港の祭り" });
        const inDescription = await w.occasion({ description: "港で開く" });
        const inAddress = await w.occasion({ address: minatoAddress() });
        const page = await occasions(h, "港");
        expect(ranked(page, idOf)[0]).toEqual([inName.id, 3]);
        expect(page.items.slice(1).map((item) => item.relevance)).toEqual([
          1, 1, 1,
        ]);
        expect([...idsOf(page, idOf)].slice(1).sort()).toEqual(
          [inTagline.id, inDescription.id, inAddress.id].sort(),
        );
      });

      it.todo(
        "keywordSearchQueries#10 タイトルに「港」を含む読みものと、本文にだけ「港」を含む読みもの / 「港」で searchArticles を呼ぶ",
      ); // S5
      it("keywordSearchQueries#11 店舗の名称と、その店舗の掲載の名称が、どちらも「山田」を含む / 「山田」で searchPlaces と searchListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await named(w, "山田商店");
        const L = await w.store(w.f.published(P.id, { name: "山田の桃" }));
        expect(idsOf(await places(h, "山田"), placeIdOf)).toEqual([P.id]);
        expect(idsOf(await listings(h, "山田"), listingIdOf)).toEqual([L.id]);
      });

      it.todo(
        "keywordSearchQueries#12 どの対象にも含まれない語 / 5つのメソッドをそれぞれ呼ぶ",
      ); // S5

      it("a keyword whose terms NFKC expands past 100 characters is searched in every kind, not refused", async () => {
        const { h, w } = await setup();
        const long = "株式会社".repeat(30);
        const P = await named(w, "山田商店");
        const L = await w.store(
          w.f.published(P.id, { name: "社名", description: long }),
        );
        const R = await w.region({ content: { description: long } });
        const E = await w.occasion({ description: long });
        const text = "㍿".repeat(30);
        expect(keyword(text).terms.join("").length).toBeGreaterThan(100);
        expect(await places(h, text)).toEqual({ items: [], count: 0 });
        expect(idsOf(await listings(h, text), listingIdOf)).toEqual([L.id]);
        expect(idsOf(await regions(h, text), idOf)).toEqual([R.id]);
        expect(idsOf(await occasions(h, text), idOf)).toEqual([E.id]);
      });

      it("a word no target holds finds nothing in the four stage-3a kinds (#12 without searchArticles)", async () => {
        const { h, w } = await setup();
        const P = await named(w, "山田商店");
        await w.available(P.id);
        await w.region();
        await w.occasion();
        const none = { items: [], count: 0 };
        expect(await places(h, "該当なし")).toEqual(none);
        expect(await listings(h, "該当なし")).toEqual(none);
        expect(await regions(h, "該当なし")).toEqual(none);
        expect(await occasions(h, "該当なし")).toEqual(none);
      });
    });

    describe("対象の範囲", () => {
      it("keywordSearchQueries#13 キーワードに一致する、休業中の店舗と閉店した店舗 / searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        const resting = await w.place({
          status: "temporarilyClosed",
          profile: { name: "山田商店" },
        });
        const closed = await w.place({
          status: "permanentlyClosed",
          profile: { name: "山田食堂" },
        });
        expect([...idsOf(await places(h, "山田"), placeIdOf)].sort()).toEqual(
          [resting.id, closed.id].sort(),
        );
      });

      it("keywordSearchQueries#14 キーワードに一致する、非公開の店舗 / searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        await w.place({ suspended: true, profile: { name: "山田商店" } });
        expect(await places(h, "山田")).toEqual({ items: [], count: 0 });
      });

      it("keywordSearchQueries#15 キーワードに一致する写真のない店舗 P に、published の掲載がある。写真のない店舗 Q には、閲覧できる掲載がない / searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await named(w, "山田商店");
        const L = await w.available(P.id);
        const Q = await named(w, "山田食堂");
        await w.draft(Q.id);
        const page = await places(h, "山田");
        const byId = new Map(
          page.items.map((item) => [item.entry.place.id, item]),
        );
        expect(byId.get(P.id)?.entry).toEqual(w.entryOf(P, [L]));
        expect(byId.get(P.id)?.entry.substituteCover).toEqual({
          listingId: L.id,
          photo: L.content.photos.items[0],
        });
        expect(byId.get(Q.id)?.entry.substituteCover).toBeNull();
      });

      it("keywordSearchQueries#16 キーワードに一致する店舗が、公開中の地域 X・Y にこの順に所属し、代表地域は Y。unpublished の地域 Z にも所属している / searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await named(w, "山田商店");
        const X = await w.region();
        const Y = await w.region();
        const Z = await w.region({ state: "unpublished" });
        const affiliations = await w.affiliate(P.id, [X.id, Y.id, Z.id], Y.id);
        const [hit] = (await places(h, "山田")).items;
        expect(hit?.entry.regions).toEqual([Y, X]);
        expect(hit?.entry).toEqual(
          w.entryOf(P, [], { affiliations, regions: [X, Y, Z] }),
        );
      });

      it("keywordSearchQueries#17 キーワードに一致する、提供開始前の掲載、期日で提供終了の掲載、管理する人が提供終了にした掲載、閉店した店舗の掲載 / searchListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const open = await w.place();
        const closed = await w.place({ status: "permanentlyClosed" });
        const hits = [
          await w.store(
            w.f.published(open.id, {
              name: "桃",
              offering: period("2026-07-20", null),
            }),
          ),
          await w.store(
            w.f.published(open.id, {
              name: "桃",
              offering: period(null, "2026-07-01"),
            }),
          ),
          await w.store(w.f.manuallyEnded(open.id, { name: "桃" })),
          await w.store(w.f.published(closed.id, { name: "桃" })),
        ];
        const page = await listings(h, "桃");
        expect([...idsOf(page, listingIdOf)].sort()).toEqual(
          hits.map((listing) => listing.id).sort(),
        );
      });

      it("keywordSearchQueries#18 キーワードに一致する、draft・unpublished・運営による非公開の掲載、非公開の店舗の published の掲載、delete した掲載 / searchListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const hidden = await w.place({ suspended: true });
        await w.store(w.f.draft(P.id, { name: "桃" }));
        await w.store(w.f.unpublished(P.id, { name: "桃" }));
        await w.store(w.f.suspended(w.f.published(P.id, { name: "桃" })));
        await w.store(w.f.published(hidden.id, { name: "桃" }));
        const deleted = await w.store(w.f.published(P.id, { name: "桃" }));
        await w.deleteListing(deleted);
        expect(await listings(h, "桃")).toEqual({ items: [], count: 0 });
      });

      it("keywordSearchQueries#19 キーワードに一致する、draft・unpublished・運営による非公開の地域 / searchRegions を呼ぶ", async () => {
        const { h, w } = await setup();
        for (const state of ["draft", "unpublished", "suspended"] as const) {
          await w.region({ state, name: "港町" });
        }
        expect(await regions(h, "港")).toEqual({ items: [], count: 0 });
      });

      it("keywordSearchQueries#20 キーワードに一致する、開催前・開催中・終了・中止のイベント / searchOccasions を呼ぶ", async () => {
        const { h, w } = await setup();
        const all = [
          await w.occasion({ name: "マルシェ", period: PERIODS.upcoming }),
          await w.occasion({ name: "マルシェ", period: PERIODS.ongoing }),
          await w.occasion({ name: "マルシェ", period: PERIODS.ended }),
          await w.occasion({ name: "マルシェ", state: "cancelled" }),
        ];
        expect([...idsOf(await occasions(h, "マルシェ"), idOf)].sort()).toEqual(
          all.map((E) => E.id).sort(),
        );
      });

      it("keywordSearchQueries#21 キーワードに一致する、draft・unpublished・運営による非公開のイベント / searchOccasions を呼ぶ", async () => {
        const { h, w } = await setup();
        for (const state of ["draft", "unpublished", "suspended"] as const) {
          await w.occasion({ state, name: "マルシェ" });
        }
        expect(await occasions(h, "マルシェ")).toEqual({ items: [], count: 0 });
      });

      it.todo(
        "keywordSearchQueries#22 キーワードに一致する、draft と unpublished の読みもの / searchArticles を呼ぶ",
      ); // S5
    });

    describe("候補の範囲", () => {
      it("keywordSearchQueries#23 キーワードに一致する、店舗管理者のいる店舗 P1、管理体制の保存がない店舗 P2、最後の店舗管理者が辞任して vacant になった店舗 P3 / vacantOnly: true で searchPlaces を呼ぶ。別に vacantOnly: false で呼ぶ", async () => {
        const { h, w } = await setup();
        const ids = authorityIds();
        const P1 = await named(w, "山田商店");
        const P2 = await named(w, "山田食堂");
        const P3 = await named(w, "山田酒店");
        const steward = ids.person();
        const leaving = ids.person();
        await insertStewardships(
          h,
          stewardshipOf(ids, { kind: "place", id: P1.id }, [steward]),
          withoutSteward(
            stewardshipOf(ids, { kind: "place", id: P3.id }, [leaving]),
            leaving,
            ids.tick(),
          ),
        );
        const vacant = await places(h, "山田", { vacantOnly: true });
        expect([...idsOf(vacant, placeIdOf)].sort()).toEqual(
          [P2.id, P3.id].sort(),
        );
        expect(vacant.count).toBe(2);
        const all = await places(h, "山田", { vacantOnly: false });
        expect(all.count).toBe(3);
      });

      it("keywordSearchQueries#24 キーワードに一致する、管理者のいない店舗が5件と、店舗管理者のいる店舗が3件 / vacantOnly: true・limit: 3 で page: 1・page: 2 を呼ぶ", async () => {
        const { h, w } = await setup();
        const ids = authorityIds();
        const vacant = [];
        for (let i = 0; i < 5; i += 1) vacant.push(await named(w, `山田${i}`));
        for (let i = 0; i < 3; i += 1) {
          const place = await named(w, `山田屋${i}`);
          await insertStewardships(
            h,
            stewardshipOf(ids, { kind: "place", id: place.id }, [ids.person()]),
          );
        }
        const first = await places(h, "山田", {
          vacantOnly: true,
          pagination: { page: 1, limit: 3 },
        });
        const second = await places(h, "山田", {
          vacantOnly: true,
          pagination: { page: 2, limit: 3 },
        });
        expect([first.items.length, second.items.length]).toEqual([3, 2]);
        expect([first.count, second.count]).toEqual([5, 5]);
        expect(
          [...idsOf(first, placeIdOf), ...idsOf(second, placeIdOf)].sort(),
        ).toEqual(vacant.map((place) => place.id).sort());
      });

      it("keywordSearchQueries#25 キーワードに一致する、管理者のいない非公開の店舗 / vacantOnly: true で searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        await w.place({ suspended: true, profile: { name: "山田商店" } });
        expect(await places(h, "山田", { vacantOnly: true })).toEqual({
          items: [],
          count: 0,
        });
      });

      it("keywordSearchQueries#26 キーワードに一致する、開催前・開催中・終了・中止のイベント / openOnly: true で searchOccasions を呼ぶ", async () => {
        const { h, w } = await setup();
        const upcoming = await w.occasion({
          name: "マルシェ",
          period: PERIODS.upcoming,
        });
        const ongoing = await w.occasion({
          name: "マルシェ",
          period: PERIODS.ongoing,
        });
        await w.occasion({ name: "マルシェ", period: PERIODS.ended });
        await w.occasion({ name: "マルシェ", state: "cancelled" });
        const page = await occasions(h, "マルシェ", { openOnly: true });
        expect([...idsOf(page, idOf)].sort()).toEqual(
          [upcoming.id, ongoing.id].sort(),
        );
        expect(page.count).toBe(2);
      });

      it("keywordSearchQueries#27 キーワードに一致するイベントの開催期間の終了日が D / today を D にして、openOnly: true で呼ぶ。別に、today を D の翌日にして呼ぶ", async () => {
        const { h, w } = await setup();
        const E = await w.occasion({
          name: "マルシェ",
          period: ["2026-05-01", "2026-05-10"],
        });
        const onD = await occasions(h, "マルシェ", {
          openOnly: true,
          today: day("2026-05-10"),
        });
        const after = await occasions(h, "マルシェ", {
          openOnly: true,
          today: day("2026-05-11"),
        });
        expect(idsOf(onD, idOf)).toEqual([E.id]);
        expect(after).toEqual({ items: [], count: 0 });
      });
    });

    describe("並び順とページング", () => {
      it("keywordSearchQueries#28 relevance が同じ店舗 P1・P2 の registeredAt が T1 < T2 / searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        const P1 = newPlace(
          w.f.place(),
          { name: "山田商店" },
          new Date("2026-09-01T00:00:00Z"),
        );
        const P2 = newPlace(
          w.f.place(),
          { name: "山田食堂" },
          new Date("2026-09-02T00:00:00Z"),
        );
        await insertPlaces(h, P1, P2);
        expect(idsOf(await places(h, "山田"), placeIdOf)).toEqual([
          P2.id,
          P1.id,
        ]);
      });

      it("keywordSearchQueries#29 relevance も registeredAt も同じ店舗が2つ / searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        const first = await named(w, "山田商店");
        const second = await named(w, "山田食堂");
        expect(first.registeredAt).toEqual(second.registeredAt);
        expect(idsOf(await places(h, "山田"), placeIdOf)).toEqual([
          first.id,
          second.id,
        ]);
      });

      it("keywordSearchQueries#30 relevance が同じ掲載 L1・L2 の firstPublishedAt が T1 < T2。relevance の高い掲載 L0 の firstPublishedAt は最も古い / searchListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L0 = await w.store(w.f.published(P.id, { name: "桃" }));
        const L1 = await w.store(w.f.published(P.id, { name: "桃ジャム" }));
        const L2 = await w.store(w.f.published(P.id, { name: "桃タルト" }));
        expect(idsOf(await listings(h, "桃"), listingIdOf)).toEqual([
          L0.id,
          L2.id,
          L1.id,
        ]);
      });

      it.todo(
        "keywordSearchQueries#31 relevance が同じ地域・イベント・読みものが、それぞれ firstPublishedAt の違う2つずつ / searchRegions・searchOccasions・searchArticles を呼ぶ",
      ); // S5
      it("keywordSearchQueries#32 一致する掲載が1件 / searchListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.store(w.f.published(P.id, { name: "桃" }));
        const page = await listings(h, "桃");
        expect(idsOf(page, listingIdOf)).toEqual([L.id]);
        expect(page.count).toBe(1);
      });

      it("keywordSearchQueries#33 一致する掲載が3件 / page: 1・limit: 3 で呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        for (let i = 0; i < 3; i += 1) {
          await w.store(w.f.published(P.id, { name: "桃" }));
        }
        const page = await listings(h, "桃", { page: 1, limit: 3 });
        expect(page.items).toHaveLength(3);
        expect(page.count).toBe(3);
      });

      it("keywordSearchQueries#34 一致する掲載が5件 / limit: 3 で page: 1・page: 2・page: 3 を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const all = [];
        for (let i = 0; i < 5; i += 1) {
          all.push(await w.store(w.f.published(P.id, { name: "桃" })));
        }
        const read = await threePages(
          (pagination) => listings(h, "桃", pagination),
          listingIdOf,
        );
        expect(read.sizes).toEqual([3, 2, 0]);
        expect(read.counts).toEqual([5, 5, 5]);
        expect(read.ids).toEqual(all.map((listing) => listing.id).reverse());
      });

      it("keywordSearchQueries#35 一致する店舗が5件、掲載が2件 / searchPlaces を page: 2・limit: 3、searchListings を page: 1・limit: 3 で呼ぶ", async () => {
        const { h, w } = await setup();
        for (let i = 0; i < 5; i += 1) await named(w, `山田${i}`);
        const P = await named(w, "港食堂");
        for (let i = 0; i < 2; i += 1) {
          await w.store(w.f.published(P.id, { name: "山田の桃" }));
        }
        const placePage = await places(h, "山田", {
          pagination: { page: 2, limit: 3 },
        });
        const listingPage = await listings(h, "山田", { page: 1, limit: 3 });
        expect(placePage.items).toHaveLength(2);
        expect(placePage.count).toBe(5);
        expect(listingPage.items).toHaveLength(2);
        expect(listingPage.count).toBe(2);
      });

      it.todo(
        "keywordSearchQueries#36 一致する店舗・地域・イベント・読みものが、それぞれ5件 / searchPlaces・searchRegions・searchOccasions・searchArticles を、limit: 3 で page: 1・page: 2・page: 3 と呼ぶ",
      ); // S5

      it("regions and occasions of equal relevance come newest first — occasions too, not by holding period (#31 without articles)", async () => {
        const { h, w } = await setup();
        const olderRegion = await w.region({ name: "港町" });
        const newerRegion = await w.region({ name: "港南" });
        const olderOccasion = await w.occasion({
          name: "港まつり",
          period: ["2026-07-15", "2026-07-16"],
        });
        const newerOccasion = await w.occasion({
          name: "港フェス",
          period: ["2026-07-30", "2026-07-31"],
        });
        expect(idsOf(await regions(h, "港"), idOf)).toEqual([
          newerRegion.id,
          olderRegion.id,
        ]);
        expect(idsOf(await occasions(h, "港"), idOf)).toEqual([
          newerOccasion.id,
          olderOccasion.id,
        ]);
      });

      it("places, regions and occasions page 3, 2, then none of 5 (#36 without searchArticles)", async () => {
        const { h, w } = await setup();
        const all = {
          places: [] as string[],
          regions: [] as string[],
          occasions: [] as string[],
        };
        for (let i = 0; i < 5; i += 1) {
          all.places.push((await named(w, "港食堂")).id);
          all.regions.push((await w.region({ name: "港町" })).id);
          all.occasions.push((await w.occasion({ name: "港まつり" })).id);
        }
        const reads = [
          [
            await threePages(
              (pagination) => places(h, "港", { pagination }),
              placeIdOf,
            ),
            all.places,
          ],
          [
            await threePages(
              (pagination) => regions(h, "港", pagination),
              idOf,
            ),
            all.regions,
          ],
          [
            await threePages(
              (pagination) => occasions(h, "港", { pagination }),
              idOf,
            ),
            all.occasions,
          ],
        ] as const;
        for (const [read, ids] of reads) {
          expect(read.sizes).toEqual([3, 2, 0]);
          expect(read.counts).toEqual([5, 5, 5]);
          expect([...read.ids].sort()).toEqual([...ids].sort());
          expect(new Set(read.ids).size).toBe(5);
        }
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("keywordSearchQueries#37 名称が「港食堂」の店舗 / 名称を「山田食堂」に更新して save してコミットし、直後に「山田」と「港」で searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await named(w, "港食堂");
        await w.updatePlace(
          P,
          (stored) =>
            Place.updateProfile(
              stored,
              placeProfile({ name: "山田食堂" }),
              w.f.tick(),
            ).entity,
        );
        expect(idsOf(await places(h, "山田"), placeIdOf)).toEqual([P.id]);
        expect(await places(h, "港")).toEqual({ items: [], count: 0 });
      });

      it("keywordSearchQueries#38 キーワードに一致する published の掲載 L / unpublish した L を save してコミットし、直後に searchListings を呼ぶ。続けて、publish して save してコミットし、もう一度呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.store(w.f.published(P.id, { name: "桃" }));
        await w.updateListing(
          L,
          (s) => Listing.unpublish(s, w.f.tick()).entity,
        );
        expect(await listings(h, "桃")).toEqual({ items: [], count: 0 });
        await w.updateListing(L, (s) => Listing.publish(s, w.f.tick()).entity);
        expect(idsOf(await listings(h, "桃"), listingIdOf)).toEqual([L.id]);
      });

      it("keywordSearchQueries#39 キーワードに一致する掲載を持つ店舗 P / P を非公開にして save してコミットし、直後に searchPlaces・searchListings を呼ぶ", async () => {
        const { h, w } = await setup();
        const P = await named(w, "山田商店");
        await w.store(w.f.published(P.id, { name: "山田の桃" }));
        await w.suspendPlace(P);
        expect(await places(h, "山田")).toEqual({ items: [], count: 0 });
        expect(await listings(h, "山田")).toEqual({ items: [], count: 0 });
      });

      it.todo(
        "keywordSearchQueries#40 キーワードに一致する draft の地域・イベント・読みもの（公開条件を満たす） / それぞれ publish して save してコミットし、直後に searchRegions・searchOccasions・searchArticles を呼ぶ",
      ); // S5
      it("keywordSearchQueries#41 キーワードに一致する draft の掲載 L / UnitOfWork の中で、publish した L を save した後に、fn が例外を投げる", async () => {
        const { h, w } = await setup();
        const P = await w.place();
        const L = await w.store(w.f.draft(P.id, { name: "桃" }));
        await expect(
          h.uow.run(async ({ listingRepository }) => {
            const read = await listingRepository.findById(L.id);
            if (read === null) throw new Error("missing");
            await listingRepository.save(
              Listing.publish(read.entity, w.f.tick()).entity,
              read.expectedVersion,
            );
            throw new Error("abort");
          }),
        ).rejects.toThrow("abort");
        expect(await listings(h, "桃")).toEqual({ items: [], count: 0 });
      });

      it("keywordSearchQueries#42 キーワードに一致する、管理者のいない店舗 P / 管理権限の申請の承認で P に店舗管理者を置き、StewardshipRepository に保存してコミットし、直後に vacantOnly: true で searchPlaces を呼ぶ", async () => {
        const { h, w } = await setup();
        const ids = authorityIds();
        const P = await named(w, "山田商店");
        expect(
          idsOf(await places(h, "山田", { vacantOnly: true }), placeIdOf),
        ).toEqual([P.id]);
        await insertStewardships(
          h,
          stewardshipOf(ids, { kind: "place", id: P.id }, [ids.person()]),
        );
        expect(await places(h, "山田", { vacantOnly: true })).toEqual({
          items: [],
          count: 0,
        });
      });

      it("a draft region and occasion published and committed show at once (#40 without articles)", async () => {
        const { h, w } = await setup();
        const R = await w.region({ state: "draft", name: "港町" });
        const E = await w.occasion({ state: "draft", name: "港まつり" });
        await w.updateRegion(R, (s) => Region.publish(s, w.f.tick()).entity);
        await w.updateOccasion(
          E,
          (s) => Occasion.publish(s, w.f.tick()).entity,
        );
        expect(idsOf(await regions(h, "港"), idOf)).toEqual([R.id]);
        expect(idsOf(await occasions(h, "港"), idOf)).toEqual([E.id]);
      });
    });
  });
}
