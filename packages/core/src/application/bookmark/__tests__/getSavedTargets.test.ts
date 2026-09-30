import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Listing } from "@repo/core/domain/listing/listing";
import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "../../errors";
import { asSet, bookmarkKit, listingRef, placeRef } from "./kit";

describe("getSavedTargets", () => {
  it("getSavedTargets#1 掲載 L と店舗 P を保存済み。掲載 M は保存していない / L、M、P を示して読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const L = listingRef(await k.w.available(place.id));
    const M = listingRef(await k.w.available(place.id));
    const P = placeRef(place);
    await k.save(A.actor, L);
    await k.save(A.actor, P);
    expect(asSet(await k.savedTargets(A.actor, [L, M, P]))).toEqual(
      asSet([L, P]),
    );
  });

  it("getSavedTargets#2 何も保存していない / L を示して読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const L = listingRef(await k.w.available((await k.w.place()).id));
    expect(await k.savedTargets(A.actor, [L])).toEqual([]);
  });

  it("getSavedTargets#3 掲載 L を保存済み / 空の一覧を示して読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    await k.save(A.actor, k.nowhereListing());
    expect(await k.savedTargets(A.actor, [])).toEqual([]);
  });

  it("getSavedTargets#4 掲載 L を保存済み。L が紐づく店舗 P は保存していない / L と P を示して読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    const L = listingRef(await k.w.available(place.id));
    await k.save(A.actor, L);
    expect(await k.savedTargets(A.actor, [L, placeRef(place)])).toEqual([L]);
  });

  it("getSavedTargets#5 保存済みの掲載 L を removeBookmark で解除した / L を示して読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const L = listingRef(await k.w.available((await k.w.place()).id));
    await k.save(A.actor, L);
    await k.remove(A.actor, L);
    expect(await k.savedTargets(A.actor, [L])).toEqual([]);
  });

  it("getSavedTargets#6 保存済みの掲載 L が、その後に閲覧できなくなった / L を示して読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const listing = await k.w.available((await k.w.place()).id);
    const L = listingRef(listing);
    await k.save(A.actor, L);
    await k.w.updateListing(
      listing,
      (s) => Listing.unpublish(s, k.w.f.tick()).entity,
    );
    expect((await k.resolve([L])).items).toEqual([{ ref: L, viewable: false }]);
    expect(await k.savedTargets(A.actor, [L])).toEqual([L]);
  });

  it("getSavedTargets#7 利用者 B が掲載 L を保存済み。利用者 A は保存していない / A として L を示して読む", async () => {
    const k = await bookmarkKit();
    const [A, B] = [await k.person(), await k.person()];
    const L = listingRef(await k.w.available((await k.w.place()).id));
    await k.save(B.actor, L);
    expect(await k.savedTargets(A.actor, [L])).toEqual([]);
  });

  it("refuses more than 100 targets and a signed-out read", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const many = Array.from({ length: 101 }, () => k.nowhereListing());
    const error = await k.savedTargets(A.actor, many).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect((error as BusinessRuleError<string>).code).toBe(
      CommonErrorCode.InvalidInput,
    );
    expect(await k.savedTargets(A.actor, many.slice(0, 100))).toEqual([]);
    await expect(k.savedTargets(null, [])).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
