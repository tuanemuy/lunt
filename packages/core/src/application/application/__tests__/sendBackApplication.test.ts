import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { approveStewardshipClaim } from "../approveStewardshipClaim";
import { getApplicationForReview } from "../getApplicationForReview";
import { absentApplicationId } from "./kit";
import { reviewKit } from "./reviewKit";
import { type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

/**
 * Place p1 with its steward S, and region `regionName` — with a steward
 * R unless `stewarded` is false — to which S applies for p1's
 * affiliation (b1), under review for `days` days.
 */
async function membership(
  k: StewardSeatKit,
  spec: Readonly<{ regionName: string; stewarded: boolean; days: number }>,
) {
  const region = await k.addRegion({ name: spec.regionName });
  const R = spec.stewarded ? await k.regionSteward(region, "R") : null;
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  const b1 = await k.affiliateAsPlace(S, { placeId: p1, regionId: region });
  k.passDays(spec.days);
  return { region, R, p1, S, b1 };
}

/** `sendBackAs` on the 7-day review period of the testcases. */
const sendBack = (
  k: StewardSeatKit,
  who: Parameters<StewardSeatKit["sendBackAs"]>[0],
  id: Parameters<StewardSeatKit["sendBackAs"]>[1],
) => k.sendBackAs(who, id, undefined, { container: k.week });

describe("sendBackApplication", () => {
  it("sendBackApplication#1 利用者 A の管理権限の申請 a1 が確認中。店舗との関係の確認が足りない。操作する人はサービス運営者 O / O が、確かめたときの版と、追加で必要な確認 q を添えて a1 を差し戻す", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);
    const mark = await k.mark();

    const result = await k.sendBackAs(
      k.O,
      a1.id,
      "登記簿の写しを添えてください",
    );

    expect(result.status).toEqual({
      kind: "returned",
      request: "登記簿の写しを添えてください",
    });
    expect(result.version).toBe(Version.next(a1.version));
    const stored = await k.app(a1.id);
    expect(stored.status.kind).toBe("returned");
    const events = await k.eventsSince(mark);
    expect(events.map((e) => e.type)).toEqual(["application.returned"]);
    expect(events[0]?.payload).toEqual({
      applicationId: a1.id,
      applicant: { kind: "individual", accountId: A.accountId },
    });
    expect(
      await k.stewardship({ kind: "place", id: a1.target.placeId }),
    ).toMatchObject({
      status: "vacant",
    });
  });

  it("sendBackApplication#2 利用者 R は地域 X の運営者。店舗 p1 について店舗管理者として行った X への所属の申請 b1 が確認中 / R が、追加で必要な確認を添えて b1 を差し戻す", async () => {
    const k = await stewardSeatKit();
    const { R, p1, b1 } = await membership(k, {
      regionName: "X",
      stewarded: true,
      days: 1,
    });
    if (R === null) throw new Error("R");
    const mark = await k.mark();

    const result = await k.sendBackAs(R, b1.id, "所属の理由を添えてください", {
      container: k.week,
    });

    expect(result.status).toEqual({
      kind: "returned",
      request: "所属の理由を添えてください",
    });
    expect((await k.app(b1.id)).status.kind).toBe("returned");
    const events = await k.eventsSince(mark);
    expect(events.map((e) => [e.type, e.payload])).toEqual([
      [
        "application.returned",
        { applicationId: b1.id, applicant: { kind: "place", placeId: p1 } },
      ],
    ]);
  });

  it("sendBackApplication#3 地域 Y に運営者がいない。Y への所属の申請 b3 が確認中 / サービス運営者 O が b3 を差し戻す", async () => {
    const k = await stewardSeatKit();
    const { b1: b3 } = await membership(k, {
      regionName: "Y",
      stewarded: false,
      days: 1,
    });

    const result = await sendBack(k, k.O, b3.id);

    expect(result.status.kind).toBe("returned");
    expect((await k.app(b3.id)).status.kind).toBe("returned");
  });

  it("an absence proxy's return is refused when a steward took the seat before it committed", async () => {
    const k = await stewardSeatKit();
    const { region: Y, b1: b3 } = await membership(k, {
      regionName: "Y",
      stewarded: false,
      days: 1,
    });
    const R = await k.person("R");

    await expectCode(
      k.sendBackAs(k.O, b3.id, undefined, {
        container: commitAfter(k.week, () => k.appoint(k.regionRef(Y), R)),
      }),
      ForbiddenError,
    );
    expect((await k.app(b3.id)).status.kind).toBe("underReview");
  });

  it("sendBackApplication#4 差し戻しになった a1 / 対応を待つ申請（listApplicationsAwaitingReview）を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);
    await k.sendBackAs(k.O, a1.id);

    expect(
      (await k.awaiting("asApprover")).items.map((i) => i.id),
    ).not.toContain(a1.id);

    await k.resubmitClaim(A, a1.id);
    expect((await k.awaiting("asApprover")).items.map((i) => i.id)).toContain(
      a1.id,
    );
  });

  it("sendBackApplication#5 a1 が確認中 / O が、追加で必要な確認を空白だけにして差し戻す", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);

    await expectCode(
      k.sendBackAs(k.O, a1.id, "   "),
      BusinessRuleError,
      "APPLICATION_INVALID_RETURN_REQUEST",
    );
    expect((await k.app(a1.id)).status.kind).toBe("underReview");
  });

  it("a blank request is judged before the version the approver read", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const O2 = await k.operator("O2");
    const { claim: a1 } = await k.claimOnPlace(A);
    const read = await k.versionOf(a1.id);
    await k.sendBackAs(O2, a1.id);
    await k.resubmitClaim(A, a1.id);

    await expectCode(
      k.sendBackAs(k.O, a1.id, " ", { version: read }),
      BusinessRuleError,
      "APPLICATION_INVALID_RETURN_REQUEST",
    );
    expect((await k.app(a1.id)).status.kind).toBe("underReview");
  });

  it("a blank request is judged after the application, the approver and its status", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const U = await k.person("U");
    const { claim: a1 } = await k.claimOnPlace(A);

    await expectCode(
      k.sendBackAs(k.O, absentApplicationId(k), " ", {
        version: Version.initial(),
      }),
      NotFoundError,
    );
    await expectCode(k.sendBackAs(U, a1.id, " "), ForbiddenError);
    await k.withdrawAs(A, a1.id);
    await expectCode(
      k.sendBackAs(k.O, a1.id, " "),
      BusinessRuleError,
      "APPLICATION_ALREADY_WITHDRAWN",
    );
  });

  it("sendBackApplication#6 地域 X に運営者がいる。b1 は10日前から確認中。O は X の運営者でない / O が b1 を差し戻す", async () => {
    const k = await stewardSeatKit();
    const { b1 } = await membership(k, {
      regionName: "X",
      stewarded: true,
      days: 10,
    });

    await expectCode(
      sendBack(k, k.O, b1.id),
      BusinessRuleError,
      "APPLICATION_OVERDUE_PROXY_CANNOT_RETURN",
    );
    expect(await k.app(b1.id)).toEqual(b1);
  });

  it("sendBackApplication#7 地域 Y に運営者がいない。Y への所属の申請 b4 は10日前から確認中。サービス運営者 O が不在の代行で b4 を確かめた後、差し戻しの前に利用者 R が Y の運営者に就いた / O が b4 を差し戻す", async () => {
    const k = await stewardSeatKit();
    const { region: Y, b1: b4 } = await membership(k, {
      regionName: "Y",
      stewarded: false,
      days: 10,
    });
    const opened = await getApplicationForReview({
      container: k.week,
      actor: k.O.actor,
      input: { applicationId: b4.id },
    });
    expect(opened.permission).toEqual({ allowed: true, reviewAs: "approver" });
    await k.regionSteward(Y, "R");

    await expectCode(
      k.sendBackAs(k.O, b4.id, undefined, {
        container: k.week,
        version: opened.version,
      }),
      BusinessRuleError,
      "APPLICATION_OVERDUE_PROXY_CANNOT_RETURN",
    );
    expect(await k.app(b4.id)).toEqual(b4);
  });

  it("sendBackApplication#8 地域 X に運営者がいる。b1 は3日前から確認中 / O が b1 を差し戻す", async () => {
    const k = await stewardSeatKit();
    const { b1 } = await membership(k, {
      regionName: "X",
      stewarded: true,
      days: 3,
    });

    await expectCode(
      sendBack(k, k.O, b1.id),
      BusinessRuleError,
      "APPLICATION_AWAITING_STEWARDS",
    );
    expect(await k.app(b1.id)).toEqual(b1);
  });

  it("sendBackApplication#9 利用者 U は、a1 の承認者でない / U が a1 を差し戻す", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const U = await k.person("U");
    const { claim: a1 } = await k.claimOnPlace(A);

    await expectCode(k.sendBackAs(U, a1.id), ForbiddenError);
    expect((await k.app(a1.id)).status.kind).toBe("underReview");
  });

  it("sendBackApplication#10 a1 は、別のサービス運営者が先に承認した / O が a1 を差し戻す", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const O2 = await k.operator("O2");
    const { claim: a1 } = await k.claimOnPlace(A);
    const read = await k.versionOf(a1.id);
    await k.approveAs(approveStewardshipClaim, O2, a1.id);

    await expectCode(
      k.sendBackAs(k.O, a1.id, undefined, { version: read }),
      BusinessRuleError,
      "APPLICATION_ALREADY_APPROVED",
    );
    expect((await k.app(a1.id)).status.kind).toBe("approved");
  });

  it("sendBackApplication#11 a1 は、判断の前に A が取り下げた / O が a1 を差し戻す", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);
    await k.withdrawAs(A, a1.id);

    await expectCode(
      k.sendBackAs(k.O, a1.id),
      BusinessRuleError,
      "APPLICATION_ALREADY_WITHDRAWN",
    );
  });

  it("sendBackApplication#12 a1 はすでに差し戻されている / O が a1 をもう一度差し戻す", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);
    await k.sendBackAs(k.O, a1.id);

    await expectCode(
      k.sendBackAs(k.O, a1.id),
      BusinessRuleError,
      "APPLICATION_RETURNED",
    );
  });

  it("sendBackApplication#13 a1 は、O が確かめた後に、別のサービス運営者が差し戻し、A が再提出して確認中に戻った / O が、古い版を添えて a1 を差し戻す", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const O2 = await k.operator("O2");
    const { claim: a1 } = await k.claimOnPlace(A);
    const read = await k.versionOf(a1.id);
    await k.sendBackAs(O2, a1.id);
    await k.resubmitClaim(A, a1.id);
    const before = await k.app(a1.id);

    await expectCode(
      k.sendBackAs(k.O, a1.id, undefined, { version: read }),
      ConflictError,
    );
    expect(await k.app(a1.id)).toEqual(before);
    expect(before.status.kind).toBe("underReview");
  });
});
