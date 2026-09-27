import { type ListingId, PlaceId } from "@repo/core/domain/common/ids";
import type { ListingShelf } from "@repo/core/domain/listing/listing";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { listPlaceListings } from "../listPlaceListings";
import { type ListingKit, listingKit, period } from "./kit";

const ALL: ListingShelf = { publication: null, phase: null };

const lister =
  (k: ListingKit) =>
  (who: Person, placeId: PlaceId, shelf: ListingShelf = ALL, limit = 50) =>
    listPlaceListings({
      container: k.container,
      actor: who.actor,
      input: { placeId, shelf, pagination: { page: 1, limit } },
    });

/** 「基本の前提」: L1 … L7 of place A, stewarded by `m`. */
async function base(k: ListingKit) {
  const a = await k.place();
  const m = await k.manager(a);
  const op = await k.operator();
  const L1 = (await k.published(m, a)).id;
  const L2 = (await k.published(m, a, { offering: period("2026-07-20", null) }))
    .id;
  const L3 = (await k.draft(m, a)).id;
  const L4 = (await k.published(m, a)).id;
  await k.unpublish(m, L4);
  const L5 = (await k.published(m, a)).id;
  await k.suspend(op, L5);
  const L6 = (await k.published(m, a, { offering: period(null, "2026-06-30") }))
    .id;
  const L7 = (await k.published(m, a)).id;
  await k.end(m, L7);
  return { a, m, op, L1, L2, L3, L4, L5, L6, L7 };
}

