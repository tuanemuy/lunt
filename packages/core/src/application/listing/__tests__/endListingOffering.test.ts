import { BusinessRuleError } from "@repo/core/domain/error";
import { Listing } from "@repo/core/domain/listing/listing";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { listingKit, period } from "./kit";

describe("endListingOffering", () => {
  it("endListingOffering#1 店舗 A の公開中の掲載がある。提供の設定は「設定しない」。操作する人は店舗 A の店舗管理者 / 提供終了にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const view = await k.end(m, listing.id);
    const stored = (await k.stored(listing.id)).entity;
    expect(Listing.manualEndOf(stored)).toEqual({ ended: true });
    expect(view.offeringStatus).toEqual({
      phase: "ended",
      cause: "manual",
      scheduleElapsed: false,
    });
    expect(stored.publication.status).toBe("published");
    expect(await k.events()).toEqual([]);
  });

  it("endListingOffering#2 店舗 A の公開中の掲載の提供期間が 2026-07-01〜2026-08-31 / 提供終了にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: period("2026-07-01", "2026-08-31"),
    });
    const view = await k.end(m, listing.id);
    expect(view.offeringStatus).toMatchObject({
      phase: "ended",
      cause: "manual",
    });
    expect(view.offering).toEqual({
      kind: "period",
      period: { start: "2026-07-01", end: "2026-08-31" },
    });
  });

  it("endListingOffering#3 店舗 A の公開中の掲載が、運営による非公開になっている / 提供終了にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await k.suspend(op, listing.id);
    const view = await k.end(m, listing.id);
    expect(view.suspended).toBe(true);
    expect(view.publication.status).toBe("published");
    expect(view.offeringStatus.phase).toBe("ended");
  });

  it("endListingOffering#4 店舗 B に店舗管理者がいない。操作する人はサービス運営者 / 店舗 B の公開中の掲載を提供終了にする", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const listing = await k.published(op, b);
    const view = await k.end(op, listing.id);
    expect(view.offeringStatus.phase).toBe("ended");
  });

  it("endListingOffering#5 店舗 A の公開中の掲載を、店舗管理者がすでに提供終了にしている / もう一度提供終了にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.end(m, listing.id);
    const before = await k.stored(listing.id);
    await expectCode(
      k.end(m, listing.id),
      BusinessRuleError,
      "LISTING_ALREADY_ENDED",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("endListingOffering#6 店舗 A の下書きの掲載と、一時非公開の掲載がある / それぞれを提供終了にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    const unpublished = await k.published(m, a);
    await k.unpublish(m, unpublished.id);
    for (const id of [draft.id, unpublished.id]) {
      const before = await k.stored(id);
      await expectCode(
        k.end(m, id),
        BusinessRuleError,
        "LISTING_NOT_PUBLISHED",
      );
      expect((await k.stored(id)).entity).toEqual(before.entity);
    }
  });

  it("endListingOffering#7 店舗 A に店舗管理者がいる。操作する人は店舗 A の管理権限を持たないサービス運営者 / 店舗 A の公開中の掲載を提供終了にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const before = await k.stored(listing.id);
    await expectCode(k.end(await k.operator(), listing.id), ForbiddenError);
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("endListingOffering#8 操作する人は店舗 A の管理権限を持たない利用者 / 店舗 A の公開中の掲載を提供終了にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const before = await k.stored(listing.id);
    await expectCode(k.end(await k.person(), listing.id), ForbiddenError);
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("endListingOffering#9 別の店舗管理者が掲載を削除している / 提供終了にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.remove(await k.manager(a), listing.id);
    await expectCode(k.end(m, listing.id), NotFoundError);
  });

  it("endListingOffering#10 店舗 A の公開中の掲載がある。店舗管理者が提供終了にする操作と、別の店舗管理者の同じ掲載の内容の保存が同時に確定する / 提供終了にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const listing = await k.published(m, a);
    const racing = commitAfter(k.container, () =>
      k.saveName(other, listing.id, "先に保存"),
    );
    await expectCode(k.end(m, listing.id, racing), ConflictError);
    const stored = (await k.stored(listing.id)).entity;
    expect(Listing.manualEndOf(stored)).toEqual({ ended: false });
    expect(stored.content.name).toBe("先に保存");
  });
});
