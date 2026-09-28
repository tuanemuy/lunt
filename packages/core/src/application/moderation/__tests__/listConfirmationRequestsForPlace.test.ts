import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import type { ModerationKit } from "./kit";
import { moderationKit } from "./kit";

/** A place with one steward, a reporter and an operator. */
async function setup(k: ModerationKit, name = "一号店") {
  const placeId = await k.place(name);
  const m = await k.manager(placeId);
  const reporter = await k.person("reporter");
  const op = await k.operator();
  return { placeId, m, reporter, op };
}

describe("listConfirmationRequestsForPlace", () => {
  it("listConfirmationRequestsForPlace#1 店舗 P に、店舗を対象にした確認依頼中の連絡と、P の掲載を対象にした確認依頼中の連絡がある。操作する人は P の店舗管理者 / P の依頼の一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter, op } = await setup(k);
    const listing = await k.published(m, placeId, { name: "限定メニュー" });
    const onPlace = await k.report(reporter, {
      target: { kind: "place", placeId },
      content: "営業時間が違います",
    });
    const onListing = await k.report(reporter, {
      target: { kind: "listing", listingId: listing.id },
      category: "closure",
      content: "販売を終えています",
    });
    const firstAt = k.tick();
    await k.request(op, onPlace);
    const secondAt = k.tick();
    await k.request(op, onListing);
    const result = await k.requestsFor(m, placeId);
    expect(result.count).toBe(2);
    expect(result.items).toEqual([
      {
        reportId: onListing,
        target: {
          target: { kind: "listing", placeId, listingId: listing.id },
          placeName: "一号店",
          listingName: "限定メニュー",
          exists: true,
        },
        category: "closure",
        content: "販売を終えています",
        requestedAt: secondAt,
      },
      {
        reportId: onPlace,
        target: {
          target: { kind: "place", placeId },
          placeName: "一号店",
          listingName: null,
          exists: true,
        },
        category: "incorrectInfo",
        content: "営業時間が違います",
        requestedAt: firstAt,
      },
    ]);
  });

  it("listConfirmationRequestsForPlace#2 店舗 P に、未対応の連絡、確認依頼中の連絡、依頼を経て対応済みになった連絡が1件ずつある / P の店舗管理者が一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter, op } = await setup(k);
    const target = { kind: "place", placeId } as const;
    await k.report(reporter, { target });
    const requested = await k.report(reporter, { target });
    const resolved = await k.report(reporter, { target });
    await k.request(op, requested);
    await k.request(op, resolved);
    await k.resolveReport(op, resolved);
    const result = await k.requestsFor(m, placeId);
    expect(result.items.map((r) => r.reportId)).toEqual([requested]);
    expect(result.count).toBe(1);
  });

  it("listConfirmationRequestsForPlace#3 店舗 P と店舗 Q に、確認依頼中の連絡が1件ずつある。操作する人は P だけの店舗管理者 / P の依頼の一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter, op } = await setup(k);
    const Q = await k.place("二号店");
    await k.manager(Q);
    const ofP = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    const ofQ = await k.report(reporter, {
      target: { kind: "place", placeId: Q },
    });
    await k.request(op, ofP);
    await k.request(op, ofQ);
    expect(
      (await k.requestsFor(m, placeId)).items.map((r) => r.reportId),
    ).toEqual([ofP]);
  });

  it("listConfirmationRequestsForPlace#4 店舗 P の掲載を対象にした確認依頼中の連絡があり、その掲載は削除されている / P の店舗管理者が一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter, op } = await setup(k);
    const listing = await k.published(m, placeId);
    const reportId = await k.report(reporter, {
      target: { kind: "listing", listingId: listing.id },
    });
    await k.request(op, reportId);
    await k.remove(m, listing.id);
    expect((await k.requestsFor(m, placeId)).items).toEqual([
      expect.objectContaining({
        reportId,
        target: expect.objectContaining({ listingName: null, exists: false }),
      }),
    ]);
  });

  it("listConfirmationRequestsForPlace#5 店舗 P に店舗管理者が2人いて、確認依頼中の連絡がある / 2人がそれぞれ一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter, op } = await setup(k);
    const m2 = await k.manager(placeId);
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    await k.request(op, reportId);
    const first = await k.requestsFor(m, placeId);
    expect(first.count).toBe(1);
    expect(await k.requestsFor(m2, placeId)).toEqual(first);
  });

  it("listConfirmationRequestsForPlace#6 店舗 P に確認依頼中の連絡がない / P の店舗管理者が一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, m } = await setup(k);
    expect(await k.requestsFor(m, placeId)).toEqual({ items: [], count: 0 });
  });

  it("listConfirmationRequestsForPlace#7 店舗 P の一時非公開の掲載を対象にした確認依頼中の連絡がある / P の店舗管理者が一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter, op } = await setup(k);
    const listing = await k.published(m, placeId, { name: "限定メニュー" });
    const reportId = await k.report(reporter, {
      target: { kind: "listing", listingId: listing.id },
    });
    await k.request(op, reportId);
    await k.unpublish(m, listing.id);
    expect((await k.requestsFor(m, placeId)).items).toEqual([
      expect.objectContaining({
        reportId,
        target: expect.objectContaining({
          listingName: "限定メニュー",
          exists: true,
        }),
      }),
    ]);
  });

  it("listConfirmationRequestsForPlace#8 店舗 P に確認依頼中の連絡がある。P のすべての店舗管理者が辞任し、店舗管理者がいない / サービス運営者が P の依頼の一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter, op } = await setup(k);
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    await k.request(op, reportId);
    await k.resign(placeId, m);
    await expectCode(k.requestsFor(op, placeId), ForbiddenError);
  });

  it("listConfirmationRequestsForPlace#9 店舗 P に確認依頼中の連絡がある。操作する人は P の管理権限を持たない利用者 / P の依頼の一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, reporter, op } = await setup(k);
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    await k.request(op, reportId);
    await expectCode(k.requestsFor(reporter, placeId), ForbiddenError);
  });

  it("listConfirmationRequestsForPlace#10 店舗 P に確認依頼中の連絡がある。操作する人は、依頼を受けた後に P の店舗管理者を辞任した / P の依頼の一覧を読む", async () => {
    const k = await moderationKit();
    const { placeId, m, reporter, op } = await setup(k);
    await k.manager(placeId);
    const reportId = await k.report(reporter, {
      target: { kind: "place", placeId },
    });
    await k.request(op, reportId);
    await k.resign(placeId, m);
    await expectCode(k.requestsFor(m, placeId), ForbiddenError);
  });
});
