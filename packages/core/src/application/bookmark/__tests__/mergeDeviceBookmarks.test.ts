import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Listing } from "@repo/core/domain/listing/listing";
import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "../../errors";
import {
  type BookmarkKit,
  bookmarkKit,
  listingRef,
  MINUTE,
  placeRef,
} from "./kit";

/** `n` minutes before the kit's current time. */
const ago = (k: BookmarkKit, n: number): Date =>
  new Date(k.clock.now().getTime() - n * MINUTE);

describe("mergeDeviceBookmarks", () => {
  it("mergeDeviceBookmarks#1 アカウントの保存はない。端末の保存に、掲載 L（T1）と店舗 P（T2） / ログインが成立した後に、端末の保存の一覧を渡して合流する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const L = listingRef(await k.w.available(place.id));
    const P = placeRef(place);
    const [T1, T2] = [ago(k, 30), ago(k, 20)];
    const events = await k.eventCount();
    await expect(
      k.merge(A.actor, [
        { target: L, savedAt: T1 },
        { target: P, savedAt: T2 },
      ]),
    ).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual({
      items: [
        { target: P, savedAt: T2 },
        { target: L, savedAt: T1 },
      ],
      count: 2,
    });
    expect(await k.eventCount()).toBe(events);
  });

  /** Account: L at T0 and K; device: L at T1, M at T2 (T0 < T1 < T2). */
  const mergedOverAccount = async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const L = listingRef(await k.w.available(place.id));
    const M = listingRef(await k.w.available(place.id));
    const K = placeRef(place);
    const T0 = k.clock.now();
    await k.save(A.actor, L);
    k.tick();
    const TK = k.tick();
    await k.save(A.actor, K);
    k.tick();
    k.tick();
    const [T1, T2] = [new Date(T0.getTime() + MINUTE), ago(k, 1)];
    await k.merge(A.actor, [
      { target: L, savedAt: T1 },
      { target: M, savedAt: T2 },
    ]);
    return { k, A, L, M, K, T0, TK, T2 };
  };

  it("mergeDeviceBookmarks#2 アカウントの保存に掲載 L（T0）。端末の保存に掲載 L（T1）と掲載 M（T2） / 合流する", async () => {
    const { k, A, L, M, T0, T2 } = await mergedOverAccount();
    const page = await k.list(A.actor);
    expect(page.items.filter((item) => item.target.id === L.id)).toEqual([
      { target: L, savedAt: T0 },
    ]);
    expect(page.items).toContainEqual({ target: M, savedAt: T2 });
  });

  it("mergeDeviceBookmarks#3 上の合流の後 / listBookmarks を読む", async () => {
    const { k, A, L, M, K, T0, TK, T2 } = await mergedOverAccount();
    expect(await k.list(A.actor)).toEqual({
      items: [
        { target: M, savedAt: T2 },
        { target: K, savedAt: TK },
        { target: L, savedAt: T0 },
      ],
      count: 3,
    });
  });

  it("mergeDeviceBookmarks#4 端末の保存に、同じ掲載 L が2つ（T1 と、より新しい T2） / 合流する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const L = listingRef(await k.w.available((await k.w.place()).id));
    const [T1, T2] = [ago(k, 10), ago(k, 5)];
    await k.merge(A.actor, [
      { target: L, savedAt: T1 },
      { target: L, savedAt: T2 },
    ]);
    expect(await k.list(A.actor)).toEqual({
      items: [{ target: L, savedAt: T2 }],
      count: 1,
    });
  });

  it("mergeDeviceBookmarks#5 端末の保存に、閲覧できなくなった掲載と、削除された掲載 / 合流する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const hidden = await k.w.available(place.id);
    await k.w.updateListing(
      hidden,
      (s) => Listing.unpublish(s, k.w.f.tick()).entity,
    );
    const deleted = await k.w.available(place.id);
    await k.w.deleteListing(deleted);
    const [H, D] = [listingRef(hidden), listingRef(deleted)];
    await expect(
      k.merge(A.actor, [
        { target: H, savedAt: ago(k, 2) },
        { target: D, savedAt: ago(k, 1) },
      ]),
    ).resolves.toBeUndefined();
    expect(await k.listed(A.actor)).toEqual([D, H]);
  });

  it("mergeDeviceBookmarks#6 端末の保存に、現在より後の日時を持つ掲載 / 合流する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const L = listingRef(await k.w.available((await k.w.place()).id));
    const now = k.clock.now();
    await expect(
      k.merge(A.actor, [
        { target: L, savedAt: new Date(now.getTime() + 60 * MINUTE) },
      ]),
    ).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual({
      items: [{ target: L, savedAt: now }],
      count: 1,
    });
  });

  it("mergeDeviceBookmarks#7 端末の保存がない（空の一覧） / 合流する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    await k.save(A.actor, k.nowhereListing());
    const before = await k.list(A.actor);
    await expect(k.merge(A.actor, [])).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual(before);
  });

  it("mergeDeviceBookmarks#8 端末の保存に、掲載 L・M と店舗 P / L・M の一覧と P の一覧に分けて、2回合流する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const L = listingRef(await k.w.available(place.id));
    const M = listingRef(await k.w.available(place.id));
    const P = placeRef(place);
    await expect(
      k.merge(A.actor, [
        { target: L, savedAt: ago(k, 3) },
        { target: M, savedAt: ago(k, 2) },
      ]),
    ).resolves.toBeUndefined();
    await expect(
      k.merge(A.actor, [{ target: P, savedAt: ago(k, 1) }]),
    ).resolves.toBeUndefined();
    expect(await k.listed(A.actor)).toEqual([P, M, L]);
  });

  it("mergeDeviceBookmarks#9 合流が成立した後、端末の側で一覧を空にする前に通信が途切れた / 同じ一覧でもう一度合流する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const device = [
      {
        target: listingRef(await k.w.available(place.id)),
        savedAt: ago(k, 3),
      },
      { target: placeRef(place), savedAt: ago(k, 2) },
    ];
    await k.merge(A.actor, device);
    const first = await k.list(A.actor);
    k.tick();
    await expect(k.merge(A.actor, device)).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual(first);
  });

  it("mergeDeviceBookmarks#10 端末 1 で合流を済ませたアカウント。端末 2 の保存に掲載 N / 端末 2 でログインして合流する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const L = listingRef(await k.w.available(place.id));
    const N = listingRef(await k.w.available(place.id));
    const device1 = { accountId: A.actor.accountId };
    const device2 = { accountId: A.actor.accountId };
    await k.merge(device1, [{ target: L, savedAt: ago(k, 5) }]);
    k.tick();
    await k.merge(device2, [{ target: N, savedAt: ago(k, 1) }]);
    expect(await k.listed(device1)).toEqual([N, L]);
  });

  it("mergeDeviceBookmarks#11 利用者 A の端末の保存 / A として合流する", async () => {
    const k = await bookmarkKit();
    const [A, B] = [await k.person(), await k.person()];
    const place = await k.w.place();
    const P = placeRef(place);
    const L = listingRef(await k.w.available(place.id));
    await k.save(B.actor, P);
    const before = await k.list(B.actor);
    await k.merge(A.actor, [{ target: L, savedAt: ago(k, 1) }]);
    expect(await k.listed(A.actor)).toEqual([L]);
    expect(await k.list(B.actor)).toEqual(before);
  });

  it("refuses more than 100 device saves and stores none of them", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const device = Array.from({ length: 101 }, (_, i) => ({
      target: i % 2 === 0 ? k.nowhereListing() : k.nowherePlace(),
      savedAt: ago(k, 1),
    }));
    const error = await k.merge(A.actor, device).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect((error as BusinessRuleError<string>).code).toBe(
      CommonErrorCode.InvalidInput,
    );
    expect((await k.list(A.actor)).count).toBe(0);
    await k.merge(A.actor, device.slice(0, 100));
    await k.merge(A.actor, device.slice(100));
    expect((await k.list(A.actor)).count).toBe(101);
  });

  it("refuses an invalid device time and a signed-out merge", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    await expect(
      k.merge(A.actor, [
        { target: k.nowhereListing(), savedAt: new Date(Number.NaN) },
      ]),
    ).rejects.toMatchObject({ code: CommonErrorCode.InvalidInput });
    await expect(k.merge(null, [])).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
