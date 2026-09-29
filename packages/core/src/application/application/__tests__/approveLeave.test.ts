import type { ApplicationId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { expectLapsed } from "./kit";
import { type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

/**
 * Region X with its steward R; place p1 with its steward S, affiliated
 * with X and Y; S's leave application b1 from X (filed as the place) is
 * under review.
 */
async function setting(k: StewardSeatKit) {
  const X = await k.addRegion({ name: "X" });
  const Y = await k.addRegion({ name: "Y" });
  const R = await k.regionSteward(X, "R");
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  await k.affiliate(p1, X, Y);
  const b1 = await k.leaveAsPlace(S, { placeId: p1, regionId: X });
  return { X, Y, R, p1, S, b1 };
}

async function expectApproved(
  k: StewardSeatKit,
  id: ApplicationId,
  reviewAs: "approver" | "overdue_proxy",
) {
  expect((await k.app(id)).status).toEqual({ kind: "approved", reviewAs });
}

/** A place without a steward affiliated with a region X that has its steward R. */
async function vacantSetting(k: StewardSeatKit) {
  const X = await k.addRegion({ name: "X" });
  const R = await k.regionSteward(X, "R");
  const p2 = await k.place();
  await k.affiliate(p2, X);
  return { X, R, p2 };
}

describe("approveLeave", () => {
  it("approveLeave#1 利用者 R は地域 X の運営者。店舗 p1 は X と Y に所属中。p1 について店舗管理者として行った X からの離脱の申請 b1 が確認中 / R が、確かめたときの版を添えて b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, Y, R, p1, b1 } = await setting(k);
    const mark = await k.mark();

    const result = await k.approveLeaveAs(R, b1.id, { version: b1.version });

    expect(result).toEqual({
      outcome: "approved",
      application: expect.objectContaining({
        id: b1.id,
        kind: "leave",
        status: { kind: "approved", reviewAs: "approver" },
      }),
      reflected: { kind: "region", id: X },
    });
    expect(await k.affiliatedRegions(p1)).toEqual([Y]);
    const events = await k.eventsSince(mark);
    expect(events.map((e) => e.type).sort()).toEqual([
      "application.approved",
      "region.affiliation_dissolved",
    ]);
    expect(events.map((e) => e.payload)).toEqual(
      expect.arrayContaining([
        { applicationId: b1.id, applicant: { kind: "place", placeId: p1 } },
        { placeId: p1, regionId: X, cause: "left" },
      ]),
    );
  });

  it("approveLeave#2 店舗 p1 は X（先に所属）と Y に所属中で、選んだ代表地域は X / R が、p1 の X からの離脱の申請を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, Y, R, p1, b1 } = await setting(k);
    await k.choose(p1, X);

    await k.approveLeaveAs(R, b1.id);

    const after = await k.affiliations(p1);
    expect(after?.affiliations.map((a) => a.regionId)).toEqual([Y]);
    expect(after?.chosenRepresentative).toBeNull();
  });

  it("approveLeave#3 店舗 p1 は公開されていて営業中。p1 の掲載 l1 は公開中で提供中、l2 は一時非公開。b1 が確認中 / R が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { Y, R, p1, S, b1 } = await setting(k);
    const l1 = (await k.published(S, p1)).id;
    const l2 = (await k.published(S, p1)).id;
    await k.unpublish(S, l2);
    const place = await k.getPlace(p1);
    const listings = await Promise.all([l1, l2].map(k.findListing));

    await k.approveLeaveAs(R, b1.id);

    expect(await k.affiliatedRegions(p1)).toEqual([Y]);
    expect(await k.getPlace(p1)).toEqual(place);
    expect(await Promise.all([l1, l2].map(k.findListing))).toEqual(listings);
  });

  it("approveLeave#4 店舗 p1 は X と Y に所属中。p1 の X からの離脱の申請 b1 と、Y からの離脱の申請 b2 が確認中 / R が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { Y, R, p1, S, b1 } = await setting(k);
    const b2 = await k.leaveAsPlace(S, { placeId: p1, regionId: Y });

    await k.approveLeaveAs(R, b1.id);

    expect(await k.affiliatedRegions(p1)).toEqual([Y]);
    expect(await k.app(b2.id)).toEqual(b2);
  });

  it("approveLeave#5 利用者 A が個人として行った、管理者のいない店舗 p2 の X からの離脱の申請 b3 が確認中 / R が b3 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, R, p2 } = await vacantSetting(k);
    const A = await k.person("A");
    const b3 = await k.leaveAsIndividual(A, { placeId: p2, regionId: X });

    expect((await k.approveLeaveAs(R, b3.id)).outcome).toBe("approved");
    expect(await k.affiliatedRegions(p2)).toEqual([]);
  });

  it("approveLeave#6 地域 Y に運営者がいない。Y からの離脱の申請 b4 が確認中。操作する人はサービス運営者 O / O が b4 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, Y, p1, S } = await setting(k);
    const b4 = await k.leaveAsPlace(S, { placeId: p1, regionId: Y });

    expect((await k.approveLeaveAs(k.O, b4.id)).outcome).toBe("approved");
    await expectApproved(k, b4.id, "approver");
    expect(await k.affiliatedRegions(p1)).toEqual([X]);
  });

  it("approveLeave#7 地域 X に運営者がいる。b1 は10日前から確認中。O は X の運営者でない / O が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { Y, p1, b1 } = await setting(k);
    k.passDays(10);

    expect((await k.approveLeaveAs(k.O, b1.id)).outcome).toBe("approved");
    await expectApproved(k, b1.id, "overdue_proxy");
    expect(await k.affiliatedRegions(p1)).toEqual([Y]);
  });

  it("approveLeave#8 地域 Y に運営者がいない。Y からの離脱の申請 b7 は10日前から確認中。サービス運営者 O が不在の代行で b7 を確かめた後、承認の前に利用者 R が Y の運営者に就いた / O が b7 を1回承認する", async () => {
    const k = await stewardSeatKit();
    const { X, Y, p1, S } = await setting(k);
    const b7 = await k.leaveAsPlace(S, { placeId: p1, regionId: Y });
    k.passDays(10);
    const read = await k.versionOf(b7.id);
    await k.regionSteward(Y, "R-of-Y");

    const result = await k.approveLeaveAs(k.O, b7.id, { version: read });

    expect(result.outcome).toBe("approved");
    await expectApproved(k, b7.id, "overdue_proxy");
    expect(await k.affiliatedRegions(p1)).toEqual([X]);
  });

  it("approveLeave#9 地域 Z は公開を取り下げられている。p1 について店舗管理者として行った Z からの離脱の申請 b5 が確認中。利用者 Q は Z の運営者 / Q が b5 を承認する", async () => {
    const k = await stewardSeatKit();
    const Z = await k.addRegion({ state: "unpublished" });
    const Q = await k.regionSteward(Z, "Q");
    const p1 = await k.place();
    const S = await k.manager(p1, "S");
    await k.affiliate(p1, Z);
    const b5 = await k.leaveAsPlace(S, { placeId: p1, regionId: Z });

    expect((await k.approveLeaveAs(Q, b5.id)).outcome).toBe("approved");
    expect(await k.affiliatedRegions(p1)).toEqual([]);
  });

  it("approveLeave#10 b1 の確認中に、R が p1 を X から除外した。前提の再評価はまだ届いていない / R が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, Y, R, p1, b1 } = await setting(k);
    await k.exclude(p1, X);

    await expectLapsed(k, () => k.approveLeaveAs(R, b1.id), ["affiliated"]);
    expect(await k.affiliatedRegions(p1)).toEqual([Y]);
  });

  it("approveLeave#11 p2 の X からの離脱の申請が、A のもの（b3）と利用者 B のもの（b6）、どちらも確認中。R が b3 を承認した。b6 の前提の再評価はまだ届いていない / R が b6 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, R, p2 } = await vacantSetting(k);
    const [A, B] = [await k.person("A"), await k.person("B")];
    const b3 = await k.leaveAsIndividual(A, { placeId: p2, regionId: X });
    const b6 = await k.leaveAsIndividual(B, { placeId: p2, regionId: X });
    await k.approveLeaveAs(R, b3.id);

    await expectLapsed(k, () => k.approveLeaveAs(R, b6.id), ["affiliated"]);
  });

  it("approveLeave#12 利用者 U は X の運営者でも、サービス運営者でもない / U が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, Y, p1, b1 } = await setting(k);
    const U = await k.person("U");

    await expectCode(k.approveLeaveAs(U, b1.id), ForbiddenError);
    expect(await k.affiliatedRegions(p1)).toEqual([X, Y]);
  });

  it("approveLeave#13 b1 は、判断の前に取り下げられた / R が b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, Y, R, p1, S, b1 } = await setting(k);
    await k.withdrawAs(S, b1.id);

    await expectCode(
      k.approveLeaveAs(R, b1.id),
      BusinessRuleError,
      "APPLICATION_ALREADY_WITHDRAWN",
    );
    expect(await k.affiliatedRegions(p1)).toEqual([X, Y]);
  });

  it("approveLeave#14 b1 は、R が確かめた後に、別の運営者が差し戻し、店舗管理者が再提出して確認中に戻った / R が、古い版を添えて b1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { X, Y, R, p1, S, b1 } = await setting(k);
    const read = await k.versionOf(b1.id);
    const R2 = await k.regionSteward(X, "R2");
    await k.sendBackAs(R2, b1.id, "離脱の理由を教えてください", {
      container: k.week,
    });
    await k.resubmitAs(S, b1.id, { kind: "leave" });

    await expectCode(
      k.approveLeaveAs(R, b1.id, { version: read }),
      ConflictError,
    );
    expect((await k.app(b1.id)).status.kind).toBe("underReview");
    expect(await k.affiliatedRegions(p1)).toEqual([X, Y]);
  });
});
