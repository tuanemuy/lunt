import { Listing } from "@repo/core/domain/listing/listing";
import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "../../errors";
import { asSet, bookmarkKit, listingRef, placeRef } from "./kit";

describe("saveBookmark", () => {
  it("saveBookmark#1 ログインした利用者。閲覧できる掲載を保存していない / その掲載を保存する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const P = await k.w.place();
    const L = listingRef(await k.w.available(P.id));
    const earlier = k.nowhereListing();
    await k.save(A.actor, earlier);
    const events = await k.eventCount();
    const now = k.tick();
    await expect(k.save(A.actor, L)).resolves.toBeUndefined();
    const page = await k.list(A.actor);
    expect(page.items[0]).toEqual({ target: L, savedAt: now });
    expect(page.count).toBe(2);
    expect(await k.savedTargets(A.actor, [L])).toEqual([L]);
    expect(await k.eventCount()).toBe(events);
  });

  it("saveBookmark#2 ログインした利用者。閲覧できる店舗を保存していない / その店舗を保存する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const P = placeRef(await k.w.place());
    await k.save(A.actor, P);
    expect(await k.list(A.actor)).toEqual({
      items: [{ target: P, savedAt: k.clock.now() }],
      count: 1,
    });
  });

  it("saveBookmark#3 掲載と、その掲載が紐づく店舗。どちらも保存していない / 掲載だけを保存する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const P = placeRef(place);
    const L = listingRef(await k.w.available(place.id));
    await k.save(A.actor, L);
    expect(await k.savedTargets(A.actor, [L, P])).toEqual([L]);
    expect(await k.listed(A.actor)).toEqual([L]);
  });

  it("saveBookmark#4 すでに保存済みの掲載 / 同じ掲載をもう一度保存する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const L = listingRef(await k.w.available((await k.w.place()).id));
    await k.save(A.actor, L);
    const first = k.clock.now();
    k.tick();
    await expect(k.save(A.actor, L)).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual({
      items: [{ target: L, savedAt: first }],
      count: 1,
    });
  });

  it("saveBookmark#5 同じアカウントの別の端末で、同じ掲載の保存が先に確定している / その掲載を保存する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const L = listingRef(await k.w.available((await k.w.place()).id));
    const otherDevice = { accountId: A.actor.accountId };
    await k.save(otherDevice, L);
    const committed = k.clock.now();
    k.tick();
    await expect(k.save(A.actor, L)).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual({
      items: [{ target: L, savedAt: committed }],
      count: 1,
    });
  });

  it("saveBookmark#6 表示した後に、一時非公開になった掲載 / その掲載を保存する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const listing = await k.w.available((await k.w.place()).id);
    await k.w.updateListing(
      listing,
      (s) => Listing.unpublish(s, k.w.f.tick()).entity,
    );
    const L = listingRef(listing);
    await expect(k.save(A.actor, L)).resolves.toBeUndefined();
    expect(await k.savedTargets(A.actor, [L])).toEqual([L]);
    const refs = await k.listed(A.actor);
    expect((await k.resolve(refs)).items).toEqual([
      { ref: L, viewable: false },
    ]);
  });

  it("saveBookmark#7 表示した後に、運営によって非公開になった店舗 / その店舗を保存する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const P = placeRef(await k.w.place({ suspended: true }));
    await expect(k.save(A.actor, P)).resolves.toBeUndefined();
    expect(await k.listed(A.actor)).toEqual([P]);
    expect((await k.resolve([P])).items).toEqual([{ ref: P, viewable: false }]);
  });

  it("saveBookmark#8 削除された掲載（存在しない ListingId） / その掲載を保存する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const gone = await k.w.available((await k.w.place()).id);
    await k.w.deleteListing(gone);
    const L = listingRef(gone);
    const never = k.nowhereListing();
    await expect(k.save(A.actor, L)).resolves.toBeUndefined();
    k.tick();
    await expect(k.save(A.actor, never)).resolves.toBeUndefined();
    expect(await k.listed(A.actor)).toEqual([never, L]);
  });

  it("saveBookmark#9 保存済みの掲載が、その後に一時非公開になった / 同じ掲載をもう一度保存する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const listing = await k.w.available((await k.w.place()).id);
    const L = listingRef(listing);
    await k.save(A.actor, L);
    const first = k.clock.now();
    await k.w.updateListing(
      listing,
      (s) => Listing.unpublish(s, k.w.f.tick()).entity,
    );
    k.tick();
    await expect(k.save(A.actor, L)).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual({
      items: [{ target: L, savedAt: first }],
      count: 1,
    });
  });

  it("saveBookmark#10 時刻 T に保存した掲載が一時非公開になり、保存一覧で解除した / 同じ掲載を時刻 U に保存し直す", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const listing = await k.w.available(place.id);
    const L = listingRef(listing);
    await k.save(A.actor, L);
    k.tick();
    const P = placeRef(place);
    await k.save(A.actor, P);
    await k.w.updateListing(
      listing,
      (s) => Listing.unpublish(s, k.w.f.tick()).entity,
    );
    await k.remove(A.actor, L);
    const U = k.tick();
    await expect(k.save(A.actor, L)).resolves.toBeUndefined();
    const page = await k.list(A.actor);
    expect(page.items[0]).toEqual({ target: L, savedAt: U });
    expect(page.items.map((item) => item.target)).toEqual([L, P]);
  });

  it("saveBookmark#11 利用者 A と利用者 B。どちらも保存していない / A が掲載を保存する", async () => {
    const k = await bookmarkKit();
    const [A, B] = [await k.person(), await k.person()];
    const L = listingRef(await k.w.available((await k.w.place()).id));
    await k.save(A.actor, L);
    expect(await k.listed(A.actor)).toEqual([L]);
    expect(await k.list(B.actor)).toEqual({ items: [], count: 0 });
    expect(await k.savedTargets(B.actor, [L])).toEqual([]);
  });

  it("refuses a signed-out save and stores nothing", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const L = k.nowhereListing();
    await expect(k.save(null, L)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(k.save(null, L)).rejects.toMatchObject({
      code: "LOGIN_REQUIRED",
    });
    expect(asSet(await k.savedTargets(A.actor, [L])).size).toBe(0);
  });
});
