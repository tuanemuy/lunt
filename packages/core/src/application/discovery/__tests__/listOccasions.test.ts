import { PERIODS } from "@repo/core/adapters/durableObject/__conformance__/discoveryFixtures";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import { listOccasions } from "../listOccasions";
import { type DiscoveryKit, discoveryKit } from "./kit";

const list = (k: DiscoveryKit, pagination = { page: 1, limit: 10 }) =>
  listOccasions({ container: k.container, input: { pagination } });

const occasionIds = (out: Awaited<ReturnType<typeof list>>) =>
  out.items.map((summary) => summary.occasionId);

describe("listOccasions", () => {
  it("listOccasions#1 開催期間の開始が 5/1 のイベント E1、4/20 のイベント E2（開催中）、5/1 開始で終了が E1 より早いイベント E3 が、どれも公開中 / 読む", async () => {
    const k = await discoveryKit({ start: "2026-04-25T03:00:00.000Z" });
    const E1 = await k.w.occasion({ period: ["2026-05-01", "2026-05-06"] });
    const E2 = await k.w.occasion({
      period: ["2026-04-20", "2026-05-10"],
      tagline: "春の市",
    });
    const E3 = await k.w.occasion({ period: ["2026-05-01", "2026-05-03"] });
    const out = await list(k);
    expect(occasionIds(out)).toEqual([E2.id, E3.id, E1.id]);
    expect(out.count).toBe(3);
    expect(out.items[0]).toEqual({
      occasionId: E2.id,
      cover: {
        source: "own",
        photoId: E2.content.photos.items[0]?.photoId,
        framing: null,
      },
      name: E2.content.name,
      tagline: "春の市",
      period: E2.content.period,
      venue: E2.content.venue,
      standing: { kind: "occasion", holding: "ongoing" },
    });
    expect(out.items[1]?.standing).toEqual({
      kind: "occasion",
      holding: "upcoming",
    });
    expect(Object.keys(out.photos).sort()).toEqual(
      [E1, E2, E3].map((e) => e.content.photos.items[0]?.photoId).sort(),
    );
  });

  it("listOccasions#2 参加店舗を持たない開催前のイベントと、参加に添えた掲載が提供開始前だけの開催前のイベントがある / 読む", async () => {
    const k = await discoveryKit();
    const lonely = await k.w.occasion({ period: PERIODS.upcoming });
    const withUpcoming = await k.w.occasion({ period: PERIODS.upcoming });
    const P = await k.w.place();
    const L = await k.w.upcoming(P.id);
    await k.w.participate(withUpcoming.id, P.id, { listingIds: [L.id] });
    const out = await list(k);
    expect(occasionIds(out)).toEqual([lonely.id, withUpcoming.id]);
    expect(out.items.map((summary) => summary.standing)).toEqual([
      { kind: "occasion", holding: "upcoming" },
      { kind: "occasion", holding: "upcoming" },
    ]);
  });

  it("listOccasions#3 終了したイベントと、中止のイベントがある / 読む", async () => {
    const k = await discoveryKit();
    await k.w.occasion({ period: PERIODS.ended });
    await k.w.occasion({ state: "cancelled" });
    const open = await k.w.occasion({ period: PERIODS.ongoing });
    expect(occasionIds(await list(k))).toEqual([open.id]);
  });

  it("listOccasions#4 下書き、公開の取り下げ、運営による非公開のイベントがある / 読む", async () => {
    const k = await discoveryKit();
    await k.w.occasion({ state: "draft" });
    await k.w.occasion({ state: "unpublished" });
    await k.w.occasion({ state: "suspended" });
    expect(await list(k)).toEqual({ items: [], count: 0, photos: {} });
  });

  it("listOccasions#5 開催場所が選択中のエリアの外にあるイベントがある / 読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion({ address: SampleAddress.umeda() });
    expect(occasionIds(await list(k))).toEqual([E.id]);
  });

  it("listOccasions#6 イベントが、1ページの件数より多い / 1ページ目と2ページ目を読む", async () => {
    const k = await discoveryKit();
    const periods = [
      ["2026-07-25", "2026-07-26"],
      ["2026-07-11", "2026-07-30"],
      ["2026-07-20", "2026-07-21"],
      ["2026-07-09", "2026-07-12"],
      ["2026-07-20", "2026-07-20"],
    ] as const;
    const occasions = [];
    for (const period of periods) {
      occasions.push(await k.w.occasion({ period }));
    }
    const first = await list(k, { page: 1, limit: 3 });
    const second = await list(k, { page: 2, limit: 3 });
    const [a, b, c, d, e] = occasions;
    expect([...occasionIds(first), ...occasionIds(second)]).toEqual(
      [d, b, e, c, a].map((occasion) => occasion?.id),
    );
    expect([first.count, second.count]).toEqual([5, 5]);
  });

  it("listOccasions#7 開催前・開催中の公開中のイベントがない / 読む", async () => {
    const k = await discoveryKit();
    await k.w.occasion({ period: PERIODS.ended });
    expect(await list(k)).toEqual({ items: [], count: 0, photos: {} });
  });
});
