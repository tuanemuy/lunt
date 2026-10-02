import { expectBusinessRuleError } from "@repo/core/adapters/durableObject/__conformance__/assertions";
import { PERIODS } from "@repo/core/adapters/durableObject/__conformance__/discoveryFixtures";
import { openDates } from "@repo/core/adapters/durableObject/__conformance__/listingFixtures";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import type { PhotoId } from "@repo/core/domain/common/ids";
import { ListingId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../errors";
import {
  LISTING_NOT_FOUND,
  MAX_OTHER_LISTINGS,
  viewListing,
} from "../viewListing";
import { type DiscoveryKit, discoveryKit } from "./kit";

const view = (k: DiscoveryKit, listingId: ListingId, otherListingsLimit = 6) =>
  viewListing({
    container: k.container,
    input: { listingId, otherListingsLimit },
  });

const otherIds = (out: Awaited<ReturnType<typeof view>>) =>
  out.otherListings.map((summary) => summary.listingId);

const regionIds = (out: Awaited<ReturnType<typeof view>>) =>
  out.regions.map((summary) => summary.regionId);

const occasionIds = (out: Awaited<ReturnType<typeof view>>) =>
  out.occasions.map((summary) => summary.occasionId);

async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(NotFoundError);
  expect((error as NotFoundError).code).toBe(LISTING_NOT_FOUND);
}

