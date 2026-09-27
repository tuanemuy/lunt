import { BusinessRuleError } from "@repo/core/domain/error";
import { Listing } from "@repo/core/domain/listing/listing";
import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  rejection,
} from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { updateListing } from "../updateListing";
import { listingKit, period } from "./kit";

describe("publishListing", () => {
  it("publishListing#1 店舗 A の下書きに、写真1枚・名称・カテゴリーがある。説明と提供の設定はない。操作する人は店舗 A の店舗管理者 / 公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    k.tick();
    const view = await k.publish(m, draft.id);
    const stored = (await k.stored(draft.id)).entity;
    expect(stored.publication).toEqual({
      status: "published",
      firstPublishedAt: k.clock.now(),
    });
    expect(Listing.manualEndOf(stored)).toEqual({ ended: false });
    expect(view.offeringStatus).toEqual({ phase: "available" });
    expect(await k.events()).toEqual([]);
  });

  it("publishListing#2 店舗 A の下書きに写真・名称・カテゴリーがあり、提供期間の開始日が 2026-07-20 / 公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a, { offering: period("2026-07-20", null) });
    const view = await k.publish(m, draft.id);
    expect(view.publication.status).toBe("published");
    expect(view.offeringStatus).toEqual({
      phase: "upcoming",
      startsOn: "2026-07-20",
    });
  });

  it("publishListing#3 店舗 A の下書きに名称とカテゴリーがあり、写真がない / 公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a, { photos: [] });
    const error = await rejection(k.publish(m, draft.id));
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error).toMatchObject({
      code: "LISTING_PUBLISH_CONDITION_UNMET",
      missing: ["photos"],
    });
    expect((await k.stored(draft.id)).entity.publication.status).toBe("draft");
  });

  it("publishListing#4 店舗 A の下書きに写真だけがあり、名称とカテゴリーがない / 公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a, { name: null, categoryId: null });
    const error = await rejection(k.publish(m, draft.id));
    expect(error).toMatchObject({
      code: "LISTING_PUBLISH_CONDITION_UNMET",
      missing: ["name", "category"],
    });
    expect((await k.stored(draft.id)).entity.publication.status).toBe("draft");
  });

  it("publishListing#5 店舗 A の掲載が、店舗管理者の操作で一時非公開になっている。公開条件を満たす / 再公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const first = listing.publication;
    await k.unpublish(m, listing.id);
    k.tick();
    const view = await k.publish(m, listing.id);
    expect(view.publication).toEqual(first);
  });

  it("publishListing#6 店舗 A の掲載を店舗管理者が提供終了にし、その後一時非公開にした / 再公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.end(m, listing.id);
    await k.unpublish(m, listing.id);
    const view = await k.publish(m, listing.id);
    expect(view.publication.status).toBe("published");
    expect(Listing.manualEndOf((await k.stored(listing.id)).entity)).toEqual({
      ended: true,
    });
    expect(view.offeringStatus).toEqual({
      phase: "ended",
      cause: "manual",
      scheduleElapsed: false,
    });
  });

  it("publishListing#7 店舗 A の一時非公開の掲載が、一時非公開の間の編集で名称を欠いている / 再公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const photo = await k.photo(m);
    const listing = await k.published(m, a, { photos: [photo] });
    await k.unpublish(m, listing.id);
    await updateListing({
      container: k.container,
      actor: m.actor,
      input: {
        listingId: listing.id,
        version: (await k.stored(listing.id)).entity.version,
        content: k.content({ name: null, photos: [photo] }),
      },
    });
    const error = await rejection(k.publish(m, listing.id));
    expect(error).toMatchObject({
      code: "LISTING_PUBLISH_CONDITION_UNMET",
      missing: ["name"],
    });
    expect((await k.stored(listing.id)).entity.publication.status).toBe(
      "unpublished",
    );
  });

  it("publishListing#8 店舗 A の掲載が、申立てによる写真の削除で写真がなくなり、一時非公開（photoTakedown）になっている / 写真を登録せずに再公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const photo = await k.photo(m);
    const listing = await k.published(m, a, { photos: [photo] });
    await k.takeDown(listing.id, [photo]);
    const error = await rejection(k.publish(m, listing.id));
    expect(error).toMatchObject({
      code: "LISTING_PUBLISH_CONDITION_UNMET",
      missing: ["photos"],
    });
  });

  it("publishListing#9 上の掲載に、写真を1枚登録して保存した / 再公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const photo = await k.photo(m);
    const listing = await k.published(m, a, { photos: [photo] });
    await k.takeDown(listing.id, [photo]);
    const fresh = await k.photo(m);
    await updateListing({
      container: k.container,
      actor: m.actor,
      input: {
        listingId: listing.id,
        version: (await k.stored(listing.id)).entity.version,
        content: k.content({ photos: [fresh] }),
      },
    });
    const view = await k.publish(m, listing.id);
    expect(view.publication.status).toBe("published");
  });

  it("publishListing#10 店舗 A の一時非公開の掲載が、運営による非公開になっている。操作する人は店舗 A の店舗管理者 / 再公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await k.unpublish(m, listing.id);
    await k.suspend(op, listing.id);
    const before = await k.stored(listing.id);
    await expectCode(
      k.publish(m, listing.id),
      BusinessRuleError,
      "LISTING_SUSPENDED",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("publishListing#11 店舗 B の掲載が運営による非公開になった後で、操作する人が店舗 B の管理権限を得た / 再公開する", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const listing = await k.published(op, b);
    await k.unpublish(op, listing.id);
    await k.suspend(op, listing.id);
    const m = await k.manager(b);
    const before = await k.stored(listing.id);
    await expectCode(
      k.publish(m, listing.id),
      BusinessRuleError,
      "LISTING_SUSPENDED",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("publishListing#12 店舗 A の下書きが、写真を欠き、運営による非公開になっている / 公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const draft = await k.draft(m, a, { photos: [] });
    await k.suspend(op, draft.id);
    const before = await k.stored(draft.id);
    await expectCode(
      k.publish(m, draft.id),
      BusinessRuleError,
      "LISTING_SUSPENDED",
    );
    expect((await k.stored(draft.id)).entity).toEqual(before.entity);
  });

  it("publishListing#13 店舗 A の公開中の掲載が、運営による非公開になっている / 公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await k.suspend(op, listing.id);
    const before = await k.stored(listing.id);
    await expectCode(
      k.publish(m, listing.id),
      BusinessRuleError,
      "LISTING_SUSPENDED",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("publishListing#14 店舗 A が非公開になっている。店舗 A の下書きは公開条件を満たす / 公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    await k.suspendPlace(a);
    const view = await k.publish(m, draft.id);
    expect(view.publication.status).toBe("published");
    expect(view.place.suspended).toBe(true);
  });

  it("publishListing#15 店舗 B に店舗管理者がいない。操作する人はサービス運営者。店舗 B の下書きは公開条件を満たす / 公開する", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const draft = await k.draft(op, b);
    const view = await k.publish(op, draft.id);
    expect(view.publication.status).toBe("published");
  });

  it("publishListing#16 店舗 A に店舗管理者がいる。操作する人は店舗 A の管理権限を持たないサービス運営者 / 店舗 A の下書きを公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const draft = await k.draft(m, a);
    await expectCode(k.publish(op, draft.id), ForbiddenError);
    expect((await k.stored(draft.id)).entity.publication.status).toBe("draft");
  });

  it("publishListing#17 操作する人は店舗 A の管理権限を持たない利用者 / 店舗 A の下書きを公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    await expectCode(k.publish(await k.person(), draft.id), ForbiddenError);
    expect((await k.stored(draft.id)).entity.publication.status).toBe("draft");
  });

  it("publishListing#18 別の店舗管理者が掲載を削除している / 公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const draft = await k.draft(m, a);
    await k.remove(other, draft.id);
    await expectCode(k.publish(m, draft.id), NotFoundError);
  });

  it("publishListing#19 別の店舗管理者が、先に同じ下書きを公開している / 公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const draft = await k.draft(m, a);
    await k.publish(other, draft.id);
    const before = await k.stored(draft.id);
    k.tick();
    await expectCode(
      k.publish(m, draft.id),
      BusinessRuleError,
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
    expect((await k.stored(draft.id)).entity).toEqual(before.entity);
  });

  it("publishListing#20 店舗 A の下書きは公開条件を満たす。店舗管理者が公開する操作と、別の店舗管理者の同じ掲載の内容の保存が同時に確定する / 公開する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const draft = await k.draft(m, a);
    const racing = commitAfter(k.container, () =>
      k.saveName(other, draft.id, "先に保存"),
    );
    await expectCode(k.publish(m, draft.id, racing), ConflictError);
    const stored = (await k.stored(draft.id)).entity;
    expect(stored.publication.status).toBe("draft");
    expect(stored.content.name).toBe("先に保存");
  });
});
