import type { PlaceId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { period } from "../../listing/__tests__/kit";
import { approveListingRevision } from "../approveListingRevision";
import { expectLapsed } from "./kit";
import { reviewKit } from "./reviewKit";

const placeRef = (id: PlaceId) => ({ kind: "place", id }) as const;

async function setUp() {
  const k = await reviewKit();
  const A = await k.person("A");
  const setup = await k.setupOperator();
  const p1 = await k.place("山田珈琲店");
  const [ph1, ph2] = await k.photos(setup, 2);
  if (ph1 === undefined || ph2 === undefined) throw new Error("photos");
  const l1 = await k.listing(p1, {
    name: "ブレンド",
    description: "定番の味",
    photos: [ph1, ph2],
  });
  return { k, A, setup, p1, l1, ph1, ph2 };
}

describe("approveListingRevision", () => {
  it("approveListingRevision#1 店舗 p1 に店舗管理者がいない。p1 の公開中の掲載 l1 への、利用者 A の修正の申請 a1（名称と提供の設定の項目）が確認中。操作する人はサービス運営者 O / O が、確かめたときの版を添えて a1 を承認する", async () => {
    const { k, A, l1 } = await setUp();
    const before = await k.listingOf(l1);
    const offering = period("2026-08-01", "2026-08-31");
    const a1 = await k.reviseListing(A, l1, { name: "夏のブレンド", offering });
    const mark = await k.mark();

    const result = await k.approveAs(approveListingRevision, k.O, a1.id);

    expect(result.outcome).toBe("approved");
    expect(result.outcome === "approved" && result.reflected).toEqual({
      kind: "listing",
      id: l1,
    });
    const after = await k.listingOf(l1);
    expect(after.content.name).toBe("夏のブレンド");
    expect(after.content.offering).toEqual({
      kind: "period",
      period: { start: "2026-08-01", end: "2026-08-31" },
    });
    expect(after.content.description).toBe(before.content.description);
    expect(after.content.photos).toEqual(before.content.photos);
    expect(after.publication.status).toBe("published");
    expect((await k.eventsSince(mark)).map((e) => e.type)).toEqual([
      "application.approved",
    ]);
  });

  it("approveListingRevision#2 a1 の提出の後に、別の修正の申請の承認で l1 の説明が変わっている / O が a1 を承認する", async () => {
    const { k, A, l1 } = await setUp();
    const B = await k.person("B");
    const a1 = await k.reviseListing(A, l1, {
      name: "夏のブレンド",
      offering: period("2026-08-01", null),
    });
    const other = await k.reviseListing(B, l1, { description: "深煎り" });
    await k.approveAs(approveListingRevision, k.O, other.id);

    await k.approveAs(approveListingRevision, k.O, a1.id);

    const after = await k.listingOf(l1);
    expect(after.content.name).toBe("夏のブレンド");
    expect(after.content.description).toBe("深煎り");
  });

  it("approveListingRevision#3 l1 の写真は ph1、ph2。a2 の写真の項目は ph3、ph1（ph3 は a2 が持ち主） / O が a2 を承認する", async () => {
    const { k, A, l1, ph1, ph2 } = await setUp();
    const ph3 = await k.photo(A);
    const a2 = await k.reviseListing(A, l1, { photos: [ph3, ph1] });
    expect(await k.photoOwner(ph3)).toEqual(k.applicationOwner(a2.id));
    const mark = await k.mark();

    await k.approveAs(approveListingRevision, k.O, a2.id);

    const after = await k.listingOf(l1);
    expect(PhotoSet.photoIds(after.content.photos)).toEqual([ph3, ph1]);
    expect(await k.photoOwner(ph3)).toEqual({ kind: "listing", id: l1 });
    const released = await k.eventsSince(mark, "photos.released");
    expect(released.map((e) => e.payload)).toEqual([{ photoIds: [ph2] }]);
  });

  it("approveListingRevision#4 a2 の写真の項目は ph3、ph1。a2 の提出の後に、ph1 は申立てで l1 から削除された / O が a2 を承認する", async () => {
    const { k, A, l1, ph1 } = await setUp();
    const ph3 = await k.photo(A);
    const a2 = await k.reviseListing(A, l1, { photos: [ph3, ph1] });
    await k.takeDown(l1, [ph1]);

    await k.approveAs(approveListingRevision, k.O, a2.id);

    expect(PhotoSet.photoIds((await k.listingOf(l1)).content.photos)).toEqual([
      ph3,
    ]);
  });

  it("approveListingRevision#5 a3 のカテゴリーの項目 c1 は、確認中の間に廃止され、移行先は c2 / O が a3 を承認する", async () => {
    const { k, A, l1 } = await setUp();
    const c1 = await k.addCategory("甘味");
    const a3 = await k.reviseListing(A, l1, { categoryId: c1 });
    const c2 = await k.addCategory("菓子");
    await k.retireCategory(c1, c2);

    await k.approveAs(approveListingRevision, k.O, a3.id);

    expect((await k.listingOf(l1)).content.categoryId).toBe(c2);
  });

  it("approveListingRevision#6 a1 の確認中に、l1 が一時非公開になった。または運営による非公開になった / O が a1 を承認する", async () => {
    const { k, A, setup, p1, l1 } = await setUp();
    const l2 = await k.listing(p1, { name: "カフェラテ" });
    const a1 = await k.reviseListing(A, l1, { name: "夏のブレンド" });
    const b1 = await k.reviseListing(A, l2, { name: "夏のカフェラテ" });
    await k.unpublish(setup, l1);
    await k.suspend(setup, l2);

    await k.approveAs(approveListingRevision, k.O, a1.id);
    await k.approveAs(approveListingRevision, k.O, b1.id);

    const unpublished = await k.listingOf(l1);
    expect(unpublished.content.name).toBe("夏のブレンド");
    expect(unpublished.publication.status).toBe("unpublished");
    const suspended = await k.listingOf(l2);
    expect(suspended.content.name).toBe("夏のカフェラテ");
    expect(suspended.suspension.suspended).toBe(true);
    expect(suspended.publication.status).toBe("published");
  });

  it("approveListingRevision#7 a1 の確認中に、l1 が削除された。前提の再評価はまだ届いていない / O が a1 を承認する", async () => {
    const { k, A, setup, l1 } = await setUp();
    const a1 = await k.reviseListing(A, l1, { name: "夏のブレンド" });
    await k.remove(setup, l1);
    const mark = await k.mark();

    await expectLapsed(k.approveAs(approveListingRevision, k.O, a1.id), [
      "listingExists",
    ]);
    expect((await k.eventsSince(mark)).map((e) => e.type)).toEqual([
      "application.lapsed",
    ]);
  });

  it("approveListingRevision#8 a1 の確認中に、p1 に店舗管理者が就いた。前提の再評価はまだ届いていない / O が a1 を承認する", async () => {
    const { k, A, p1, l1 } = await setUp();
    const S = await k.person("S");
    const a1 = await k.reviseListing(A, l1, { name: "夏のブレンド" });
    await k.appoint(placeRef(p1), S);
    const before = await k.listingOf(l1);

    await expectLapsed(k.approveAs(approveListingRevision, k.O, a1.id), [
      "placeHasNoSteward",
    ]);
    expect(await k.listingOf(l1)).toEqual(before);
  });

  it("approveListingRevision#9 a4 の写真の項目は、l1 の写真だった ph1 だけ。a4 の提出の後に、ph1 は l1 から外された / O が a4 を承認する", async () => {
    const { k, A, l1, ph1 } = await setUp();
    const a4 = await k.reviseListing(A, l1, { photos: [ph1] });
    await k.takeDown(l1, [ph1]);
    const before = await k.listingOf(l1);

    await expectCode(
      k.approveAs(approveListingRevision, k.O, a4.id),
      BusinessRuleError,
      "LISTING_PATCH_PHOTOS_UNAVAILABLE",
    );
    expect((await k.app(a4.id)).status.kind).toBe("underReview");
    expect(await k.listingOf(l1)).toEqual(before);
  });

  it("approveListingRevision#10 利用者 U はサービス運営者でない / U が a1 を承認する", async () => {
    const { k, A, l1 } = await setUp();
    const U = await k.person("U");
    const a1 = await k.reviseListing(A, l1, { name: "夏のブレンド" });

    await expectCode(
      k.approveAs(approveListingRevision, U, a1.id),
      ForbiddenError,
    );
  });

  it("approveListingRevision#11 a1 は、別のサービス運営者が先に差し戻した / O が a1 を承認する", async () => {
    const { k, A, l1 } = await setUp();
    const O2 = await k.operator("O2");
    const a1 = await k.reviseListing(A, l1, { name: "夏のブレンド" });
    const read = await k.versionOf(a1.id);
    await k.sendBackAs(O2, a1.id);

    await expectCode(
      k.approveAs(approveListingRevision, k.O, a1.id, { version: read }),
      BusinessRuleError,
      "APPLICATION_RETURNED",
    );
  });

  it("approveListingRevision#12 a1 は、O が確かめた後に、別のサービス運営者が差し戻し、A が項目を直して再提出して確認中に戻った / O が、古い版を添えて a1 を承認する", async () => {
    const { k, A, l1 } = await setUp();
    const O2 = await k.operator("O2");
    const a1 = await k.reviseListing(A, l1, { name: "夏のブレンド" });
    const read = await k.versionOf(a1.id);
    await k.sendBackAs(O2, a1.id);
    await k.resubmitAs(A, a1.id, {
      kind: "listingRevision",
      content: await k.listingInput(l1, { name: "夏限定ブレンド" }),
    });
    const before = await k.listingOf(l1);

    await expectCode(
      k.approveAs(approveListingRevision, k.O, a1.id, { version: read }),
      ConflictError,
    );
    expect((await k.app(a1.id)).status.kind).toBe("underReview");
    expect(await k.listingOf(l1)).toEqual(before);
  });
});
