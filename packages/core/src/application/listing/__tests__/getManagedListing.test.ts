import type { ListingId, PhotoId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { affiliateWithRegions } from "../../discovery/__tests__/regionTies";
import { ForbiddenError, NotFoundError } from "../../errors";
import { getManagedListing } from "../getManagedListing";
import { updateListing } from "../updateListing";
import { type ListingKit, listingKit, period } from "./kit";

const reader = (k: ListingKit) => (who: Person, listingId: ListingId) =>
  getManagedListing({
    container: k.container,
    actor: who.actor,
    input: { listingId },
  });

async function threePhotos(k: ListingKit, m: Person) {
  const [p1, p2, p3] = await k.photos(m, 3);
  if (p1 === undefined || p2 === undefined || p3 === undefined) {
    throw new Error("photos");
  }
  return [p1, p2, p3] as const;
}

async function saveWith(
  k: ListingKit,
  m: Person,
  listingId: ListingId,
  name: string,
  photos: readonly (
    | PhotoId
    | {
        photoId: PhotoId;
        framing: { x: number; y: number; width: number; height: number } | null;
      }
  )[],
) {
  await updateListing({
    container: k.container,
    actor: m.actor,
    input: {
      listingId,
      version: (await k.stored(listingId)).entity.version,
      content: k.content({ name, photos }),
    },
  });
}

describe("getManagedListing", () => {
  it("getManagedListing#1 店舗 A の公開中の掲載がある。店舗 A は地域 R、地域 S の順に所属している。操作する人は店舗 A の店舗管理者 / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place("山田商店");
    const [R, S] = await affiliateWithRegions(k, a, [
      { name: "谷中" },
      { name: "根津" },
    ]);
    if (R === undefined || S === undefined) throw new Error("two regions");
    const m = await k.manager(a);
    const [p1, p2] = await k.photos(m, 2);
    if (p1 === undefined || p2 === undefined) throw new Error("photos");
    const framing = { x: 0, y: 0, width: 0.5, height: 0.5 };
    const listing = await k.published(m, a, {
      name: "りんご飴",
      description: "甘い",
      photos: [{ photoId: p1, framing }, p2],
      offering: period("2026-07-01", "2026-08-31"),
    });
    const view = await reader(k)(m, listing.id);
    expect(view).toMatchObject({
      id: listing.id,
      name: "りんご飴",
      description: "甘い",
      category: { name: "食べる" },
      offering: {
        kind: "period",
        period: { start: "2026-07-01", end: "2026-08-31" },
      },
      publication: { status: "published" },
      suspended: false,
      offeringStatus: { phase: "available" },
      place: {
        id: a,
        name: "山田商店",
        address: {
          prefecture: "東京都",
          municipality: "千代田区",
          town: "大手町",
        },
        suspended: false,
        regions: [
          { id: R.id, name: "谷中" },
          { id: S.id, name: "根津" },
        ],
      },
      access: { hasSteward: true, manageable: true },
    });
    expect(view.photos.map((p) => [p.photoId, p.framing])).toEqual([
      [p1, framing],
      [p2, null],
    ]);
    expect(view.photos.every((p) => p.display !== null)).toBe(true);
  });

  it("getManagedListing#2 店舗 A の下書き、一時非公開の掲載がある / それぞれを読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a);
    const unpublished = await k.published(m, a);
    await k.unpublish(m, unpublished.id);
    expect((await reader(k)(m, draft.id)).publication.status).toBe("draft");
    expect((await reader(k)(m, unpublished.id)).publication.status).toBe(
      "unpublished",
    );
  });

  it("getManagedListing#3 掲載に保存されたカテゴリーが廃止済み / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [experience, see] = [
      await k.category("体験"),
      await k.category("見る"),
    ];
    const listing = await k.published(m, a, { categoryId: experience });
    await k.retireCategory(experience, see);
    expect((await reader(k)(m, listing.id)).category).toEqual({
      id: see,
      name: "見る",
    });
  });

  it("getManagedListing#4 掲載のカテゴリーの名称が変更された / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const buy = await k.category("買う");
    const listing = await k.published(m, a, { categoryId: buy });
    await k.renameCategory(buy, "買いもの");
    expect((await reader(k)(m, listing.id)).category).toEqual({
      id: buy,
      name: "買いもの",
    });
  });

  it("getManagedListing#5 店舗 A の公開中の掲載が、運営による非公開になっている / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.suspend(await k.operator(), listing.id);
    const view = await reader(k)(m, listing.id);
    expect(view.suspended).toBe(true);
    expect(view.publication.status).toBe("published");
  });

  it("getManagedListing#6 店舗 A の掲載が、申立てによる写真の削除で一時非公開になっている / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const photo = await k.photo(m);
    const listing = await k.published(m, a, { photos: [photo] });
    await k.takeDown(listing.id, [photo]);
    const other = await k.published(m, a);
    await k.unpublish(m, other.id);
    expect((await reader(k)(m, listing.id)).publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    expect((await reader(k)(m, other.id)).publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
  });

  it("getManagedListing#7 店舗 A の公開中の掲載の写真 P1、P2、P3 のうち、P1 が申立てで削除された / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [p1, p2, p3] = await threePhotos(k, m);
    const listing = await k.published(m, a, { photos: [p1, p2, p3] });
    await k.takeDown(listing.id, [p1]);
    const view = await reader(k)(m, listing.id);
    expect(view.photosTakenDown).toBe(true);
    expect(view.photos.map((p) => p.photoId)).toEqual([p2, p3]);
    expect(view.publication.status).toBe("published");
  });

  it("getManagedListing#8 上の掲載で、店舗管理者が名称と P2 の見せる範囲だけを変えて保存した（写真の並びは変えない） / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [p1, p2, p3] = await threePhotos(k, m);
    const listing = await k.published(m, a, { photos: [p1, p2, p3] });
    await k.takeDown(listing.id, [p1]);
    await saveWith(k, m, listing.id, "新しい名称", [
      { photoId: p2, framing: { x: 0, y: 0, width: 1, height: 0.5 } },
      p3,
    ]);
    expect((await reader(k)(m, listing.id)).photosTakenDown).toBe(true);
  });

  it("getManagedListing#9 上の掲載で、店舗管理者が写真の並びを変えて保存した / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [p1, p2, p3] = await threePhotos(k, m);
    const listing = await k.published(m, a, { photos: [p1, p2, p3] });
    await k.takeDown(listing.id, [p1]);
    await saveWith(k, m, listing.id, "掲載", [p3, p2]);
    expect((await reader(k)(m, listing.id)).photosTakenDown).toBe(false);
  });

  it("getManagedListing#10 店舗 A の公開中の掲載が、終了日 2026-06-30 を過ぎている / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: period(null, "2026-06-30"),
    });
    expect((await reader(k)(m, listing.id)).offeringStatus).toEqual({
      phase: "ended",
      cause: "schedule",
    });
  });

  it("getManagedListing#11 店舗 A の公開中の掲載を店舗管理者が提供終了にしていて、終了日 2026-06-30 も過ぎている / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: period(null, "2026-06-30"),
    });
    await k.end(m, listing.id);
    expect((await reader(k)(m, listing.id)).offeringStatus).toEqual({
      phase: "ended",
      cause: "manual",
      scheduleElapsed: true,
    });
  });

  it("getManagedListing#12 店舗 A の公開中の掲載の開始日が 2026-07-20 / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: period("2026-07-20", null),
    });
    expect((await reader(k)(m, listing.id)).offeringStatus).toEqual({
      phase: "upcoming",
      startsOn: "2026-07-20",
    });
  });

  it("getManagedListing#13 店舗 A が非公開になっている / 店舗 A の掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.suspendPlace(a);
    const view = await reader(k)(m, listing.id);
    expect(view.id).toBe(listing.id);
    expect(view.place.suspended).toBe(true);
  });

  it("getManagedListing#14 店舗 B の掲載は、管理者のいなかった時期にサービス運営者が代理作成した。その後、操作する人が店舗 B の店舗管理者に就いた / 店舗管理者がその掲載を読む", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const proxied = await k.published(op, b);
    const m = await k.manager(b);
    const own = await k.published(m, b);
    const [a1, a2] = [
      await reader(k)(m, proxied.id),
      await reader(k)(m, own.id),
    ];
    expect(Object.keys(a1).sort()).toEqual(Object.keys(a2).sort());
    expect(a1.access).toEqual({ hasSteward: true, manageable: true });
  });

  it("getManagedListing#15 店舗 B に店舗管理者がいない。店舗 B は地域 R に所属している。操作する人はサービス運営者 / 店舗 B の掲載を読む", async () => {
    const k = await listingKit();
    const b = await k.place("無人の店舗");
    const [R] = await affiliateWithRegions(k, b, [{ name: "谷中" }]);
    if (R === undefined) throw new Error("a region");
    const op = await k.operator();
    const listing = await k.published(op, b);
    const view = await reader(k)(op, listing.id);
    expect(view.place).toMatchObject({
      name: "無人の店舗",
      regions: [{ id: R.id, name: "谷中" }],
    });
    expect(view.place.address.town).toBe("大手町");
    expect(view.access).toEqual({ hasSteward: false, manageable: true });
  });

  it("getManagedListing#16 店舗 A はどの地域にも所属していない / 店舗 A の掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place("地域のない店舗");
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const view = await reader(k)(m, listing.id);
    expect(view.place.name).toBe("地域のない店舗");
    expect(view.place.address.prefecture).toBe("東京都");
    expect(view.place.regions).toEqual([]);
  });

  it("getManagedListing#17 店舗 A に店舗管理者がいる。操作する人は店舗 A の管理権限を持たないサービス運営者 / 店舗 A の掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const view = await reader(k)(await k.operator(), listing.id);
    expect(view.id).toBe(listing.id);
    expect(view.access).toEqual({ hasSteward: true, manageable: false });
  });

  it("getManagedListing#18 操作する人は、店舗 A の管理権限もサービス運営者の役割も持たない利用者 / 店舗 A の掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await expectCode(reader(k)(await k.person(), listing.id), ForbiddenError);
  });

  it("getManagedListing#19 掲載が削除されている / 掲載を読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.remove(m, listing.id);
    await expectCode(reader(k)(m, listing.id), NotFoundError);
  });
});
