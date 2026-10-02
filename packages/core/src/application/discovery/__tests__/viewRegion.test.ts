import { PERIODS } from "@repo/core/adapters/durableObject/__conformance__/discoveryFixtures";
import { RegionId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { REGION_NOT_FOUND, viewRegion } from "../viewRegion";
import { type DiscoveryKit, discoveryKit, expectNotFound } from "./kit";

const view = (k: DiscoveryKit, regionId: RegionId) =>
  viewRegion({ container: k.container, input: { regionId } });

const occasionIds = (out: Awaited<ReturnType<typeof view>>) =>
  out.occasions.map((summary) => summary.occasionId);

describe("viewRegion", () => {
  it("viewRegion#1 公開中の地域 R に、関連づけられた開催前のイベントがある / R を読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region({
      photos: 2,
      content: { tagline: "路地を歩く", description: "下町の路地" },
    });
    const E = await k.w.occasion({
      period: PERIODS.upcoming,
      tagline: "路地の市",
    });
    await k.w.link(E.id, R.id);
    const out = await view(k, R.id);
    expect(out.region).toEqual({
      regionId: R.id,
      name: R.content.name,
      tagline: "路地を歩く",
      description: "下町の路地",
      address: R.content.address,
      location: R.content.location,
      photos: R.content.photos.items,
    });
    expect(out.region.photos).toHaveLength(2);
    expect(out.occasions).toEqual([
      {
        occasionId: E.id,
        cover: {
          source: "own",
          photoId: E.content.photos.items[0]?.photoId,
          framing: null,
        },
        name: E.content.name,
        tagline: "路地の市",
        period: E.content.period,
        venue: E.content.venue,
        standing: { kind: "occasion", holding: "upcoming" },
      },
    ]);
    expect(Object.keys(out.photos).sort()).toEqual(
      [
        ...R.content.photos.items.map((photo) => photo.photoId),
        ...E.content.photos.items.map((photo) => photo.photoId),
      ].sort(),
    );
  });

  it("viewRegion#2 R に、開催前のイベント E1（開始が遅い）、開催中のイベント E2、終了したイベント E3、中止のイベント E4 が関連づけられている。イベント E5 との関連づけは、地域の側が解除している / R を読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const E1 = await k.w.occasion({ period: PERIODS.upcoming });
    const E2 = await k.w.occasion({ period: PERIODS.ongoing });
    const E3 = await k.w.occasion({ period: PERIODS.ended });
    const E4 = await k.w.occasion({ state: "cancelled" });
    const E5 = await k.w.occasion({ period: PERIODS.upcoming });
    for (const E of [E1, E2, E3, E4]) await k.w.link(E.id, R.id);
    await k.w.link(E5.id, R.id, { detached: true });
    expect(occasionIds(await view(k, R.id))).toEqual([E2.id, E1.id]);
  });

  it("viewRegion#3 R に関連づけられたイベントがない / R を読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const out = await view(k, R.id);
    expect(out.region.regionId).toBe(R.id);
    expect(out.occasions).toEqual([]);
  });

  it("viewRegion#4 R に関連づけられたイベントの1つが、地域の詳細を読んだ後に公開を取り下げられた / R をもう一度読む", async () => {
    const k = await discoveryKit();
    const R = await k.w.region();
    const kept = await k.w.occasion();
    const withdrawn = await k.w.occasion();
    await k.w.link(kept.id, R.id);
    await k.w.link(withdrawn.id, R.id);
    const before = await view(k, R.id);
    expect(occasionIds(before)).toEqual([kept.id, withdrawn.id]);
    await k.w.unpublishOccasion(withdrawn);
    const after = await view(k, R.id);
    expect(after.region).toEqual(before.region);
    expect(occasionIds(after)).toEqual([kept.id]);
  });

  it("viewRegion#5 地域が、下書き、公開の取り下げ、運営による非公開のいずれか。または、その ID の地域がない / その地域を読む", async () => {
    const k = await discoveryKit();
    const ids = [
      (await k.w.region({ state: "draft" })).id,
      (await k.w.region({ state: "unpublished" })).id,
      (await k.w.region({ state: "suspended" })).id,
      RegionId.create(k.idGenerator.next()),
    ];
    for (const id of ids) await expectNotFound(view(k, id), REGION_NOT_FOUND);
  });
});
