import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { listingKit } from "./kit";

describe("unsuspendListing", () => {
  it("unsuspendListing#1 公開中だった掲載が、運営による非公開になっている。操作する人はサービス運営者 / 解除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await k.suspend(op, listing.id);
    const view = await k.unsuspend(op, listing.id);
    expect(view.suspended).toBe(false);
    expect(view.publication.status).toBe("published");
    expect(
      (await k.events("listing.unsuspended")).map((e) => e.payload),
    ).toEqual([{ listingId: listing.id, placeId: a }]);
  });

  it("unsuspendListing#2 一時非公開だった掲載が、運営による非公開になっている / 解除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await k.unpublish(m, listing.id);
    await k.suspend(op, listing.id);
    const view = await k.unsuspend(op, listing.id);
    expect(view.publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
  });

  it("unsuspendListing#3 下書きだった掲載が、運営による非公開になっている / 解除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const draft = await k.draft(m, a);
    await k.suspend(op, draft.id);
    const view = await k.unsuspend(op, draft.id);
    expect(view.publication).toEqual({ status: "draft" });
  });

  it("unsuspendListing#4 公開中だった掲載が、運営による非公開の間に、申立てで最後の写真が削除された / 解除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const photo = await k.photo(m);
    const listing = await k.published(m, a, { photos: [photo] });
    await k.suspend(op, listing.id);
    await k.takeDown(listing.id, [photo]);
    const view = await k.unsuspend(op, listing.id);
    expect(view.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    await expectCode(
      k.publish(m, listing.id),
      BusinessRuleError,
      "LISTING_PUBLISH_CONDITION_UNMET",
    );
  });

  it("unsuspendListing#5 運営による非公開の間に、店舗管理者が掲載の内容を保存した / 解除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await k.suspend(op, listing.id);
    await k.saveName(m, listing.id, "非公開の間に保存");
    const view = await k.unsuspend(op, listing.id);
    expect(view.name).toBe("非公開の間に保存");
    expect(view.publication.status).toBe("published");
  });

  it("unsuspendListing#6 別のサービス運営者が、先に解除している / 解除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [op1, op2] = [await k.operator(), await k.operator()];
    const listing = await k.published(m, a);
    await k.suspend(op1, listing.id);
    await k.unsuspend(op2, listing.id);
    const mark = await k.mark();
    await expectCode(
      k.unsuspend(op1, listing.id),
      BusinessRuleError,
      "LISTING_NOT_SUSPENDED",
    );
    expect(await k.since(mark)).toEqual([]);
  });

  it("unsuspendListing#7 操作する人は店舗 A の店舗管理者で、サービス運営者の役割を持たない / 店舗 A の掲載の運営による非公開を解除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await k.suspend(op, listing.id);
    await expectCode(k.unsuspend(m, listing.id), ForbiddenError);
    expect((await k.stored(listing.id)).entity.suspension).toEqual({
      suspended: true,
    });
  });

  it("unsuspendListing#8 運営による非公開の間に、店舗管理者が掲載を削除した / 解除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await k.suspend(op, listing.id);
    await k.remove(m, listing.id);
    await expectCode(k.unsuspend(op, listing.id), NotFoundError);
  });

  it("unsuspendListing#9 掲載が運営による非公開になっている。サービス運営者が解除する操作と、店舗管理者の同じ掲載の内容の保存が同時に確定する / 解除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await k.suspend(op, listing.id);
    const racing = commitAfter(k.container, () =>
      k.saveName(m, listing.id, "先に保存"),
    );
    await expectCode(k.unsuspend(op, listing.id, racing), ConflictError);
    const stored = (await k.stored(listing.id)).entity;
    expect(stored.suspension).toEqual({ suspended: true });
    expect(stored.content.name).toBe("先に保存");
    expect(await k.events("listing.unsuspended")).toEqual([]);
  });
});
