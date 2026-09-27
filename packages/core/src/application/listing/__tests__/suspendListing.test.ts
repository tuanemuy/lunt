import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { duplicateListing } from "../duplicateListing";
import { listingKit } from "./kit";

describe("suspendListing", () => {
  it("suspendListing#1 店舗 A に店舗管理者がいる。店舗 A の公開中の掲載がある。操作する人はサービス運営者 / 運営による非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    const view = await k.suspend(op, listing.id);
    const stored = (await k.stored(listing.id)).entity;
    expect(stored.suspension).toEqual({ suspended: true });
    expect(stored.publication.status).toBe("published");
    expect(view.suspended).toBe(true);
    expect(view.access).toEqual({ hasSteward: true, manageable: false });
    expect((await k.events("listing.suspended")).map((e) => e.payload)).toEqual(
      [{ listingId: listing.id, placeId: a }],
    );
  });

  it("suspendListing#2 店舗 A の下書き、一時非公開の掲載がある / それぞれを運営による非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const draft = await k.draft(m, a);
    const unpublished = await k.published(m, a);
    await k.unpublish(m, unpublished.id);
    await k.suspend(op, draft.id);
    await k.suspend(op, unpublished.id);
    expect((await k.stored(draft.id)).entity.publication.status).toBe("draft");
    expect((await k.stored(unpublished.id)).entity.publication.status).toBe(
      "unpublished",
    );
    for (const id of [draft.id, unpublished.id]) {
      expect((await k.stored(id)).entity.suspension).toEqual({
        suspended: true,
      });
    }
  });

  it("suspendListing#3 店舗 B に店舗管理者がいない / 店舗 B の公開中の掲載を運営による非公開にする", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const listing = await k.published(op, b);
    const view = await k.suspend(op, listing.id);
    expect(view.suspended).toBe(true);
    expect(view.access.hasSteward).toBe(false);
  });

  it("suspendListing#4 掲載を運営による非公開にした / 店舗 A の店舗管理者が、内容を保存し（updateListing）、複製し（duplicateListing）、削除する（deleteListing）", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await k.suspend(op, listing.id);
    await expectCode(
      k.publish(m, listing.id),
      BusinessRuleError,
      "LISTING_SUSPENDED",
    );
    await expectCode(
      k.unpublish(m, listing.id),
      BusinessRuleError,
      "LISTING_SUSPENDED",
    );
    const saved = await k.saveName(m, listing.id, "保存できる");
    expect(saved.name).toBe("保存できる");
    const copy = await duplicateListing({
      container: k.container,
      actor: m.actor,
      input: { sourceId: listing.id, listingId: k.newId() },
    });
    expect(copy.suspended).toBe(false);
    expect((await k.stored(listing.id)).entity.suspension).toEqual({
      suspended: true,
    });
    await k.remove(m, listing.id);
    expect(await k.findListing(listing.id)).toBeNull();
  });

  it("suspendListing#5 別のサービス運営者が、先に同じ掲載を運営による非公開にしている / 運営による非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [op1, op2] = [await k.operator(), await k.operator()];
    const listing = await k.published(m, a);
    await k.suspend(op2, listing.id);
    const before = await k.stored(listing.id);
    const mark = await k.mark();
    await expectCode(
      k.suspend(op1, listing.id),
      BusinessRuleError,
      "LISTING_ALREADY_SUSPENDED",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
    expect(await k.since(mark)).toEqual([]);
  });

  it("suspendListing#6 操作する人は店舗 A の店舗管理者で、サービス運営者の役割を持たない / 店舗 A の掲載を運営による非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const before = await k.stored(listing.id);
    await expectCode(k.suspend(m, listing.id), ForbiddenError);
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("suspendListing#7 操作する人は、操作の途中でサービス運営者の役割を解除された / 運営による非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [op, other] = [await k.operator(), await k.operator()];
    void other;
    const listing = await k.published(m, a);
    const before = await k.stored(listing.id);
    const revoking = commitAfter(k.container, () =>
      k.revokeHolder("operator", op),
    );
    await expectCode(k.suspend(op, listing.id, revoking), ForbiddenError);
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("suspendListing#8 掲載が削除されている / 運営による非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.remove(m, listing.id);
    await expectCode(k.suspend(await k.operator(), listing.id), NotFoundError);
  });

  it("suspendListing#9 店舗 A の公開中の掲載がある。サービス運営者が運営による非公開にする操作と、店舗管理者の同じ掲載の内容の保存が同時に確定する / 運営による非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    const racing = commitAfter(k.container, () =>
      k.saveName(m, listing.id, "先に保存"),
    );
    await expectCode(k.suspend(op, listing.id, racing), ConflictError);
    const stored = (await k.stored(listing.id)).entity;
    expect(stored.suspension).toEqual({ suspended: false });
    expect(stored.content.name).toBe("先に保存");
    expect(await k.events("listing.suspended")).toEqual([]);
  });
});
