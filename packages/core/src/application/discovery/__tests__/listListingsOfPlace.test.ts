import { expectBusinessRuleError } from "@repo/core/adapters/durableObject/__conformance__/assertions";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { PlaceId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../errors";
import { listListingsOfPlace } from "../listListingsOfPlace";
import { PLACE_NOT_FOUND } from "../viewPlace";
import { type DiscoveryKit, discoveryKit } from "./kit";

const list = (
  k: DiscoveryKit,
  placeId: PlaceId,
  pagination: Pagination = { page: 1, limit: 6 },
) =>
  listListingsOfPlace({
    container: k.container,
    input: { placeId, pagination },
  });

const idsOf = (out: Awaited<ReturnType<typeof list>>) =>
  out.items.map((summary) => summary.listingId);

describe("listListingsOfPlace", () => {
  it("listListingsOfPlace#1 店舗に、提供中の掲載 a1（先に公開）・a2（後に公開）、提供開始前の掲載 u1、提供終了の掲載 e1 がある / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const a1 = await k.w.available(P.id);
    const a2 = await k.w.available(P.id);
    const u1 = await k.w.upcoming(P.id, "2026-07-20");
    const e1 = await k.w.endedBySchedule(P.id);
    const out = await list(k, P.id);
    expect(idsOf(out)).toEqual([a2.id, a1.id, u1.id, e1.id]);
    expect(out.count).toBe(4);
    expect(out.items.map((item) => item.standing.offering)).toEqual([
      { phase: "available" },
      { phase: "available" },
      { phase: "upcoming", startsOn: "2026-07-20" },
      { phase: "ended", cause: "schedule" },
    ]);
    expect(out.items.every((item) => item.placeId === P.id)).toBe(true);
    for (const item of out.items) {
      expect(out.photos[item.cover.photoId]).toBeDefined();
    }
  });

  it("listListingsOfPlace#2 店舗に公開中の掲載が8件ある / 1ページ6件で1ページ目と2ページ目を読む（店舗の詳細の掲載の区分と、その続き）", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    const all = [];
    for (let i = 0; i < 8; i += 1) all.push(await k.w.available(P.id));
    const first = await list(k, P.id, { page: 1, limit: 6 });
    const second = await list(k, P.id, { page: 2, limit: 6 });
    expect(first.items).toHaveLength(6);
    expect(second.items).toHaveLength(2);
    expect([first.count, second.count]).toEqual([8, 8]);
    expect([...idsOf(first), ...idsOf(second)]).toEqual(
      all.map((listing) => listing.id).reverse(),
    );
  });

  it("listListingsOfPlace#3 店舗に、下書き・一時非公開・運営による非公開の掲載がある / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    await k.w.draft(P.id);
    await k.w.unpublished(P.id);
    await k.w.suspendedListing(P.id);
    const shown = await k.w.available(P.id);
    const out = await list(k, P.id);
    expect(idsOf(out)).toEqual([shown.id]);
    expect(out.count).toBe(1);
  });

  it("listListingsOfPlace#4 休業中の店舗と閉店した店舗に、公開中の掲載がある / それぞれの店舗で読む", async () => {
    const k = await discoveryKit();
    for (const status of ["temporarilyClosed", "permanentlyClosed"] as const) {
      const P = await k.w.place({ status });
      const L = await k.w.available(P.id);
      const out = await list(k, P.id);
      expect(idsOf(out)).toEqual([L.id]);
      expect(out.items[0]?.standing.operating).toBe(status);
    }
  });

  it("listListingsOfPlace#5 店舗に公開中の掲載がない / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    expect(await list(k, P.id)).toEqual({ items: [], count: 0, photos: {} });
  });

  it("listListingsOfPlace#6 店舗が非公開。または、その ID の店舗がない / 読む", async () => {
    const k = await discoveryKit();
    const P = await k.w.place({ suspended: true });
    await k.w.available(P.id);
    for (const id of [P.id, PlaceId.create(k.idGenerator.next())]) {
      const error = await list(k, id).then(
        () => undefined,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).code).toBe(PLACE_NOT_FOUND);
    }
  });

  it("a pagination out of bounds is COMMON_INVALID_INPUT", async () => {
    const k = await discoveryKit();
    const P = await k.w.place();
    await k.w.available(P.id);
    expect((await list(k, P.id, { page: 1, limit: 100 })).count).toBe(1);
    for (const pagination of [
      { page: 0, limit: 6 },
      { page: 1, limit: 0 },
      { page: 1, limit: 101 },
      { page: 1.5, limit: 6 },
    ]) {
      await expectBusinessRuleError(
        list(k, P.id, pagination),
        CommonErrorCode.InvalidInput,
      );
    }
  });
});
