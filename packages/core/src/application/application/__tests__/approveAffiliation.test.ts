import type { ApplicationId, PlaceId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { expectLapsed } from "./kit";
import { type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

/**
 * Region X with its steward R, and place p1 with its steward S, whose
 * affiliation application b1 to X (filed as the place) is under review.
 */
async function setting(k: StewardSeatKit) {
  const X = await k.addRegion({ name: "X" });
  const R = await k.regionSteward(X, "R");
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  const b1 = await k.affiliateAsPlace(S, { placeId: p1, regionId: X });
  return { X, R, p1, S, b1 };
}

const regionOf = (id: string) => ({ kind: "region", id });

async function expectApproved(
  k: StewardSeatKit,
  id: ApplicationId,
  reviewAs: "approver" | "overdue_proxy",
) {
  expect((await k.app(id)).status).toEqual({ kind: "approved", reviewAs });
}

const expectNotAffiliated = async (k: StewardSeatKit, placeId: PlaceId) =>
  expect(await k.affiliatedRegions(placeId)).toEqual([]);

describe("approveAffiliation", () => {
  it("approveAffiliation#1 利用者 R は地域 X の運営者。店舗 p1（所属の記録がない）について店舗管理者として行った、X への所属の申請 b1 が確認中 / R が、確かめたときの版を添えて b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, R, p1, b1 } = await setting(k);
    expect(await k.affiliations(p1)).toBeNull();
    const mark = await k.mark();

    const result = await k.approveAffiliationAs(R, b1.id, {
      version: b1.version,
    });

    expect(result).toEqual({
      outcome: "approved",
      application: expect.objectContaining({
        id: b1.id,
        kind: "affiliation",
        status: { kind: "approved", reviewAs: "approver" },
      }),
      reflected: regionOf(X),
    });
    await expectApproved(k, b1.id, "approver");
    expect((await k.affiliations(p1))?.affiliations).toEqual([
      { regionId: X, affiliatedAt: k.clock.now() },
    ]);
    const events = await k.eventsSince(mark);
    expect(events.map((e) => e.type).sort()).toEqual([
      "application.approved",
      "region.affiliation_established",
    ]);
    expect(events.map((e) => e.payload)).toEqual(
      expect.arrayContaining([
        { applicationId: b1.id, applicant: { kind: "place", placeId: p1 } },
        { placeId: p1, regionId: X },
      ]),
    );
  });

  it("approveAffiliation#2 店舗 p1 は地域 Y に所属中で、選んだ代表地域は Y。p1 の X への所属の申請 b1 と、地域 W への所属の申請 b2 が確認中 / R が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, R, p1, S, b1 } = await setting(k);
    const [Y, W] = [await k.addRegion({ name: "Y" }), await k.addRegion()];
    await k.affiliate(p1, Y);
    await k.choose(p1, Y);
    const b2 = await k.affiliateAsPlace(S, { placeId: p1, regionId: W });

    await k.approveAffiliationAs(R, b1.id);

    const after = await k.affiliations(p1);
    expect(after?.affiliations.map((a) => a.regionId)).toEqual([Y, X]);
    expect(after?.chosenRepresentative).toBe(Y);
    expect(await k.app(b2.id)).toEqual(b2);
  });

  it("approveAffiliation#3 店舗 p1 は公開されていて営業中。p1 の掲載 l1 は公開中で提供中、l2 は一時非公開、l3 は下書き。b1 が確認中 / R が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, R, p1, S, b1 } = await setting(k);
    const l1 = (await k.published(S, p1)).id;
    const l2 = (await k.published(S, p1)).id;
    await k.unpublish(S, l2);
    const l3 = (await k.draft(S, p1)).id;
    const place = await k.getPlace(p1);
    const listings = await Promise.all([l1, l2, l3].map(k.findListing));

    await k.approveAffiliationAs(R, b1.id);

    expect(await k.affiliatedRegions(p1)).toEqual([X]);
    expect(await k.getPlace(p1)).toEqual(place);
    expect(await Promise.all([l1, l2, l3].map(k.findListing))).toEqual(
      listings,
    );
  });

  it("approveAffiliation#4 利用者 A が個人として行った、管理者のいない店舗 p2 の X への所属の申請 b3 が確認中 / R が b3 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, R } = await setting(k);
    const A = await k.person("A");
    const p2 = await k.place();
    const b3 = await k.affiliateAsIndividual(A, { placeId: p2, regionId: X });

    const result = await k.approveAffiliationAs(R, b3.id);

    expect(result.outcome).toBe("approved");
    expect(await k.affiliatedRegions(p2)).toEqual([X]);
  });

  it("approveAffiliation#5 R は地域 X の運営者で、店舗 p1 の店舗管理者でもある。R が店舗管理者として行った、p1 の X への所属の申請 b1 が確認中 / R が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const X = await k.addRegion();
    const R = await k.regionSteward(X, "R");
    const p1 = await k.place();
    await k.appoint(k.ref(p1), R);
    const b1 = await k.affiliateAsPlace(R, { placeId: p1, regionId: X });

    expect((await k.approveAffiliationAs(R, b1.id)).outcome).toBe("approved");
    await expectApproved(k, b1.id, "approver");
  });

  it("approveAffiliation#6 地域 Y に運営者がいない。Y への所属の申請 b4 が確認中。操作する人はサービス運営者 O / O が b4 を承認する", async () => {
    const k = await stewardSeatKit();
    const Y = await k.addRegion();
    const { p1, S } = await setting(k);
    const b4 = await k.affiliateAsPlace(S, { placeId: p1, regionId: Y });

    expect((await k.approveAffiliationAs(k.O, b4.id)).outcome).toBe("approved");
    await expectApproved(k, b4.id, "approver");
    expect(await k.affiliatedRegions(p1)).toEqual([Y]);
  });

  it("approveAffiliation#7 地域 X に運営者がいる。b1 は10日前から確認中。O は X の運営者でない / O が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, p1, b1 } = await setting(k);
    k.passDays(10);

    const result = await k.approveAffiliationAs(k.O, b1.id);

    expect(result.outcome).toBe("approved");
    await expectApproved(k, b1.id, "overdue_proxy");
    expect(await k.affiliatedRegions(p1)).toEqual([X]);
  });

  it("approveAffiliation#8 地域 Y に運営者がいない。Y への所属の申請 b9 は3日前から確認中。サービス運営者 O が不在の代行で b9 を確かめた後、承認の前に利用者 R が Y の運営者に就いた / O が b9 を承認する", async () => {
    const k = await stewardSeatKit();
    const Y = await k.addRegion();
    const { p1, S } = await setting(k);
    const b9 = await k.affiliateAsPlace(S, { placeId: p1, regionId: Y });
    k.passDays(3);
    const read = await k.versionOf(b9.id);
    await k.regionSteward(Y, "R-of-Y");

    await expectCode(
      k.approveAffiliationAs(k.O, b9.id, { version: read }),
      BusinessRuleError,
      "APPLICATION_AWAITING_STEWARDS",
    );
    expect((await k.app(b9.id)).status.kind).toBe("underReview");
    await expectNotAffiliated(k, p1);
  });

  it("approveAffiliation#9 地域 Y に運営者がいない。Y への所属の申請 b10 は10日前から確認中。サービス運営者 O が不在の代行で b10 を確かめた後、承認の前に利用者 R が Y の運営者に就いた / O が b10 を1回承認する", async () => {
    const k = await stewardSeatKit();
    const Y = await k.addRegion();
    const { p1, S } = await setting(k);
    const b10 = await k.affiliateAsPlace(S, { placeId: p1, regionId: Y });
    k.passDays(10);
    const read = await k.versionOf(b10.id);
    await k.regionSteward(Y, "R-of-Y");
    const mark = await k.mark();

    const result = await k.approveAffiliationAs(k.O, b10.id, {
      version: read,
    });

    expect(result.outcome).toBe("approved");
    await expectApproved(k, b10.id, "overdue_proxy");
    expect(await k.affiliatedRegions(p1)).toEqual([Y]);
    expect(
      (await k.eventsSince(mark, "application.approved")).map((e) => e.payload),
    ).toEqual([
      { applicationId: b10.id, applicant: { kind: "place", placeId: p1 } },
    ]);
  });

  it("approveAffiliation#10 地域 X に運営者がいる。b1 は3日前から確認中 / O が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { p1, b1 } = await setting(k);
    k.passDays(3);

    await expectCode(
      k.approveAffiliationAs(k.O, b1.id),
      BusinessRuleError,
      "APPLICATION_AWAITING_STEWARDS",
    );
    expect((await k.app(b1.id)).status.kind).toBe("underReview");
    await expectNotAffiliated(k, p1);
  });

  it("approveAffiliation#11 利用者 V は地域 W の運営者で、X の運営者でない / V が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { p1, b1 } = await setting(k);
    const W = await k.addRegion();
    const V = await k.regionSteward(W, "V");

    await expectCode(k.approveAffiliationAs(V, b1.id), ForbiddenError);
    await expectNotAffiliated(k, p1);
  });

  it("approveAffiliation#12 p2 の X への所属の申請が、A のもの（b3）と利用者 B のもの（b5）、どちらも確認中。R が b3 を承認した。b5 の前提の再評価はまだ届いていない / R が b5 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, R } = await setting(k);
    const [A, B] = [await k.person("A"), await k.person("B")];
    const p2 = await k.place();
    const b3 = await k.affiliateAsIndividual(A, { placeId: p2, regionId: X });
    const b5 = await k.affiliateAsIndividual(B, { placeId: p2, regionId: X });
    await k.approveAffiliationAs(R, b3.id);

    await expectLapsed(k, () => k.approveAffiliationAs(R, b5.id), [
      "notAffiliated",
    ]);
    expect(await k.affiliatedRegions(p2)).toEqual([X]);
  });

  it("approveAffiliation#13 b3 の確認中に、p2 に店舗管理者が就いた。前提の再評価はまだ届いていない / R が b3 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, R } = await setting(k);
    const A = await k.person("A");
    const p2 = await k.place();
    const b3 = await k.affiliateAsIndividual(A, { placeId: p2, regionId: X });
    await k.manager(p2, "new-steward");

    await expectLapsed(k, () => k.approveAffiliationAs(R, b3.id), [
      "placeHasNoSteward",
    ]);
    await expectNotAffiliated(k, p2);
  });

  it("approveAffiliation#14 b1 の確認中に、p1 の最後の店舗管理者が辞任した。前提の再評価はまだ届いていない / R が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { R, p1, S, b1 } = await setting(k);
    await k.removeSteward(k.ref(p1), S);

    await expectLapsed(k, () => k.approveAffiliationAs(R, b1.id), [
      "placeHasSteward",
    ]);
    await expectNotAffiliated(k, p1);
  });

  it("approveAffiliation#15 b1 の確認中に、X が運営による非公開になった / R が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, R, p1, b1 } = await setting(k);
    await k.suspendRegion(X);

    expect((await k.approveAffiliationAs(R, b1.id)).outcome).toBe("approved");
    expect(await k.affiliatedRegions(p1)).toEqual([X]);
  });

  it("approveAffiliation#16 b1 は、期間超過の代行をするサービス運営者が先に否認した / R が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { R, p1, b1 } = await setting(k);
    k.passDays(10);
    await k.rejectAs(k.O, b1.id, "確認できませんでした", {
      container: k.week,
    });
    expect((await k.app(b1.id)).status).toMatchObject({
      kind: "rejected",
      reviewAs: "overdue_proxy",
    });

    await expectCode(
      k.approveAffiliationAs(R, b1.id),
      BusinessRuleError,
      "APPLICATION_ALREADY_REJECTED",
    );
    await expectNotAffiliated(k, p1);
  });

  it("approveAffiliation#17 b1 は、R が確かめた後に、別の運営者が差し戻し、店舗管理者が回答を添えて再提出して確認中に戻った / R が、古い版を添えて b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, R, p1, S, b1 } = await setting(k);
    const read = await k.versionOf(b1.id);
    const R2 = await k.regionSteward(X, "R2");
    await k.sendBackAs(R2, b1.id, "営業の実態を教えてください", {
      container: k.week,
    });
    await k.resubmitAs(S, b1.id, { kind: "affiliation" }, "毎日営業しています");

    await expectCode(
      k.approveAffiliationAs(R, b1.id, { version: read }),
      ConflictError,
    );
    expect((await k.app(b1.id)).status.kind).toBe("underReview");
    await expectNotAffiliated(k, p1);
  });

  it("refuses an application of another kind as missing", async () => {
    const k = await stewardSeatKit();
    const { X, R, p1, S } = await setting(k);
    await k.affiliate(p1, X);
    const leave = await k.leaveAsPlace(S, { placeId: p1, regionId: X });

    await expectCode(k.approveAffiliationAs(R, leave.id), NotFoundError);
  });
});
