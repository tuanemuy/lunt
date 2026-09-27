import { BusinessRuleError } from "@repo/core/domain/error";
import { Listing } from "@repo/core/domain/listing/listing";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { listingKit } from "./kit";

describe("unpublishListing", () => {
  it("unpublishListing#1 店舗 A の公開中の掲載がある。操作する人は店舗 A の店舗管理者 / 一時非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const before = (await k.stored(listing.id)).entity;
    const view = await k.unpublish(m, listing.id);
    const after = (await k.stored(listing.id)).entity;
    expect(after.publication).toEqual({
      status: "unpublished",
      firstPublishedAt:
        listing.publication.status === "published"
          ? listing.publication.firstPublishedAt
          : null,
      reason: "byManager",
    });
    expect(after.content).toEqual(before.content);
    expect(Listing.manualEndOf(after)).toEqual(Listing.manualEndOf(before));
    expect(view.publication.status).toBe("unpublished");
    expect(
      (await k.events("listing.unpublished")).map((e) => e.payload),
    ).toEqual([{ listingId: listing.id, reason: "byManager" }]);
  });

  it("unpublishListing#2 店舗 B の掲載は、管理者のいなかった時期の申請の承認で公開された。その後、操作する人が店舗 B の店舗管理者に就いた / その掲載を一時非公開にする", async () => {
    const k = await listingKit();
    const b = await k.place();
    const applicant = await k.person();
    const id = await k.approved(b, applicant);
    const m = await k.manager(b);
    const view = await k.unpublish(m, id);
    expect(view.publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
  });

  it("unpublishListing#3 店舗 B に店舗管理者がいない。操作する人はサービス運営者 / 店舗 B の公開中の掲載を一時非公開にする", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const listing = await k.published(op, b);
    const view = await k.unpublish(op, listing.id);
    expect(view.publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
  });

  it("unpublishListing#4 店舗 A の公開中の掲載が、運営による非公開になっている。操作する人は店舗 A の店舗管理者 / 一時非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await k.suspend(op, listing.id);
    const before = await k.stored(listing.id);
    const mark = await k.mark();
    await expectCode(
      k.unpublish(m, listing.id),
      BusinessRuleError,
      "LISTING_SUSPENDED",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
    expect(await k.since(mark)).toEqual([]);
  });

  it("unpublishListing#5 店舗 A の下書きの掲載がある / 一時非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    await expectCode(
      k.unpublish(m, draft.id),
      BusinessRuleError,
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
    expect((await k.stored(draft.id)).entity.publication.status).toBe("draft");
  });

  it("unpublishListing#6 別の店舗管理者が、先に同じ掲載を一時非公開にしている / 一時非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const listing = await k.published(m, a);
    await k.unpublish(other, listing.id);
    const before = await k.stored(listing.id);
    const mark = await k.mark();
    await expectCode(
      k.unpublish(m, listing.id),
      BusinessRuleError,
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
    expect(await k.since(mark)).toEqual([]);
  });

  it("unpublishListing#7 店舗 A に店舗管理者がいる。操作する人は店舗 A の管理権限を持たないサービス運営者 / 店舗 A の公開中の掲載を一時非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await expectCode(k.unpublish(op, listing.id), ForbiddenError);
    expect((await k.stored(listing.id)).entity.publication.status).toBe(
      "published",
    );
  });

  it("unpublishListing#8 操作する人は店舗 A の管理権限を持たない利用者 / 店舗 A の公開中の掲載を一時非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await expectCode(k.unpublish(await k.person(), listing.id), ForbiddenError);
    expect((await k.stored(listing.id)).entity.publication.status).toBe(
      "published",
    );
  });

  it("unpublishListing#9 別の店舗管理者が掲載を削除している / 一時非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.remove(await k.manager(a), listing.id);
    await expectCode(k.unpublish(m, listing.id), NotFoundError);
  });

  it("unpublishListing#10 店舗 A の公開中の掲載がある。店舗管理者が一時非公開にする操作と、別の店舗管理者の同じ掲載の内容の保存が同時に確定する / 一時非公開にする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const listing = await k.published(m, a);
    const racing = commitAfter(k.container, () =>
      k.saveName(other, listing.id, "先に保存"),
    );
    await expectCode(k.unpublish(m, listing.id, racing), ConflictError);
    const stored = (await k.stored(listing.id)).entity;
    expect(stored.publication.status).toBe("published");
    expect(stored.content.name).toBe("先に保存");
    expect(await k.events("listing.unpublished")).toEqual([]);
  });
});
