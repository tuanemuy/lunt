import { Bookmark } from "@repo/core/domain/bookmark/bookmark";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { AccountId, ListingId, PlaceId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { type BookmarkRef, ContentRef } from "@repo/core/domain/common/refs";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { barrier, ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";

const T0 = Date.parse("2026-09-01T00:00:00.000Z");
const at = (minutes: number): Date => new Date(T0 + minutes * 60_000);
const FAR = new Date("9999-01-01T00:00:00.000Z");

/** Ids ascending in minting order, unique per test. */
function kit() {
  let counter = 0x40_0000;
  const raw = (): string => {
    const tail = counter.toString(16).padStart(12, "0");
    counter += 1;
    return `ffffffff-ffff-7fff-8fff-${tail}`;
  };
  const account = () => AccountId.create(raw());
  const listing = (): BookmarkRef => ({
    kind: "listing",
    id: ListingId.create(raw()),
  });
  const place = (): BookmarkRef => ({
    kind: "place",
    id: PlaceId.create(raw()),
  });
  const saved = (
    accountId: AccountId,
    target: BookmarkRef,
    savedAt: Date = at(1),
  ): Bookmark => Bookmark.create({ accountId }, target, savedAt, FAR);
  return { raw, account, listing, place, saved };
}

const ALL: Pagination = { page: 1, limit: 100 };

const add = (h: ConformanceHarness, bookmark: Bookmark) =>
  h.uow.run(({ bookmarkRepository }) => bookmarkRepository.add(bookmark));

const addAll = (h: ConformanceHarness, ...bookmarks: readonly Bookmark[]) =>
  h.uow.run(({ bookmarkRepository }) => bookmarkRepository.addAll(bookmarks));

const remove = (
  h: ConformanceHarness,
  accountId: AccountId,
  target: BookmarkRef,
) =>
  h.uow.run(({ bookmarkRepository }) =>
    bookmarkRepository.remove(accountId, target),
  );

const removeAll = (h: ConformanceHarness, accountId: AccountId) =>
  h.uow.run(({ bookmarkRepository }) =>
    bookmarkRepository.removeAllByAccount(accountId),
  );

const find = (
  h: ConformanceHarness,
  accountId: AccountId,
  pagination: Pagination = ALL,
) =>
  h.uow.run(({ bookmarkRepository }) =>
    bookmarkRepository.findByAccount(accountId, pagination),
  );

const saved = (
  h: ConformanceHarness,
  accountId: AccountId,
  targets: readonly BookmarkRef[],
) =>
  h.uow.run(({ bookmarkRepository }) =>
    bookmarkRepository.findSavedTargets(accountId, targets),
  );

const keys = (refs: readonly BookmarkRef[]) =>
  refs.map((ref) => ContentRef.key(ref)).sort();

const targetsOf = (page: { items: readonly Bookmark[] }) =>
  page.items.map((b) => b.target);

/** `spec/testcases/ports/bookmarkRepository.md`. */
export function describeBookmarkRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("BookmarkRepository contract", () => {
    describe("add", () => {
      it("bookmarkRepository#1 アカウント A の保存がない / A の掲載 L の保存（savedAt は T1）を add する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        const b = k.saved(A, L, at(1));
        await expect(add(h, b)).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [b], count: 1 });
        expect(await saved(h, A, [L])).toEqual([L]);
        expect(await h.savedEvents()).toEqual([]);
      });

      it("bookmarkRepository#2 A の掲載 L の保存（T1）がある / A の掲載 L の保存（T2）を add する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        const first = k.saved(A, L, at(1));
        await add(h, first);
        await expect(add(h, k.saved(A, L, at(2)))).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [first], count: 1 });
      });

      it("bookmarkRepository#3 A の保存がない / 同じ ID を持つ掲載の保存と店舗の保存を add する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const id = k.raw();
        const asListing = k.saved(
          A,
          { kind: "listing", id: ListingId.create(id) },
          at(1),
        );
        const asPlace = k.saved(
          A,
          { kind: "place", id: PlaceId.create(id) },
          at(1),
        );
        await add(h, asListing);
        await add(h, asPlace);
        expect(await find(h, A)).toEqual({
          items: [asListing, asPlace],
          count: 2,
        });
      });

      it("bookmarkRepository#4 A の掲載 L の保存がある / アカウント B の掲載 L の保存を add する", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const L = k.listing();
        const a = k.saved(A, L, at(1));
        const b = k.saved(B, L, at(2));
        await add(h, a);
        await expect(add(h, b)).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [a], count: 1 });
        expect(await find(h, B)).toEqual({ items: [b], count: 1 });
      });

      it("bookmarkRepository#5 A の保存がない / A の掲載 L の保存の add を、2つの UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        const bothRead = barrier(2);
        const attempt = (b: Bookmark) =>
          h.uow.run(async ({ bookmarkRepository }) => {
            await bookmarkRepository.findSavedTargets(A, [L]);
            await bothRead();
            await bookmarkRepository.add(b);
          });
        const results = await Promise.allSettled([
          attempt(k.saved(A, L, at(1))),
          attempt(k.saved(A, L, at(2))),
        ]);
        expect(results.map((r) => r.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        const page = await find(h, A);
        expect(page.count).toBe(1);
        expect(page.items[0]?.target).toEqual(L);
      });

      it("bookmarkRepository#6 指す先のない ListingId の保存 / add する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const nowhere = k.listing();
        const b = k.saved(A, nowhere);
        await expect(add(h, b)).resolves.toBeUndefined();
        expect((await find(h, A)).items).toEqual([b]);
      });
    });

    describe("addAll", () => {
      it("bookmarkRepository#7 A の保存がない / 掲載 L（T1）と店舗 P（T2）の保存を addAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const l = k.saved(A, k.listing(), at(1));
        const p = k.saved(A, k.place(), at(2));
        await expect(addAll(h, l, p)).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [p, l], count: 2 });
      });

      it("bookmarkRepository#8 A の掲載 L の保存（T0）がある / 掲載 L（T1）と掲載 M（T2）の保存を addAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const [L, M] = [k.listing(), k.listing()];
        const l0 = k.saved(A, L, at(0));
        await add(h, l0);
        const m = k.saved(A, M, at(2));
        await addAll(h, k.saved(A, L, at(1)), m);
        expect(await find(h, A)).toEqual({ items: [m, l0], count: 2 });
      });

      it("bookmarkRepository#9 A の保存がある / 空の一覧を addAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const b = k.saved(A, k.listing());
        await add(h, b);
        await expect(addAll(h)).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [b], count: 1 });
      });

      it("bookmarkRepository#10 A の保存がない / 1件の一覧を addAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const b = k.saved(A, k.place());
        await addAll(h, b);
        expect(await find(h, A)).toEqual({ items: [b], count: 1 });
      });

      it("bookmarkRepository#11 A の保存がない / 互いに違う対象の101件の一覧を addAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const many = Array.from({ length: 101 }, (_, i) =>
          k.saved(A, i % 2 === 0 ? k.listing() : k.place(), at(i)),
        );
        await expect(addAll(h, ...many)).resolves.toBeUndefined();
        const first = await find(h, A, { page: 1, limit: 100 });
        const second = await find(h, A, { page: 2, limit: 100 });
        expect(first.count).toBe(101);
        expect(keys([...targetsOf(first), ...targetsOf(second)])).toEqual(
          keys(many.map((b) => b.target)),
        );
      });

      it("bookmarkRepository#12 A の保存がない / 同じ一覧を、2回続けて addAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const list = [
          k.saved(A, k.listing(), at(1)),
          k.saved(A, k.place(), at(2)),
        ];
        await addAll(h, ...list);
        const once = await find(h, A);
        await expect(addAll(h, ...list)).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual(once);
      });

      it("bookmarkRepository#13 A の保存がない / UnitOfWork の中で3件を addAll し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ bookmarkRepository }) => {
            await bookmarkRepository.addAll([
              k.saved(A, k.listing()),
              k.saved(A, k.listing()),
              k.saved(A, k.place()),
            ]);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await find(h, A)).toEqual({ items: [], count: 0 });
      });
    });

    describe("remove・removeAllByAccount", () => {
      it("bookmarkRepository#14 A の掲載 L と店舗 P の保存がある / A の L を remove する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const [L, P] = [k.listing(), k.place()];
        const p = k.saved(A, P, at(2));
        await addAll(h, k.saved(A, L, at(1)), p);
        await expect(remove(h, A, L)).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [p], count: 1 });
      });

      it("bookmarkRepository#15 A の保存に掲載 L がない / A の L を remove する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const other = k.saved(A, k.listing());
        await add(h, other);
        await expect(remove(h, A, k.listing())).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [other], count: 1 });
      });

      it("bookmarkRepository#16 A と B が掲載 L の保存を持つ / A の L を remove する", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const L = k.listing();
        const b = k.saved(B, L);
        await addAll(h, k.saved(A, L));
        await add(h, b);
        await remove(h, A, L);
        expect(await find(h, A)).toEqual({ items: [], count: 0 });
        expect(await find(h, B)).toEqual({ items: [b], count: 1 });
      });

      it("bookmarkRepository#17 同じ ID を持つ掲載の保存と店舗の保存がある / 掲載の側を remove する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const id = k.raw();
        const asListing: BookmarkRef = {
          kind: "listing",
          id: ListingId.create(id),
        };
        const asPlace = k.saved(A, { kind: "place", id: PlaceId.create(id) });
        await addAll(h, k.saved(A, asListing), asPlace);
        await remove(h, A, asListing);
        expect(await find(h, A)).toEqual({ items: [asPlace], count: 1 });
      });

      it("bookmarkRepository#18 A の L の保存（T1）を remove した / A の L の保存（T2）を add する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        await add(h, k.saved(A, L, at(1)));
        await remove(h, A, L);
        const again = k.saved(A, L, at(2));
        await add(h, again);
        expect(await find(h, A)).toEqual({ items: [again], count: 1 });
      });

      it("bookmarkRepository#19 A が3件、B が2件の保存を持つ / A で removeAllByAccount する", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        await addAll(
          h,
          k.saved(A, k.listing(), at(1)),
          k.saved(A, k.listing(), at(2)),
          k.saved(A, k.place(), at(3)),
        );
        const bs = [
          k.saved(B, k.listing(), at(2)),
          k.saved(B, k.place(), at(1)),
        ];
        await addAll(h, ...bs);
        await expect(removeAll(h, A)).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [], count: 0 });
        expect(await find(h, B)).toEqual({ items: bs, count: 2 });
      });

      it("bookmarkRepository#20 A の保存がない / A で removeAllByAccount する", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const b = k.saved(B, k.listing());
        await add(h, b);
        await expect(removeAll(h, A)).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [], count: 0 });
        expect(await find(h, B)).toEqual({ items: [b], count: 1 });
      });

      it("bookmarkRepository#21 A の保存を removeAllByAccount で削除した / もう一度 A で removeAllByAccount する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        await addAll(h, k.saved(A, k.listing()), k.saved(A, k.place()));
        await removeAll(h, A);
        await expect(removeAll(h, A)).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [], count: 0 });
      });
    });

    describe("findByAccount", () => {
      it("bookmarkRepository#22 A の保存が3件。savedAt は T1 < T2 < T3 / 読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const [b1, b2, b3] = [
          k.saved(A, k.listing(), at(1)),
          k.saved(A, k.place(), at(2)),
          k.saved(A, k.listing(), at(3)),
        ];
        await addAll(h, b2, b1, b3);
        expect((await find(h, A)).items).toEqual([b3, b2, b1]);
      });

      it("bookmarkRepository#23 A の保存に、savedAt が同じ掲載と店舗 / 読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const p = k.saved(A, k.place(), at(1));
        const l = k.saved(A, k.listing(), at(1));
        await addAll(h, p, l);
        expect((await find(h, A)).items).toEqual([l, p]);
      });

      it("bookmarkRepository#24 A の保存に、savedAt が同じ掲載が2件 / 読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const lower = k.saved(A, k.listing(), at(1));
        const higher = k.saved(A, k.listing(), at(1));
        await addAll(h, higher, lower);
        expect((await find(h, A)).items).toEqual([lower, higher]);
      });

      it("bookmarkRepository#25 A と B が保存を持つ / A で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const as = [
          k.saved(A, k.listing(), at(2)),
          k.saved(A, k.place(), at(1)),
        ];
        await addAll(h, ...as);
        await addAll(
          h,
          k.saved(B, k.listing(), at(3)),
          k.saved(B, k.listing(), at(4)),
          k.saved(B, k.place(), at(5)),
        );
        expect(await find(h, A)).toEqual({ items: as, count: 2 });
      });

      it("bookmarkRepository#26 A の保存に、指す先のない対象の保存がある / 読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const nowhere = k.saved(A, k.place(), at(1));
        await add(h, nowhere);
        expect(await find(h, A)).toEqual({ items: [nowhere], count: 1 });
      });

      it("bookmarkRepository#27 返された保存 / 内容を確かめる", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        const savedAt = new Date("2026-09-01T12:34:56.789Z");
        await add(h, k.saved(A, L, savedAt));
        const [item] = (await find(h, A)).items;
        expect(item?.accountId).toBe(A);
        expect(item?.target).toEqual({ kind: "listing", id: L.id });
        expect(item?.savedAt).toEqual(savedAt);
      });

      const withSaves = async (n: number) => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const saves = Array.from({ length: n }, (_, i) =>
          k.saved(A, k.listing(), at(i)),
        );
        await addAll(h, ...saves);
        return { h, A, newest: [...saves].reverse() };
      };

      it("bookmarkRepository#28 A の保存が0件 / page: 1, limit: 10 で読む", async () => {
        const { h, A } = await withSaves(0);
        expect(await find(h, A, { page: 1, limit: 10 })).toEqual({
          items: [],
          count: 0,
        });
      });

      it("bookmarkRepository#29 A の保存が1件 / page: 1, limit: 10 で読む", async () => {
        const { h, A, newest } = await withSaves(1);
        expect(await find(h, A, { page: 1, limit: 10 })).toEqual({
          items: newest,
          count: 1,
        });
      });

      it("bookmarkRepository#30 A の保存が10件 / page: 1, limit: 10 で読む", async () => {
        const { h, A, newest } = await withSaves(10);
        expect(await find(h, A, { page: 1, limit: 10 })).toEqual({
          items: newest,
          count: 10,
        });
      });

      it("bookmarkRepository#31 A の保存が10件 / page: 2, limit: 10 で読む", async () => {
        const { h, A } = await withSaves(10);
        expect(await find(h, A, { page: 2, limit: 10 })).toEqual({
          items: [],
          count: 10,
        });
      });

      it("bookmarkRepository#32 A の保存が11件 / page: 1, limit: 10 と page: 2, limit: 10 で読む", async () => {
        const { h, A, newest } = await withSaves(11);
        const first = await find(h, A, { page: 1, limit: 10 });
        const second = await find(h, A, { page: 2, limit: 10 });
        expect(first.items).toEqual(newest.slice(0, 10));
        expect(second.items).toEqual(newest.slice(10));
        expect([first.count, second.count]).toEqual([11, 11]);
      });
    });

    describe("findSavedTargets", () => {
      it("bookmarkRepository#33 A が掲載 L と店舗 P を保存している。掲載 M は保存していない / L・M・P を渡す", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const [L, M, P] = [k.listing(), k.listing(), k.place()];
        await addAll(h, k.saved(A, L), k.saved(A, P));
        expect(keys(await saved(h, A, [L, M, P]))).toEqual(keys([L, P]));
      });

      it("bookmarkRepository#34 A が何も保存していない / L を渡す", async () => {
        const h = await makeHarness();
        const k = kit();
        expect(await saved(h, k.account(), [k.listing()])).toEqual([]);
      });

      it("bookmarkRepository#35 A が掲載 L を保存している / 空の一覧を渡す", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        await add(h, k.saved(A, k.listing()));
        expect(await saved(h, A, [])).toEqual([]);
      });

      it("bookmarkRepository#36 A が掲載 L を保存している / L だけを渡す", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        await add(h, k.saved(A, L));
        expect(await saved(h, A, [L])).toEqual([L]);
      });

      it("bookmarkRepository#37 A が ID x の掲載を保存している。ID x の店舗は保存していない / ID x の掲載と店舗を渡す", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const x = k.raw();
        const asListing: BookmarkRef = {
          kind: "listing",
          id: ListingId.create(x),
        };
        const asPlace: BookmarkRef = { kind: "place", id: PlaceId.create(x) };
        await add(h, k.saved(A, asListing));
        expect(await saved(h, A, [asListing, asPlace])).toEqual([asListing]);
      });

      it("bookmarkRepository#38 B が掲載 L を保存している。A は保存していない / A で L を渡す", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const L = k.listing();
        await add(h, k.saved(B, L));
        expect(await saved(h, A, [L])).toEqual([]);
      });

      it("bookmarkRepository#39 A が100件の対象を保存している / その100件を渡す", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const targets = Array.from({ length: 100 }, (_, i) =>
          i % 2 === 0 ? k.listing() : k.place(),
        );
        await addAll(h, ...targets.map((t) => k.saved(A, t)));
        expect(keys(await saved(h, A, targets))).toEqual(keys(targets));
      });

      it("bookmarkRepository#40 A が掲載 L を保存している / 保存していない対象を100件渡す", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        await add(h, k.saved(A, k.listing()));
        const others = Array.from({ length: 100 }, () => k.listing());
        expect(await saved(h, A, others)).toEqual([]);
      });

      it("bookmarkRepository#41 A が掲載 L を保存している / L を含む101件の対象を渡す", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        await add(h, k.saved(A, L));
        const targets = [L, ...Array.from({ length: 100 }, () => k.place())];
        const error = await saved(h, A, targets).then(
          () => undefined,
          (reason: unknown) => reason,
        );
        expect(error).toBeInstanceOf(BusinessRuleError);
        expect((error as BusinessRuleError<string>).code).toBe(
          CommonErrorCode.InvalidInput,
        );
      });
    });

    describe("並行性", () => {
      it("bookmarkRepository#42 A の掲載 L の保存がある / L の remove を確定し、その後に L の add を確定する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        await add(h, k.saved(A, L, at(1)));
        await expect(remove(h, A, L)).resolves.toBeUndefined();
        await expect(add(h, k.saved(A, L, at(2)))).resolves.toBeUndefined();
        expect(await saved(h, A, [L])).toEqual([L]);
      });

      it("bookmarkRepository#43 A の掲載 L の保存がある / L の add を確定し、その後に L の remove を確定する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        await add(h, k.saved(A, L, at(1)));
        await expect(add(h, k.saved(A, L, at(2)))).resolves.toBeUndefined();
        await expect(remove(h, A, L)).resolves.toBeUndefined();
        expect(await saved(h, A, [L])).toEqual([]);
      });

      it("bookmarkRepository#44 A の掲載 L の保存がある / L の remove と L の add を、2つの UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        await add(h, k.saved(A, L, at(1)));
        const bothRead = barrier(2);
        const results = await Promise.allSettled([
          h.uow.run(async ({ bookmarkRepository }) => {
            await bookmarkRepository.findSavedTargets(A, [L]);
            await bothRead();
            await bookmarkRepository.remove(A, L);
          }),
          h.uow.run(async ({ bookmarkRepository }) => {
            await bookmarkRepository.findSavedTargets(A, [L]);
            await bothRead();
            await bookmarkRepository.add(k.saved(A, L, at(2)));
          }),
        ]);
        expect(results.map((r) => r.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        expect((await find(h, A)).count).toBeLessThanOrEqual(1);
      });

      it("bookmarkRepository#45 A の掲載 L の保存がある / L の remove を、2つの UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        await add(h, k.saved(A, L));
        const bothRead = barrier(2);
        const attempt = () =>
          h.uow.run(async ({ bookmarkRepository }) => {
            await bookmarkRepository.findSavedTargets(A, [L]);
            await bothRead();
            await bookmarkRepository.remove(A, L);
          });
        const results = await Promise.allSettled([attempt(), attempt()]);
        expect(results.map((r) => r.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        expect(await find(h, A)).toEqual({ items: [], count: 0 });
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("bookmarkRepository#46 UnitOfWork の中で add し、コミットした / コミットの直後に findByAccount・findSavedTargets で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        const b = k.saved(A, L);
        await add(h, b);
        expect((await find(h, A)).items).toEqual([b]);
        expect(await saved(h, A, [L])).toEqual([L]);
      });

      it("bookmarkRepository#47 UnitOfWork の中で remove し、コミットした / コミットの直後に findByAccount・findSavedTargets で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        await add(h, k.saved(A, L));
        await remove(h, A, L);
        expect((await find(h, A)).items).toEqual([]);
        expect(await saved(h, A, [L])).toEqual([]);
      });

      it("bookmarkRepository#48 A の保存がない / UnitOfWork の中で add し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ bookmarkRepository }) => {
            await bookmarkRepository.add(k.saved(A, k.listing()));
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await find(h, A)).toEqual({ items: [], count: 0 });
      });

      it("bookmarkRepository#49 A の掲載 L の保存がある / UnitOfWork の中で remove し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const L = k.listing();
        const b = k.saved(A, L);
        await add(h, b);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ bookmarkRepository }) => {
            await bookmarkRepository.remove(A, L);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect((await find(h, A)).items).toEqual([b]);
      });

      it("bookmarkRepository#50 A の保存が3件 / UnitOfWork の中で removeAllByAccount し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        await addAll(
          h,
          k.saved(A, k.listing(), at(1)),
          k.saved(A, k.listing(), at(2)),
          k.saved(A, k.place(), at(3)),
        );
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ bookmarkRepository }) => {
            await bookmarkRepository.removeAllByAccount(A);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect((await find(h, A)).count).toBe(3);
      });
    });
  });
}
