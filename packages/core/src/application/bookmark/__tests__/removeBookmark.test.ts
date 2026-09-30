import { Listing } from "@repo/core/domain/listing/listing";
import { Place } from "@repo/core/domain/place/place";
import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "../../errors";
import { bookmarkKit, listingRef, placeRef } from "./kit";

describe("removeBookmark", () => {
  it("removeBookmark#1 保存済みの、閲覧できる掲載 / その掲載の保存を解除する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const L = listingRef(await k.w.available((await k.w.place()).id));
    await k.save(A.actor, L);
    const events = await k.eventCount();
    await expect(k.remove(A.actor, L)).resolves.toBeUndefined();
    expect(await k.savedTargets(A.actor, [L])).toEqual([]);
    expect(await k.list(A.actor)).toEqual({ items: [], count: 0 });
    expect(await k.eventCount()).toBe(events);
  });

  it("removeBookmark#2 保存済みの掲載が、その後に一時非公開になった / その掲載の保存を解除する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const listing = await k.w.available((await k.w.place()).id);
    const L = listingRef(listing);
    await k.save(A.actor, L);
    await k.w.updateListing(
      listing,
      (s) => Listing.unpublish(s, k.w.f.tick()).entity,
    );
    await expect(k.remove(A.actor, L)).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual({ items: [], count: 0 });
  });

  it("removeBookmark#3 保存済みの掲載が、その後に削除された / その掲載の保存を解除する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const listing = await k.w.available((await k.w.place()).id);
    const L = listingRef(listing);
    await k.save(A.actor, L);
    await k.w.deleteListing(listing);
    await expect(k.remove(A.actor, L)).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual({ items: [], count: 0 });
  });

  it("removeBookmark#4 保存済みの店舗が、その後に非公開になった / その店舗の保存を解除する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const P = placeRef(place);
    await k.save(A.actor, P);
    await k.w.updatePlace(place, (s) => Place.suspend(s, k.w.f.tick()).entity);
    expect((await k.resolve([P])).items).toEqual([{ ref: P, viewable: false }]);
    await expect(k.remove(A.actor, P)).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual({ items: [], count: 0 });
  });

  it("removeBookmark#5 保存していない掲載 / その掲載の保存を解除する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const kept = k.nowherePlace();
    await k.save(A.actor, kept);
    const before = await k.list(A.actor);
    await expect(
      k.remove(A.actor, k.nowhereListing()),
    ).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual(before);
  });

  it("removeBookmark#6 同じアカウントの別の端末で、同じ掲載の解除が先に確定している / その掲載の保存を解除する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const L = listingRef(await k.w.available((await k.w.place()).id));
    await k.save(A.actor, L);
    await k.remove({ accountId: A.actor.accountId }, L);
    await expect(k.remove(A.actor, L)).resolves.toBeUndefined();
    expect(await k.list(A.actor)).toEqual({ items: [], count: 0 });
  });

  it("removeBookmark#7 掲載と、その掲載が紐づく店舗の両方を保存済み / 掲載の保存だけを解除する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const P = placeRef(place);
    const L = listingRef(await k.w.available(place.id));
    await k.save(A.actor, P);
    await k.save(A.actor, L);
    await k.remove(A.actor, L);
    expect(await k.savedTargets(A.actor, [L, P])).toEqual([P]);
    expect(await k.listed(A.actor)).toEqual([P]);
  });

  it("removeBookmark#8 解除した掲載 / 同じ掲載をもう一度 saveBookmark で保存する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const L = listingRef(await k.w.available((await k.w.place()).id));
    await k.save(A.actor, L);
    await k.remove(A.actor, L);
    const again = k.tick();
    await k.save(A.actor, L);
    expect(await k.list(A.actor)).toEqual({
      items: [{ target: L, savedAt: again }],
      count: 1,
    });
  });

  it("removeBookmark#9 利用者 A と利用者 B が同じ掲載を保存済み / A が保存を解除する", async () => {
    const k = await bookmarkKit();
    const [A, B] = [await k.person(), await k.person()];
    const L = listingRef(await k.w.available((await k.w.place()).id));
    await k.save(A.actor, L);
    await k.save(B.actor, L);
    await k.remove(A.actor, L);
    expect(await k.listed(A.actor)).toEqual([]);
    expect(await k.listed(B.actor)).toEqual([L]);
  });

  it("refuses a signed-out removal", async () => {
    const k = await bookmarkKit();
    await expect(k.remove(null, k.nowhereListing())).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
