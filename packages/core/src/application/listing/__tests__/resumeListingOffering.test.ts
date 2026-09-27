import { BusinessRuleError } from "@repo/core/domain/error";
import { Listing } from "@repo/core/domain/listing/listing";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { listingKit, period } from "./kit";

describe("resumeListingOffering", () => {
  it("resumeListingOffering#1 店舗 A の公開中の掲載を、店舗管理者が提供終了にしている。提供の設定は「設定しない」。操作する人は店舗 A の店舗管理者 / 提供中に戻す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.end(m, listing.id);
    const view = await k.resume(m, listing.id);
    expect(Listing.manualEndOf((await k.stored(listing.id)).entity)).toEqual({
      ended: false,
    });
    expect(view.offeringStatus).toEqual({ phase: "available" });
    expect(await k.events()).toEqual([]);
  });

  it("resumeListingOffering#2 店舗 A の公開中の掲載を、店舗管理者が提供終了にしている。提供期間の終了日は 2026-06-30 / 提供中に戻す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: period(null, "2026-06-30"),
    });
    await k.end(m, listing.id);
    const view = await k.resume(m, listing.id);
    expect(Listing.manualEndOf((await k.stored(listing.id)).entity)).toEqual({
      ended: false,
    });
    expect(view.offeringStatus).toEqual({ phase: "ended", cause: "schedule" });
  });

  it("resumeListingOffering#3 店舗 A の公開中の掲載が、終了日 2026-06-30 を過ぎて自動で提供終了になっている。店舗管理者は提供終了にしていない / 提供中に戻す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: period(null, "2026-06-30"),
    });
    const before = await k.stored(listing.id);
    await expectCode(
      k.resume(m, listing.id),
      BusinessRuleError,
      "LISTING_NOT_MANUALLY_ENDED",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("resumeListingOffering#4 店舗 A の公開中の掲載が提供中 / 提供中に戻す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const before = await k.stored(listing.id);
    await expectCode(
      k.resume(m, listing.id),
      BusinessRuleError,
      "LISTING_NOT_MANUALLY_ENDED",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("resumeListingOffering#5 店舗 A の掲載を店舗管理者が提供終了にし、その後一時非公開にした。提供の設定は「設定しない」 / 提供中に戻す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.end(m, listing.id);
    await k.unpublish(m, listing.id);
    const view = await k.resume(m, listing.id);
    expect(view.publication.status).toBe("unpublished");
    expect(view.offeringStatus).toEqual({ phase: "available" });
    expect(Listing.manualEndOf((await k.stored(listing.id)).entity)).toEqual({
      ended: false,
    });
  });

  it("resumeListingOffering#6 店舗 A の下書きの掲載 / 提供中に戻す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    const before = await k.stored(draft.id);
    await expectCode(
      k.resume(m, draft.id),
      BusinessRuleError,
      "LISTING_NOT_MANUALLY_ENDED",
    );
    expect((await k.stored(draft.id)).entity).toEqual(before.entity);
  });

  it("resumeListingOffering#7 店舗 B に店舗管理者がいない。店舗 B の公開中の掲載を、サービス運営者が提供終了にしている / サービス運営者が提供中に戻す", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const listing = await k.published(op, b);
    await k.end(op, listing.id);
    const view = await k.resume(op, listing.id);
    expect(view.offeringStatus).toEqual({ phase: "available" });
  });

  it("resumeListingOffering#8 店舗 A に店舗管理者がいる。操作する人は店舗 A の管理権限を持たないサービス運営者 / 店舗 A の掲載を提供中に戻す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.end(m, listing.id);
    const before = await k.stored(listing.id);
    await expectCode(k.resume(await k.operator(), listing.id), ForbiddenError);
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("resumeListingOffering#9 操作する人は店舗 A の管理権限を持たない利用者 / 店舗 A の掲載を提供中に戻す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.end(m, listing.id);
    const before = await k.stored(listing.id);
    await expectCode(k.resume(await k.person(), listing.id), ForbiddenError);
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("resumeListingOffering#10 別の店舗管理者が掲載を削除している / 提供中に戻す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.end(m, listing.id);
    await k.remove(await k.manager(a), listing.id);
    await expectCode(k.resume(m, listing.id), NotFoundError);
  });

  it("resumeListingOffering#11 店舗 A の公開中の掲載を、店舗管理者が提供終了にしている。店舗管理者が提供中に戻す操作と、別の店舗管理者の同じ掲載の内容の保存が同時に確定する / 提供中に戻す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const listing = await k.published(m, a);
    await k.end(m, listing.id);
    const racing = commitAfter(k.container, () =>
      k.saveName(other, listing.id, "先に保存"),
    );
    await expectCode(k.resume(m, listing.id, racing), ConflictError);
    const stored = (await k.stored(listing.id)).entity;
    expect(Listing.manualEndOf(stored)).toEqual({ ended: true });
    expect(stored.content.name).toBe("先に保存");
  });
});
