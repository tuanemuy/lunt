import { PERIODS } from "@repo/core/adapters/do/__conformance__/discoveryFixtures";
import { period } from "@repo/core/adapters/do/__conformance__/listingFixtures";
import type { SelectionScope } from "@repo/core/domain/discovery/selectionScope";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import {
  findSelectionCandidates,
  type SelectionCandidates,
} from "../findSelectionCandidates";
import { searchByKeyword } from "../searchByKeyword";
import { type DiscoveryKit, discoveryKit } from "./kit";

const find = (
  k: DiscoveryKit,
  scope: SelectionScope,
  keyword: string,
  pagination = { page: 1, limit: 10 },
) =>
  findSelectionCandidates({
    container: k.container,
    input: { scope, keyword, pagination },
  });

const PLACES: SelectionScope = { kind: "place", vacantOnly: false };
const VACANT_PLACES: SelectionScope = { kind: "place", vacantOnly: true };
const OCCASIONS: SelectionScope = { kind: "occasion", openOnly: false };
const OPEN_OCCASIONS: SelectionScope = { kind: "occasion", openOnly: true };

/** The candidates' target ids, whatever the kind. */
const idsOf = (candidates: SelectionCandidates): readonly string[] => {
  switch (candidates.kind) {
    case "place":
      return candidates.items.map((item) => item.summary.placeId);
    case "listing":
      return candidates.items.map((item) => item.listingId);
    case "region":
      return candidates.items.map((item) => item.regionId);
    case "occasion":
      return candidates.items.map((item) => item.occasionId);
  }
};

const placesOf = (candidates: SelectionCandidates) =>
  candidates.kind === "place" ? candidates.items : [];

const occasionsOf = (candidates: SelectionCandidates) =>
  candidates.kind === "occasion" ? candidates.items : [];

const listingsOf = (candidates: SelectionCandidates) =>
  candidates.kind === "listing" ? candidates.items : [];

