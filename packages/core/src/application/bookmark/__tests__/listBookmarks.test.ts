import { Listing } from "@repo/core/domain/listing/listing";
import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "../../errors";
import { bookmarkKit, listingRef, placeRef } from "./kit";

describe("listBookmarks", () => {
  it("listBookmarks#1 掲載 L を T1、店舗 P を T2、掲載 M を T3 に保存（T1 < T2 < T3） / 1ページ目を読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const L = listingRef(await k.w.available(place.id));
    const P = placeRef(place);
    const M = listingRef(await k.w.available(place.id));
    const T1 = k.tick();
    await k.save(A.actor, L);
    const T2 = k.tick();
    await k.save(A.actor, P);
    const T3 = k.tick();
    await k.save(A.actor, M);
    expect(await k.list(A.actor, { page: 1, limit: 20 })).toEqual({
      items: [
        { target: M, savedAt: T3 },
        { target: P, savedAt: T2 },
        { target: L, savedAt: T1 },
      ],
      count: 3,
    });
  });

  it("listBookmarks#2 保存が1件もない / 1ページ目を読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    expect(await k.list(A.actor, { page: 1, limit: 20 })).toEqual({
      items: [],
      count: 0,
    });
  });

  it("listBookmarks#3 保存した掲載が、その後に一時非公開になった / 読み、返された参照を Discovery の resolveReferences に渡す", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const older = listingRef(await k.w.available(place.id));
    const hidden = await k.w.available(place.id);
    const H = listingRef(hidden);
    const newer = placeRef(place);
    await k.save(A.actor, older);
    k.tick();
    await k.save(A.actor, H);
    const savedAt = k.clock.now();
    k.tick();
    await k.save(A.actor, newer);
    await k.w.updateListing(
      hidden,
      (s) => Listing.unpublish(s, k.w.f.tick()).entity,
    );
    const page = await k.list(A.actor);
    expect(page.count).toBe(3);
    expect(page.items[1]).toEqual({ target: H, savedAt });
    const resolved = await k.resolve(page.items.map((item) => item.target));
    expect(
      resolved.items.map((item) => ({
        ref: item.ref,
        viewable: item.viewable,
      })),
    ).toEqual([
      { ref: newer, viewable: true },
      { ref: H, viewable: false },
      { ref: older, viewable: true },
    ]);
    expect(resolved.items[1]).toEqual({ ref: H, viewable: false });
  });

  it("listBookmarks#4 保存した掲載が、その後に削除された / 読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const listing = await k.w.available((await k.w.place()).id);
    const L = listingRef(listing);
    await k.save(A.actor, L);
    await k.w.deleteListing(listing);
    expect(await k.list(A.actor)).toEqual({
      items: [{ target: L, savedAt: k.clock.now() }],
      count: 1,
    });
  });

  it("listBookmarks#5 閲覧できなくなった保存を解除せずに残し、その後に掲載が再公開された / 読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const listing = await k.w.available((await k.w.place()).id);
    const L = listingRef(listing);
    await k.save(A.actor, L);
    const savedAt = k.clock.now();
    await k.w.updateListing(
      listing,
      (s) => Listing.unpublish(s, k.w.f.tick()).entity,
    );
    k.tick();
    await k.w.updateListing(
      listing,
      (s) => Listing.publish(s, k.w.f.tick()).entity,
    );
    expect(await k.list(A.actor)).toEqual({
      items: [{ target: L, savedAt }],
      count: 1,
    });
    expect((await k.resolve([L])).items[0]?.viewable).toBe(true);
  });

  it("listBookmarks#6 別の端末で保存・解除した / 読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const kept = placeRef(place);
    const dropped = listingRef(await k.w.available(place.id));
    const added = listingRef(await k.w.available(place.id));
    await k.save(A.actor, kept);
    await k.save(A.actor, dropped);
    expect(await k.listed(A.actor)).toHaveLength(2);
    const otherDevice = { accountId: A.actor.accountId };
    k.tick();
    await k.save(otherDevice, added);
    await k.remove(otherDevice, dropped);
    expect(await k.listed(A.actor)).toEqual([added, kept]);
  });

  it("listBookmarks#7 利用者 A と利用者 B がそれぞれ保存を持つ / A として読む", async () => {
    const k = await bookmarkKit();
    const [A, B] = [await k.person(), await k.person()];
    const place = await k.w.place();
    const L = listingRef(await k.w.available(place.id));
    const P = placeRef(place);
    await k.save(A.actor, L);
    k.tick();
    await k.save(B.actor, P);
    await k.save(B.actor, L);
    expect(await k.list(A.actor)).toEqual({
      items: [{ target: L, savedAt: expect.any(Date) }],
      count: 1,
    });
  });

  it("listBookmarks#8 ログインしていない / 読む", async () => {
    const k = await bookmarkKit();
    await expect(k.list(null)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(k.list(null)).rejects.toMatchObject({
      code: "LOGIN_REQUIRED",
    });
  });
});