/** `ids` in the list's order: newest update first, ties by id. */
async function newestFirst(
  k: ListingKit,
  ids: readonly ListingId[],
): Promise<readonly ListingId[]> {
  const stored = await Promise.all(ids.map((id) => k.stored(id)));
  return stored
    .map((s) => s.entity)
    .sort(
      (x, y) =>
        y.updatedAt.getTime() - x.updatedAt.getTime() ||
        (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
    )
    .map((l) => l.id);
}

const sorted = (ids: readonly ListingId[]) => [...ids].sort();

describe("listPlaceListings", () => {
  it("listPlaceListings#1 基本の前提 / 公開状態の区分も提供状態の段階も指定せずに読む", async () => {
    const k = await listingKit();
    const b = await base(k);
    const result = await lister(k)(b.m, b.a);
    const all = [b.L1, b.L2, b.L3, b.L4, b.L5, b.L6, b.L7];
    expect(result.items.map((r) => r.id)).toEqual(await newestFirst(k, all));
    expect(result.count).toBe(7);
    for (const row of result.items) {
      expect(row.cover?.display).not.toBeNull();
      expect(row.name).toBe("掲載");
      expect(row.category).toMatchObject({ name: "食べる" });
    }
    const row = (id: ListingId) => result.items.find((r) => r.id === id);
    expect(row(b.L5)?.suspended).toBe(true);
    expect(row(b.L4)?.publication.status).toBe("unpublished");
    expect(row(b.L2)?.offeringStatus.phase).toBe("upcoming");
    expect(result.counts).toEqual({
      publication: { published: 4, draft: 1, hidden: 2 },
      phase: { upcoming: 1, available: 4, ended: 2 },
    });
  });

  it("listPlaceListings#2 基本の前提 / 公開状態の区分「公開中」で読む", async () => {
    const k = await listingKit();
    const b = await base(k);
    const result = await lister(k)(b.m, b.a, {
      publication: "published",
      phase: null,
    });
    expect(sorted(result.items.map((r) => r.id))).toEqual(
      sorted([b.L1, b.L2, b.L6, b.L7]),
    );
    const phase = (id: ListingId) =>
      result.items.find((r) => r.id === id)?.offeringStatus;
    expect(phase(b.L2)?.phase).toBe("upcoming");
    expect(phase(b.L6)).toEqual({ phase: "ended", cause: "schedule" });
    expect(phase(b.L7)).toMatchObject({ phase: "ended", cause: "manual" });
  });

  it("listPlaceListings#3 基本の前提 / 公開状態の区分「下書き」で読む", async () => {
    const k = await listingKit();
    const b = await base(k);
    const result = await lister(k)(b.m, b.a, {
      publication: "draft",
      phase: null,
    });
    expect(result.items.map((r) => r.id)).toEqual([b.L3]);
  });

  it("listPlaceListings#4 基本の前提 / 公開状態の区分「非公開」で読む", async () => {
    const k = await listingKit();
    const b = await base(k);
    const result = await lister(k)(b.m, b.a, {
      publication: "hidden",
      phase: null,
    });
    expect(sorted(result.items.map((r) => r.id))).toEqual(sorted([b.L4, b.L5]));
    const row = (id: ListingId) => result.items.find((r) => r.id === id);
    expect(row(b.L4)).toMatchObject({
      suspended: false,
      publication: { status: "unpublished", reason: "byManager" },
    });
    expect(row(b.L5)).toMatchObject({
      suspended: true,
      publication: { status: "published" },
    });
  });

  it("listPlaceListings#5 基本の前提 / 提供状態の段階「提供終了」で読む", async () => {
    const k = await listingKit();
    const b = await base(k);
    const result = await lister(k)(b.m, b.a, {
      publication: null,
      phase: "ended",
    });
    expect(sorted(result.items.map((r) => r.id))).toEqual(sorted([b.L6, b.L7]));
    const status = (id: ListingId) =>
      result.items.find((r) => r.id === id)?.offeringStatus;
    expect(status(b.L6)).toEqual({ phase: "ended", cause: "schedule" });
    expect(status(b.L7)).toEqual({
      phase: "ended",
      cause: "manual",
      scheduleElapsed: false,
    });
  });

  it("listPlaceListings#6 店舗 A の下書きが、運営による非公開になっている / 公開状態の区分「非公開」と「下書き」で読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    await k.suspend(await k.operator(), draft.id);
    const hidden = await lister(k)(m, a, {
      publication: "hidden",
      phase: null,
    });
    const drafts = await lister(k)(m, a, { publication: "draft", phase: null });
    expect(hidden.items.map((r) => r.id)).toEqual([draft.id]);
    expect(drafts.items).toEqual([]);
    expect(hidden.counts.publication).toEqual({
      published: 0,
      draft: 0,
      hidden: 1,
    });
  });

  it("listPlaceListings#7 店舗 A の公開中の掲載の終了日が 2026-07-09 / 提供状態の段階「提供終了」と、公開状態の区分「公開中」で読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: period(null, "2026-07-09"),
    });
    const ended = await lister(k)(m, a, { publication: null, phase: "ended" });
    const published = await lister(k)(m, a, {
      publication: "published",
      phase: null,
    });
    expect(ended.items.map((r) => r.id)).toEqual([listing.id]);
    expect(published.items.map((r) => r.id)).toEqual([listing.id]);
    expect(ended.counts.phase.ended).toBe(1);
  });

  it("listPlaceListings#8 基本の前提 / 公開状態の区分「公開中」と提供状態の段階「提供終了」を併せて読む", async () => {
    const k = await listingKit();
    const b = await base(k);
    const result = await lister(k)(b.m, b.a, {
      publication: "published",
      phase: "ended",
    });
    expect(sorted(result.items.map((r) => r.id))).toEqual(sorted([b.L6, b.L7]));
  });

  it("listPlaceListings#9 基本の前提 / 提供状態の段階「提供開始前」で読む", async () => {
    const k = await listingKit();
    const b = await base(k);
    const result = await lister(k)(b.m, b.a, {
      publication: null,
      phase: "upcoming",
    });
    expect(result.items.map((r) => r.id)).toEqual([b.L2]);
  });

  it("listPlaceListings#10 店舗 A の一時非公開の掲載の終了日が 2026-06-30 / 提供状態の段階「提供終了」と、公開状態の区分「非公開」で読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: period(null, "2026-06-30"),
    });
    await k.unpublish(m, listing.id);
    const ended = await lister(k)(m, a, { publication: null, phase: "ended" });
    const hidden = await lister(k)(m, a, {
      publication: "hidden",
      phase: null,
    });
    expect(ended.items.map((r) => r.id)).toEqual([listing.id]);
    expect(hidden.items.map((r) => r.id)).toEqual([listing.id]);
  });

  it("listPlaceListings#11 店舗 A に掲載が1件もない / 読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    expect(await lister(k)(m, a)).toEqual({
      items: [],
      count: 0,
      counts: {
        publication: { published: 0, draft: 0, hidden: 0 },
        phase: { upcoming: 0, available: 0, ended: 0 },
      },
    });
  });

  it("listPlaceListings#12 店舗 A に公開中の掲載だけがある / 公開状態の区分「下書き」で読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    await k.published(m, a);
    await k.published(m, a);
    const result = await lister(k)(m, a, { publication: "draft", phase: null });
    expect(result.items).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.counts.publication).toEqual({
      published: 2,
      draft: 0,
      hidden: 0,
    });
  });

  it("listPlaceListings#13 店舗 B には、管理者のいなかった時期に、代理作成で公開された掲載、申請の承認で公開された掲載、サービス運営者が保存した下書きがある。その後、操作する人が店舗 B の店舗管理者に就いた / 店舗管理者が店舗 B の掲載を読む", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const proxied = (await k.published(op, b)).id;
    const approved = await k.approved(b, await k.person());
    const draft = (await k.draft(op, b)).id;
    const m = await k.manager(b);
    const result = await lister(k)(m, b);
    expect(sorted(result.items.map((r) => r.id))).toEqual(
      sorted([proxied, approved, draft]),
    );
  });

  it("listPlaceListings#14 操作する人は店舗 A と店舗 C の店舗管理者。どちらの店舗にも掲載がある / 店舗 A、店舗 C のそれぞれを指定して読む", async () => {
    const k = await listingKit();
    const [a, c] = [await k.place(), await k.place()];
    const m = await k.manager(a);
    await k.appoint(k.ref(c), m);
    const ofA = (await k.published(m, a)).id;
    const ofC = (await k.published(m, c)).id;
    expect((await lister(k)(m, a)).items.map((r) => r.id)).toEqual([ofA]);
    expect((await lister(k)(m, c)).items.map((r) => r.id)).toEqual([ofC]);
  });

  it("listPlaceListings#15 店舗 B の最後の店舗管理者が辞任し、店舗 B に下書きを含む掲載が残っている。操作する人はサービス運営者 / 店舗 B の掲載を読む", async () => {
    const k = await listingKit();
    const b = await k.place();
    const m = await k.manager(b);
    const draft = (await k.draft(m, b)).id;
    const published = (await k.published(m, b)).id;
    await k.removeSteward(k.ref(b), m);
    const result = await lister(k)(await k.operator(), b);
    expect(sorted(result.items.map((r) => r.id))).toEqual(
      sorted([draft, published]),
    );
  });

  it("listPlaceListings#16 店舗 A に店舗管理者がいる。操作する人は店舗 A の管理権限を持たないサービス運営者 / 店舗 A の掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    await k.manager(a);
    await expectCode(lister(k)(await k.operator(), a), ForbiddenError);
  });

  it("listPlaceListings#17 操作する人は店舗 A の管理権限を持たない利用者 / 店舗 A の掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    await k.manager(a);
    await expectCode(lister(k)(await k.person(), a), ForbiddenError);
  });

  it("listPlaceListings#18 操作する人はサービス運営者 / 存在しない PlaceId を指定して読む", async () => {
    const k = await listingKit();
    await expectCode(
      lister(k)(await k.operator(), PlaceId.create(k.newId())),
      NotFoundError,
    );
  });
});
