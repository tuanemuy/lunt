import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { PlaceId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { period } from "../../listing/__tests__/kit";
import { approveNewListing } from "../approveNewListing";
import { expectLapsed } from "./kit";
import { reviewKit } from "./reviewKit";

const placeRef = (id: PlaceId) => ({ kind: "place", id }) as const;

async function setUp() {
  const k = await reviewKit();
  const A = await k.person("A");
  const p1 = await k.place("山田珈琲店");
  return { k, A, p1 };
}

describe("approveNewListing", () => {
  it("approveNewListing#1 店舗 p1 に店舗管理者がいない。利用者 A の掲載の申請 a1 が確認中。予約した reservedListingId は l1。内容の写真は ph1、ph2（持ち主は a1）。操作する人はサービス運営者 O / O が、確かめたときの版を添えて a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const [ph1, ph2] = await k.photos(A, 2);
    if (ph1 === undefined || ph2 === undefined) throw new Error("photos");
    const a1 = await k.newListing(A, p1, {
      name: "季節のパフェ",
      description: "桃のパフェ",
      offering: period("2026-08-01", "2026-08-31"),
      photos: [ph1, ph2],
    });
    const l1 = a1.reservedListingId;
    const mark = await k.mark();

    const result = await k.approveAs(approveNewListing, k.O, a1.id);

    expect(result.outcome).toBe("approved");
    expect(result.outcome === "approved" && result.reflected).toEqual({
      kind: "listing",
      id: l1,
    });
    const listing = await k.listingOf(l1);
    expect(listing.placeId).toBe(p1);
    expect(listing.publication).toEqual({
      status: "published",
      firstPublishedAt: k.clock.now(),
    });
    expect(listing.content.name).toBe("季節のパフェ");
    expect(listing.content.description).toBe("桃のパフェ");
    expect(listing.content.categoryId).toBe(k.defaultCategory);
    expect(listing.content.offering).toEqual({
      kind: "period",
      period: { start: "2026-08-01", end: "2026-08-31" },
    });
    expect(listing.suspension.suspended).toBe(false);
    expect(PhotoSet.photoIds(listing.content.photos)).toEqual([ph1, ph2]);
    expect(await k.photoOwner(ph1)).toEqual({ kind: "listing", id: l1 });
    expect(await k.photoOwner(ph2)).toEqual({ kind: "listing", id: l1 });
    expect((await k.eventsSince(mark)).map((e) => e.type)).toEqual([
      "application.approved",
    ]);
  });

  it("approveNewListing#2 承認された a1 の掲載 l1 / A が l1 を管理しようとする（AccessPolicy.decide の manage_target）", async () => {
    const { k, A, p1 } = await setUp();
    const a1 = await k.newListing(A, p1);
    await k.approveAs(approveNewListing, k.O, a1.id);
    const stewardship = await k.stewardship(placeRef(p1));

    expect(
      await k.decide(A, {
        kind: "manage_target",
        standing: Stewardship.standingOf(stewardship, A.accountId),
      }),
    ).toEqual({ allowed: false });
    expect(
      await k.decide(k.O, {
        kind: "manage_target",
        standing: Stewardship.standingOf(stewardship, k.O.accountId),
      }),
    ).toEqual({ allowed: true, basis: "absence_proxy" });
  });

  it("approveNewListing#3 a1 の内容のカテゴリー c1 は、確認中の間に廃止され、移行先は c2 / O が a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const c1 = await k.addCategory("甘味");
    const a1 = await k.newListing(A, p1, { categoryId: c1 });
    const c2 = await k.addCategory("菓子");
    await k.retireCategory(c1, c2);

    await k.approveAs(approveNewListing, k.O, a1.id);

    expect((await k.listingOf(a1.reservedListingId)).content.categoryId).toBe(
      c2,
    );
  });

  it("approveNewListing#4 サービス運営者 O 自身の掲載の申請 a2 が確認中 / O が a2 を承認する", async () => {
    const { k, p1 } = await setUp();
    const a2 = await k.newListing(k.O, p1);

    const result = await k.approveAs(approveNewListing, k.O, a2.id);

    expect(result.outcome).toBe("approved");
  });

  it("approveNewListing#5 a1 の確認中に、p1 がサービス運営者によって非公開になった / O が a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const a1 = await k.newListing(A, p1);
    await k.suspendPlace(p1);

    const result = await k.approveAs(approveNewListing, k.O, a1.id);

    expect(result.outcome).toBe("approved");
    const l1 = a1.reservedListingId;
    expect((await k.listingOf(l1)).publication.status).toBe("published");
    expect(
      await k.container.referenceQueries.isViewable({
        kind: "listing",
        id: l1,
      }),
    ).toBe(false);
  });

  it("approveNewListing#6 利用者 A と B の、p1 への掲載の申請がどちらも確認中 / O が A の申請を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const B = await k.person("B");
    const a = await k.newListing(A, p1);
    const b = await k.newListing(B, p1);

    await k.approveAs(approveNewListing, k.O, a.id);

    expect((await k.app(a.id)).status.kind).toBe("approved");
    expect((await k.app(b.id)).status.kind).toBe("underReview");
  });

  it("approveNewListing#7 a1 の確認中に、p1 に店舗管理者が就いた。前提の再評価はまだ届いていない / O が a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const S = await k.person("S");
    const [ph1, ph2] = await k.photos(A, 2);
    if (ph1 === undefined || ph2 === undefined) throw new Error("photos");
    const a1 = await k.newListing(A, p1, { photos: [ph1, ph2] });
    await k.appoint(placeRef(p1), S);
    const mark = await k.mark();

    await expectLapsed(k, () => k.approveAs(approveNewListing, k.O, a1.id), [
      "placeHasNoSteward",
    ]);

    expect(await k.findListing(a1.reservedListingId)).toBeNull();
    expect((await k.eventsSince(mark)).map((e) => e.type)).toEqual([
      "application.lapsed",
    ]);
    expect(await k.photoOwner(ph1)).toEqual(k.applicationOwner(a1.id));
    expect(await k.photoOwner(ph2)).toEqual(k.applicationOwner(a1.id));
  });

  it("approveNewListing#8 利用者 U はサービス運営者でない / U が a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const U = await k.person("U");
    const a1 = await k.newListing(A, p1);

    await expectCode(k.approveAs(approveNewListing, U, a1.id), ForbiddenError);
    expect(await k.findListing(a1.reservedListingId)).toBeNull();
  });

  it("approveNewListing#9 a1 は、判断の前に A が取り下げた / O が a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const a1 = await k.newListing(A, p1);
    await k.withdrawAs(A, a1.id);

    await expectCode(
      k.approveAs(approveNewListing, k.O, a1.id),
      BusinessRuleError,
      "APPLICATION_ALREADY_WITHDRAWN",
    );
  });

  it("approveNewListing#10 a1 は、O が確かめた後に、別のサービス運営者が差し戻し、A が内容を直して再提出して確認中に戻った / O が、古い版を添えて a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const O2 = await k.operator("O2");
    const ph = await k.photo(A);
    const a1 = await k.newListing(A, p1, { photos: [ph] });
    const read = await k.versionOf(a1.id);
    await k.sendBackAs(O2, a1.id);
    await k.resubmitAs(A, a1.id, {
      kind: "listing",
      content: k.content({ name: "直した掲載", photos: [ph] }),
    });

    await expectCode(
      k.approveAs(approveNewListing, k.O, a1.id, { version: read }),
      ConflictError,
    );
    expect((await k.app(a1.id)).status.kind).toBe("underReview");
    expect(await k.findListing(a1.reservedListingId)).toBeNull();
  });

  it("approveNewListing#11 ID が a9 の申請は、掲載の修正の申請 / O が、a9 を掲載の申請として承認する", async () => {
    const { k, A, p1 } = await setUp();
    const l1 = await k.listing(p1);
    const a9 = await k.reviseListing(A, l1);

    await expectCode(k.approveAs(approveNewListing, k.O, a9.id), NotFoundError);
  });
});
