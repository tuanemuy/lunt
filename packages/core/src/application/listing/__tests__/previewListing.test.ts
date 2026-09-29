import type { ListingId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { affiliateWithRegions } from "../../discovery/__tests__/regionTies";
import { ForbiddenError, NotFoundError } from "../../errors";
import { previewListing } from "../previewListing";
import { type ListingKit, listingKit, period } from "./kit";

const previewer = (k: ListingKit) => (who: Person, listingId: ListingId) =>
  previewListing({
    container: k.container,
    actor: who.actor,
    input: { listingId },
  });

describe("previewListing", () => {
  it("previewListing#1 店舗 A の下書きに、写真2枚（1枚目に見せる範囲）、名称、カテゴリー、説明、提供期間がある。店舗 A は公開中の地域 R に所属している。操作する人は店舗 A の店舗管理者 / 見え方を確認する", async () => {
    const k = await listingKit();
    const a = await k.place("山田商店");
    const [R] = await affiliateWithRegions(k, a, [{ name: "谷中" }]);
    if (R === undefined) throw new Error("a region");
    const m = await k.manager(a);
    const [p1, p2] = await k.photos(m, 2);
    if (p1 === undefined || p2 === undefined) throw new Error("photos");
    const framing = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    const draft = await k.draft(m, a, {
      name: "りんご飴",
      description: "甘い",
      photos: [{ photoId: p1, framing }, p2],
      offering: period("2026-07-20", "2026-08-31"),
    });
    const before = await k.stored(draft.id);
    const view = await previewer(k)(m, draft.id);
    expect(view.preview.summary).toMatchObject({
      placeId: a,
      cover: { photoId: p1, framing },
      listingName: "りんご飴",
      placeName: "山田商店",
      region: "谷中",
    });
    expect(view.preview.detail).toMatchObject({
      name: "りんご飴",
      description: "甘い",
      photos: [
        { photoId: p1, framing },
        { photoId: p2, framing: null },
      ],
      offering: {
        kind: "period",
        period: { start: "2026-07-20", end: "2026-08-31" },
      },
      regions: [expect.objectContaining({ regionId: R.id, name: "谷中" })],
    });
    expect(view.category).toMatchObject({ name: "食べる" });
    expect(view.photoRefs.size).toBe(2);
    for (const shape of [view.preview.summary, view.preview.detail]) {
      expect(shape).not.toHaveProperty("price");
      expect(shape).not.toHaveProperty("tagline");
    }
    const after = await k.stored(draft.id);
    expect(after.entity).toEqual(before.entity);
    expect(after.entity.publication.status).toBe("draft");
  });

  it("previewListing#2 店舗 A の一時非公開の掲載がある / 見え方を確認する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, { name: "非公開の掲載" });
    await k.unpublish(m, listing.id);
    const view = await previewer(k)(m, listing.id);
    expect(view.preview.detail.name).toBe("非公開の掲載");
    expect(view.publication.status).toBe("unpublished");
  });

  it("previewListing#3 店舗 A の代表地域は公開を取り下げていて、店舗 A はほかに公開中の地域 S に所属している / 見え方を確認する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const [, S] = await affiliateWithRegions(
      k,
      a,
      [{ name: "谷中", state: "unpublished" }, { name: "根津" }],
      0,
    );
    if (S === undefined) throw new Error("two regions");
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    const view = await previewer(k)(m, draft.id);
    expect(view.preview.summary.region).toBe("根津");
    expect(view.preview.detail.regions.map((r) => r.regionId)).toEqual([S.id]);
  });

  it("previewListing#4 店舗 A はどの地域にも所属していない / 見え方を確認する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    const view = await previewer(k)(m, draft.id);
    expect(view.preview.summary.region).toBeNull();
    expect(view.preview.detail.regions).toEqual([]);
  });

  it("previewListing#5 店舗 A の下書きに写真がない / 見え方を確認する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a, { name: null, photos: [] });
    const view = await previewer(k)(m, draft.id);
    expect(view.preview.summary.cover).toBeNull();
    expect(view.preview.summary.listingName).toBeNull();
    expect(view.preview.detail.photos).toEqual([]);
  });

  it("previewListing#6 店舗 A の下書きが、運営による非公開になっている / 見え方を確認する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    await k.suspend(await k.operator(), draft.id);
    const view = await previewer(k)(m, draft.id);
    expect(view.preview.detail.name).toBe("掲載");
    expect(view.suspended).toBe(true);
  });

  it("previewListing#7 店舗 A が非公開になっている / 店舗 A の下書きの見え方を確認する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    await k.suspendPlace(a);
    const view = await previewer(k)(m, draft.id);
    expect(view.preview.detail.name).toBe("掲載");
    expect(view.placeSuspended).toBe(true);
  });

  it("previewListing#8 別の店舗管理者が、先に同じ下書きを公開している / 見え方を確認する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    await k.publish(await k.manager(a), draft.id);
    const view = await previewer(k)(m, draft.id);
    expect(view.publication.status).toBe("published");
    expect(view.preview.detail.name).toBe("掲載");
  });

  it("previewListing#9 店舗 B に店舗管理者がいない。操作する人はサービス運営者 / 店舗 B の下書きの見え方を確認する", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const draft = await k.draft(op, b, { name: "代行の下書き" });
    const view = await previewer(k)(op, draft.id);
    expect(view.preview.detail.name).toBe("代行の下書き");
  });

  it("previewListing#10 操作する人は店舗 A の管理権限を持たない利用者 / 店舗 A の下書きの見え方を確認する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    await expectCode(previewer(k)(await k.person(), draft.id), ForbiddenError);
  });

  it("previewListing#11 掲載が削除されている / 見え方を確認する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    await k.remove(m, draft.id);
    await expectCode(previewer(k)(m, draft.id), NotFoundError);
  });
});
