import { expectBusinessRuleError } from "@repo/core/adapters/do/__conformance__/assertions";
import { openDates } from "@repo/core/adapters/do/__conformance__/listingFixtures";
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

async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(NotFoundError);
  expect((error as NotFoundError).code).toBe(LISTING_NOT_FOUND);
}

describe("viewListing", () => {
  it.todo(
    "viewListing#1 公開中かつ提供中の掲載 L。店舗 P は営業中で、地域 X に所属している。L を参加に添えた開催中のイベントがある / L を読む",
  );

  it("returns the listing's photos, name, description, category, offering and standing with the place and other listings, each carrying its id (stage 2 part of #1)", async () => {
    const k = await discoveryKit();
    const { w } = k;
    const P = await w.place({ photos: 1 });
    const other = await w.available(P.id);
    const framed = w.f.photo({ x: 0.1, y: 0.2, width: 0.5, height: 0.5 });
    const L = await w.store(
      w.f.published(P.id, {
        photos: [framed, w.f.photo()],
        description: "季節の果物を使ったタルト",
      }),
    );
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
        region: null,
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
        region: null,
        standing: {
          kind: "listing",
          offering: { phase: "available" },
          operating: "open",
        },
      },
    ]);
    expect(out.regions).toEqual([]);
    expect(out.occasions).toEqual([]);
    const shown: readonly PhotoId[] = [
      ...L.content.photos.items.map((photo) => photo.photoId),
      ...P.profile.photos.items.map((photo) => photo.photoId),
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

  it.todo(
    "viewListing#7 店舗が地域 X・Y・Z の順に所属し、代表地域に Y を選んでいる。Z は公開の取り下げ中 / 読む",
  );
  it.todo(
    "viewListing#8 店舗 P に、L のほかに提供中の掲載 p1・p2、提供開始前の掲載 p3 がある。一覧に示す地域 X に所属する他の店舗に、提供中の掲載が5件と、閉店した店舗の掲載が1件ある / 他の掲載の件数を 6 にして L を読む",
  );

  it("other listings start with the place's available listings, newest first, without itself or upcoming ones (stage 2 part of #8)", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const L = await k.w.available(P.id);
    const p1 = await k.w.available(P.id);
    const p2 = await k.w.available(P.id);
    await k.w.upcoming(P.id);
    expect(otherIds(await view(k, L.id))).toEqual([p2.id, p1.id]);
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

  it.todo(
    "viewListing#12 L を参加に添えた、開催前のイベント E1 と終了したイベント E2 がある。店舗は E3 にも参加しているが、L を添えていない / L を読む",
  );

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

  it.todo(
    "viewListing#15 L の所属地域と、L を添えたイベントが、どちらも公開を取り下げられた / L を読む",
  );

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