describe("findSelectionCandidates", () => {
  it("findSelectionCandidates#1 名称に「港」を含む公開中の地域が2つと、公開を取り下げた地域が1つある / 範囲を region にして、「港」で探す", async () => {
    const k = await discoveryKit();
    const inName = await k.w.region({ name: "北の港町" });
    const exact = await k.w.region({ name: "港" });
    await k.w.region({ name: "港南", state: "unpublished" });
    const { candidates } = await find(k, { kind: "region" }, "港");
    expect(candidates.kind).toBe("region");
    expect(idsOf(candidates)).toEqual([exact.id, inName.id]);
    expect(candidates.count).toBe(2);
    expect(candidates.items[0]).toMatchObject({
      regionId: exact.id,
      name: "港",
    });
  });

  const marche = async (k: DiscoveryKit) => ({
    upcoming: await k.w.occasion({
      name: "朝のマルシェ",
      period: PERIODS.upcoming,
    }),
    ongoing: await k.w.occasion({
      name: "夜のマルシェ",
      period: PERIODS.ongoing,
    }),
    ended: await k.w.occasion({ name: "春のマルシェ", period: PERIODS.ended }),
    cancelled: await k.w.occasion({
      name: "冬のマルシェ",
      state: "cancelled",
    }),
  });

  it("findSelectionCandidates#2 名称に「マルシェ」を含む、開催前・開催中・終了・中止のイベントがある / 範囲を occasion（openOnly: false）にして、「マルシェ」で探す（AM-02 の紹介先）", async () => {
    const k = await discoveryKit();
    const all = await marche(k);
    const { candidates } = await find(k, OCCASIONS, "マルシェ");
    expect(candidates.count).toBe(4);
    const holding = new Map(
      occasionsOf(candidates).map((item) => [
        item.occasionId,
        item.standing.holding,
      ]),
    );
    expect(holding).toEqual(
      new Map([
        [all.upcoming.id, "upcoming"],
        [all.ongoing.id, "ongoing"],
        [all.ended.id, "ended"],
        [all.cancelled.id, "cancelled"],
      ]),
    );
  });

  it("findSelectionCandidates#3 上と同じ / 範囲を occasion（openOnly: true）にして、「マルシェ」で探す（RQ-06 の参加するイベント）", async () => {
    const k = await discoveryKit();
    const all = await marche(k);
    const { candidates } = await find(k, OPEN_OCCASIONS, "マルシェ");
    expect(candidates.count).toBe(2);
    expect(
      occasionsOf(candidates).map((item) => [
        item.occasionId,
        item.standing.holding,
      ]),
    ).toEqual([
      [all.ongoing.id, "ongoing"],
      [all.upcoming.id, "upcoming"],
    ]);
  });

  it("findSelectionCandidates#4 「マルシェ」に一致する開催前・開催中のイベントが7件、終了したイベントが5件ある / 範囲を occasion（openOnly: true）にして、1ページ5件で1ページ目と2ページ目を読む", async () => {
    const k = await discoveryKit();
    const open = [];
    for (let i = 0; i < 7; i += 1) {
      open.push(
        await k.w.occasion({
          name: "マルシェ",
          period: i % 2 === 0 ? PERIODS.upcoming : PERIODS.ongoing,
        }),
      );
    }
    for (let i = 0; i < 5; i += 1) {
      await k.w.occasion({ name: "マルシェ", period: PERIODS.ended });
    }
    const first = await find(k, OPEN_OCCASIONS, "マルシェ", {
      page: 1,
      limit: 5,
    });
    const second = await find(k, OPEN_OCCASIONS, "マルシェ", {
      page: 2,
      limit: 5,
    });
    expect(first.candidates.items).toHaveLength(5);
    expect(second.candidates.items).toHaveLength(2);
    expect(first.candidates.count).toBe(7);
    expect(second.candidates.count).toBe(7);
    const found = [...idsOf(first.candidates), ...idsOf(second.candidates)];
    expect([...found].sort()).toEqual(open.map((E) => E.id).sort());
  });

  it("findSelectionCandidates#5 名称に「桃」を含む、提供中・提供開始前・提供終了の掲載と、一時非公開の掲載がある / 範囲を listing にして、「桃」で探す", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const available = await k.w.store(k.w.f.published(P.id, { name: "桃" }));
    const upcoming = await k.w.store(
      k.w.f.published(P.id, {
        name: "桃",
        offering: period("2026-07-20", null),
      }),
    );
    const ended = await k.w.store(k.w.f.manuallyEnded(P.id, { name: "桃" }));
    await k.w.store(k.w.f.unpublished(P.id, { name: "桃" }));
    const { candidates } = await find(k, { kind: "listing" }, "桃");
    expect(candidates.count).toBe(3);
    const phases = new Map(
      listingsOf(candidates).map((item) => [
        item.listingId,
        item.standing.offering.phase,
      ]),
    );
    expect(phases).toEqual(
      new Map([
        [available.id, "available"],
        [upcoming.id, "upcoming"],
        [ended.id, "ended"],
      ]),
    );
  });

  const namedPlaces = async (k: DiscoveryKit) => ({
    yamada: await k.w.place({
      profile: { name: "山田珈琲店", address: SampleAddress.chiyoda() },
    }),
    umeda: await k.w.place({
      profile: { name: "梅田食堂", address: SampleAddress.ginza() },
    }),
  });

  it("findSelectionCandidates#6 店舗「山田珈琲店」（所在地は千代田区）と、店舗「梅田食堂」（所在地は中央区）がある / 範囲を place にして、「山田」で探す。別に「中央区」で探す", async () => {
    const k = await discoveryKit();
    const { yamada, umeda } = await namedPlaces(k);
    expect(idsOf((await find(k, PLACES, "山田")).candidates)).toEqual([
      yamada.id,
    ]);
    expect(idsOf((await find(k, PLACES, "中央区")).candidates)).toEqual([
      umeda.id,
    ]);
  });

  it("findSelectionCandidates#7 上と同じ / 範囲を place（vacantOnly: false）にして「山田」で探す。別に、searchByKeyword の店舗の種類を「山田」で読む", async () => {
    const k = await discoveryKit();
    await namedPlaces(k);
    await k.w.place({ profile: { name: "喫茶山田屋" } });
    await k.w.place({ profile: { name: "山田" } });
    const { candidates } = await find(k, PLACES, "山田");
    const { results } = await searchByKeyword({
      container: k.container,
      input: {
        keyword: "山田",
        kinds: "place",
        pagination: { page: 1, limit: 10 },
      },
    });
    expect(candidates.count).toBe(3);
    expect(idsOf(candidates)).toEqual(
      results.place?.items.map((item) => item.placeId),
    );
    expect(candidates.count).toBe(results.place?.count);
  });

  it("findSelectionCandidates#8 キーワードに一致する、休業中の店舗、閉店した店舗、非公開の店舗がある / 範囲を place にして探す", async () => {
    const k = await discoveryKit();
    const resting = await k.w.place({
      status: "temporarilyClosed",
      profile: { name: "山田商店" },
    });
    const closed = await k.w.place({
      status: "permanentlyClosed",
      profile: { name: "山田食堂" },
    });
    await k.w.place({ suspended: true, profile: { name: "山田酒店" } });
    const { candidates } = await find(k, PLACES, "山田");
    expect(candidates.count).toBe(2);
    expect(
      new Map(
        placesOf(candidates).map((item) => [
          item.summary.placeId,
          item.summary.standing.operating,
        ]),
      ),
    ).toEqual(
      new Map([
        [resting.id, "temporarilyClosed"],
        [closed.id, "permanentlyClosed"],
      ]),
    );
  });

  const stewardedAndVacant = async (k: DiscoveryKit) => {
    const stewarded = await k.w.place({ profile: { name: "山田商店" } });
    const vacant = await k.w.place({ profile: { name: "山田食堂" } });
    await k.appoint(stewarded.id, await k.person());
    return { stewarded, vacant };
  };

  it("findSelectionCandidates#9 キーワードに一致する、店舗管理者のいる店舗と、いない店舗がある / 範囲を place（vacantOnly: false）にして探す", async () => {
    const k = await discoveryKit();
    const { stewarded, vacant } = await stewardedAndVacant(k);
    const { candidates } = await find(k, PLACES, "山田");
    expect(
      new Map(
        placesOf(candidates).map((item) => [
          item.summary.placeId,
          item.placeIsVacant,
        ]),
      ),
    ).toEqual(
      new Map([
        [stewarded.id, false],
        [vacant.id, true],
      ]),
    );
  });

  it("findSelectionCandidates#10 上と同じ / 範囲を place（vacantOnly: true）にして探す（RQ-05 を DT-03 から開いたときの店舗、CM-04 の加える店舗）", async () => {
    const k = await discoveryKit();
    const { vacant } = await stewardedAndVacant(k);
    const { candidates } = await find(k, VACANT_PLACES, "山田");
    expect(idsOf(candidates)).toEqual([vacant.id]);
    expect(candidates.count).toBe(1);
    expect(placesOf(candidates)[0]?.placeIsVacant).toBe(true);
  });

  it("findSelectionCandidates#11 キーワードに一致する、店舗管理者のいない店舗 V1・V2 がある。V1 はイベント E にすでに参加中 / 範囲を place（vacantOnly: true）にして探す", async () => {
    const k = await discoveryKit();
    const V1 = await k.w.place({ profile: { name: "山田商店" } });
    const V2 = await k.w.place({ profile: { name: "山田食堂" } });
    const E = await k.w.occasion();
    await k.w.participate(E.id, V1.id);
    const { candidates } = await find(k, VACANT_PLACES, "山田");
    expect([...idsOf(candidates)].sort()).toEqual([V1.id, V2.id].sort());
  });

  it("findSelectionCandidates#12 キーワードに一致する写真のない店舗に、閲覧できる掲載がある / 範囲を place にして探す", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({ profile: { name: "山田商店" } });
    const L = await k.w.available(P.id);
    const { candidates, photos } = await find(k, PLACES, "山田");
    const cover = placesOf(candidates)[0]?.summary.cover;
    expect(cover).toEqual({
      source: "listing",
      listingId: L.id,
      photoId: L.content.photos.items[0]?.photoId,
      framing: L.content.photos.items[0]?.framing,
    });
    expect(Object.keys(photos)).toEqual([L.content.photos.items[0]?.photoId]);
  });

  it("findSelectionCandidates#13 キーワードに一致する対象が、その種類にない / 探す", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    await k.w.available(P.id);
    await k.w.region();
    await k.w.occasion();
    for (const scope of [
      PLACES,
      { kind: "listing" },
      { kind: "region" },
      OCCASIONS,
    ] as const) {
      const { candidates } = await find(k, scope, "該当なしの語");
      expect(candidates).toEqual({ kind: scope.kind, items: [], count: 0 });
    }
  });

  it("findSelectionCandidates#14 どの種類にも閲覧できる対象がある / 店舗・掲載・地域・イベントのそれぞれの範囲で、空のキーワード、または空白だけのキーワードで探す", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    await k.w.available(P.id);
    await k.w.region();
    await k.w.occasion();
    for (const scope of [
      PLACES,
      { kind: "listing" },
      { kind: "region" },
      OCCASIONS,
    ] as const) {
      for (const keyword of ["", "   ", "　"]) {
        const out = await find(k, scope, keyword);
        expect(out.candidates).toEqual({
          kind: scope.kind,
          items: [],
          count: 0,
        });
        expect(out.photos).toEqual({});
      }
    }
  });
});