describe("viewListing", () => {
  it("viewListing#1 公開中かつ提供中の掲載 L。店舗 P は営業中で、地域 X に所属している。L を参加に添えた開催中のイベントがある / L を読む", async () => {
    const k = await discoveryKit();
    const { w } = k;
    const P = await w.place({ photos: 1 });
    const X = await w.region({ name: "谷中" });
    await w.affiliate(P.id, [X.id]);
    const other = await w.available(P.id);
    const framed = w.f.photo({ x: 0.1, y: 0.2, width: 0.5, height: 0.5 });
    const L = await w.store(
      w.f.published(P.id, {
        photos: [framed, w.f.photo()],
        description: "季節の果物を使ったタルト",
      }),
    );
    const E = await w.occasion({ period: PERIODS.ongoing, tagline: "夏の市" });
    await w.participate(E.id, P.id, { listingIds: [L.id] });
    const out = await view(k, L.id);
    expect(out.listing).toEqual({
      listingId: L.id,
      name: L.content.name,
      description: L.content.description,
      category: { id: w.f.defaultCategory, name: "食べる", status: "active" },
      photos: L.content.photos.items,
      offering: { kind: "none" },
      standing: {
        kind: "listing",
        offering: { phase: "available" },
        operating: "open",
      },
      place: {
        placeId: P.id,
        cover: {
          source: "own",
          photoId: P.profile.photos.items[0]?.photoId,
          framing: null,
        },
        name: P.profile.name,
        address: P.profile.address,
        location: P.profile.location,
        region: "谷中",
        standing: { kind: "place", operating: "open" },
      },
    });
    expect(out.listing.photos[0]?.framing).toEqual(framed.framing);
    expect(out.listing).not.toHaveProperty("price");
    expect(out.listing).not.toHaveProperty("tagline");
    expect(out.otherListings).toEqual([
      {
        listingId: other.id,
        placeId: P.id,
        cover: {
          source: "own",
          photoId: other.content.photos.items[0]?.photoId,
          framing: null,
        },
        listingName: other.content.name,
        placeName: P.profile.name,
        region: "谷中",
        standing: {
          kind: "listing",
          offering: { phase: "available" },
          operating: "open",
        },
      },
    ]);
    expect(out.regions).toEqual([
      {
        regionId: X.id,
        cover: {
          source: "own",
          photoId: X.content.photos.items[0]?.photoId,
          framing: null,
        },
        name: "谷中",
        tagline: X.content.tagline,
        address: X.content.address,
        location: X.content.location,
      },
    ]);
    expect(out.occasions).toEqual([
      {
        occasionId: E.id,
        cover: {
          source: "own",
          photoId: E.content.photos.items[0]?.photoId,
          framing: null,
        },
        name: E.content.name,
        tagline: "夏の市",
        period: E.content.period,
        venue: E.content.venue,
        standing: { kind: "occasion", holding: "ongoing" },
      },
    ]);
    const shown: readonly PhotoId[] = [
      ...L.content.photos.items.map((photo) => photo.photoId),
      ...P.profile.photos.items.map((photo) => photo.photoId),
      ...X.content.photos.items.map((photo) => photo.photoId),
      ...E.content.photos.items.map((photo) => photo.photoId),
      ...other.content.photos.items.map((photo) => photo.photoId),
    ];
    expect(Object.keys(out.photos).sort()).toEqual([...shown].sort());
  });

  it("viewListing#2 商品・体験・景色・見どころの掲載がある / それぞれを読む", async () => {
    const k = await discoveryKit();
    const { w } = k;
    const P = await w.place();
    const outs = [];
    for (const categoryId of k.categoryIds) {
      const L = await w.store(w.f.published(P.id, { categoryId }));
      outs.push(await view(k, L.id));
    }
    expect(outs.map((out) => out.listing.category.id)).toEqual(k.categoryIds);
    const [first, ...rest] = outs.map((out) => Object.keys(out.listing).sort());
    for (const keys of rest) expect(keys).toEqual(first);
  });

  it("viewListing#3 掲載に開催日が3日設定されている / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.store(
      k.w.f.published(P.id, {
        offering: openDates("2026-07-11", "2026-07-12", "2026-07-13"),
      }),
    );
    expect((await view(k, L.id)).listing.offering).toEqual({
      kind: "dates",
      dates: ["2026-07-11", "2026-07-12", "2026-07-13"],
    });
  });

  it("viewListing#4 提供期間の開始日が今日より後の掲載 / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.upcoming(P.id, "2026-07-20");
    expect((await view(k, L.id)).listing.standing.offering).toEqual({
      phase: "upcoming",
      startsOn: "2026-07-20",
    });
  });

  it("viewListing#5 期日で提供終了になった掲載と、管理する人が提供終了にした掲載 / それぞれを読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const A = await k.w.available(P.id);
    const bySchedule = await k.w.endedBySchedule(P.id);
    const byHand = await k.w.endedByHand(P.id);
    const schedule = await view(k, bySchedule.id);
    const hand = await view(k, byHand.id);
    expect(schedule.listing.standing.offering).toEqual({
      phase: "ended",
      cause: "schedule",
    });
    expect(hand.listing.standing.offering).toEqual({
      phase: "ended",
      cause: "manual",
      scheduleElapsed: false,
    });
    for (const out of [schedule, hand]) {
      expect(out.listing.place.placeId).toBe(P.id);
      expect(otherIds(out)).toEqual([A.id]);
    }
  });

  it("viewListing#6 紐づく店舗が休業中の掲載と、閉店した店舗の掲載 / それぞれを読む", async () => {
    const k = await discoveryKit();
    const resting = await k.w.place({ status: "temporarilyClosed" });
    const closed = await k.w.place({ status: "permanentlyClosed" });
    const onResting = await view(k, (await k.w.available(resting.id)).id);
    const onClosed = await view(k, (await k.w.available(closed.id)).id);
    expect(onResting.listing.standing.operating).toBe("temporarilyClosed");
    expect(onResting.listing.place.standing.operating).toBe(
      "temporarilyClosed",
    );
    expect(onClosed.listing.standing.operating).toBe("permanentlyClosed");
    expect(onClosed.listing.place.standing.operating).toBe("permanentlyClosed");
  });

  it("viewListing#7 店舗が地域 X・Y・Z の順に所属し、代表地域に Y を選んでいる。Z は公開の取り下げ中 / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const X = await k.w.region();
    const Y = await k.w.region();
    const Z = await k.w.region({ state: "unpublished" });
    await k.w.affiliate(P.id, [X.id, Y.id, Z.id], Y.id);
    const L = await k.w.available(P.id);
    expect(regionIds(await view(k, L.id))).toEqual([Y.id, X.id]);
  });

  it("viewListing#8 店舗 P に、L のほかに提供中の掲載 p1・p2、提供開始前の掲載 p3 がある。一覧に示す地域 X に所属する他の店舗に、提供中の掲載が5件と、閉店した店舗の掲載が1件ある / 他の掲載の件数を 6 にして L を読む", async () => {
    const k = await discoveryKit();
    const X = await k.w.region();
    const P = await k.w.place();
    const Q = await k.w.place();
    const S = await k.w.place();
    const closed = await k.w.place({ status: "permanentlyClosed" });
    for (const place of [P, Q, S, closed]) {
      await k.w.affiliate(place.id, [X.id]);
    }
    const L = await k.w.available(P.id);
    const p1 = await k.w.available(P.id);
    const p2 = await k.w.available(P.id);
    await k.w.upcoming(P.id);
    const inRegion = [];
    for (const place of [Q, S, Q, S, Q]) {
      inRegion.push(await k.w.available(place.id));
    }
    await k.w.available(closed.id);
    const newestInRegion = inRegion.map((listing) => listing.id).reverse();
    expect(otherIds(await view(k, L.id, 6))).toEqual([
      p2.id,
      p1.id,
      ...newestInRegion.slice(0, 4),
    ]);
  });

  const sixOthersThenL = async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const others = [];
    for (let i = 0; i < 6; i += 1) others.push(await k.w.available(P.id));
    const L = await k.w.available(P.id);
    return { k, L, newestFirst: others.map((o) => o.id).reverse() };
  };

  it("viewListing#9 店舗 P に、L（最も新しく公開）のほかに提供中の掲載が6件ある / 他の掲載の件数を 6 にして L を読む", async () => {
    const { k, L, newestFirst } = await sixOthersThenL();
    expect(otherIds(await view(k, L.id, 6))).toEqual(newestFirst);
  });

  it("viewListing#10 上と同じ / 他の掲載の件数を 3 にして L を読む", async () => {
    const { k, L, newestFirst } = await sixOthersThenL();
    expect(otherIds(await view(k, L.id, 3))).toEqual(newestFirst.slice(0, 3));
  });

  it("viewListing#11 店舗に公開中の所属地域がない / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.available(P.id);
    const a = await k.w.available(P.id);
    await k.w.upcoming(P.id);
    await k.w.endedByHand(P.id);
    const Q = await k.w.place();
    await k.w.available(Q.id);
    const out = await view(k, L.id);
    expect(out.regions).toEqual([]);
    expect(otherIds(out)).toEqual([a.id]);
  });

  it("viewListing#12 L を参加に添えた、開催前のイベント E1 と終了したイベント E2 がある。店舗は E3 にも参加しているが、L を添えていない / L を読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.available(P.id);
    const E1 = await k.w.occasion({ period: PERIODS.upcoming });
    const E2 = await k.w.occasion({ period: PERIODS.ended });
    const E3 = await k.w.occasion({ period: PERIODS.upcoming });
    await k.w.participate(E1.id, P.id, { listingIds: [L.id] });
    await k.w.participate(E2.id, P.id, { listingIds: [L.id] });
    await k.w.participate(E3.id, P.id);
    expect(occasionIds(await view(k, L.id))).toEqual([E1.id]);
  });

  it("viewListing#13 掲載のカテゴリー K が廃止され、移行先は M。掲載には K が保存されたまま / 読む", async () => {
    const k = await discoveryKit();
    const [K, M] = k.categoryIds;
    if (K === undefined || M === undefined) throw new Error("categories");
    const P = await k.w.place();
    const L = await k.w.store(k.w.f.published(P.id, { categoryId: K }));
    await k.retireCategory(K, M);
    expect((await view(k, L.id)).listing.category).toEqual({
      id: M,
      name: "買う",
      status: "active",
    });
  });

  it("viewListing#14 店舗に店舗管理者がいる掲載と、いない掲載 / それぞれを読む", async () => {
    const k = await discoveryKit();
    const stewarded = await k.w.place();
    const vacant = await k.w.place();
    await k.appoint(stewarded.id, await k.person());
    const onStewarded = await view(k, (await k.w.available(stewarded.id)).id);
    const onVacant = await view(k, (await k.w.available(vacant.id)).id);
    expect(onStewarded.placeIsVacant).toBe(false);
    expect(onVacant.placeIsVacant).toBe(true);
  });

  it("viewListing#15 L の所属地域と、L を添えたイベントが、どちらも公開を取り下げられた / L を読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const X = await k.w.region();
    await k.w.affiliate(P.id, [X.id]);
    const L = await k.w.available(P.id);
    const E = await k.w.occasion();
    await k.w.participate(E.id, P.id, { listingIds: [L.id] });
    const before = await view(k, L.id);
    expect(regionIds(before)).toEqual([X.id]);
    expect(occasionIds(before)).toEqual([E.id]);
    await k.w.unpublishRegion(X);
    await k.w.unpublishOccasion(E);
    const after = await view(k, L.id);
    expect(after.listing).toEqual({
      ...before.listing,
      place: { ...before.listing.place, region: null },
    });
    expect(after.regions).toEqual([]);
    expect(after.occasions).toEqual([]);
  });

  it("viewListing#16 掲載が、下書き、一時非公開、運営による非公開、削除済みのいずれか。または、紐づく店舗が非公開。または、その ID の掲載がない / その掲載を読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const hidden = await k.w.place({ suspended: true });
    const deleted = await k.w.available(P.id);
    await k.w.deleteListing(deleted);
    const ids = [
      (await k.w.draft(P.id)).id,
      (await k.w.unpublished(P.id)).id,
      (await k.w.suspendedListing(P.id)).id,
      deleted.id,
      (await k.w.available(hidden.id)).id,
      ListingId.create(k.idGenerator.next()),
    ];
    for (const id of ids) await expectNotFound(view(k, id));
  });

  it("otherListingsLimit is an integer from 1 to 99", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.available(P.id);
    const other = await k.w.available(P.id);
    expect(otherIds(await view(k, L.id, 1))).toEqual([other.id]);
    expect(otherIds(await view(k, L.id, MAX_OTHER_LISTINGS))).toEqual([
      other.id,
    ]);
    for (const limit of [0, MAX_OTHER_LISTINGS + 1, 1.5]) {
      await expectBusinessRuleError(
        view(k, L.id, limit),
        CommonErrorCode.InvalidInput,
      );
    }
  });
});
