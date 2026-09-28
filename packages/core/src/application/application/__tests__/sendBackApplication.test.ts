import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { approveStewardshipClaim } from "../approveStewardshipClaim";
import { reviewKit } from "./reviewKit";

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

  it.todo(
    "sendBackApplication#2 利用者 R は地域 X の運営者。店舗 p1 について店舗管理者として行った X への所属の申請 b1 が確認中 / R が、追加で必要な確認を添えて b1 を差し戻す",
  );

  it.todo(
    "sendBackApplication#3 地域 Y に運営者がいない。Y への所属の申請 b3 が確認中 / サービス運営者 O が b3 を差し戻す",
  );

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

  it.todo(
    "sendBackApplication#6 地域 X に運営者がいる。b1 は10日前から確認中。O は X の運営者でない / O が b1 を差し戻す",
  );

  it.todo(
    "sendBackApplication#7 地域 Y に運営者がいない。Y への所属の申請 b4 は10日前から確認中。サービス運営者 O が不在の代行で b4 を確かめた後、差し戻しの前に利用者 R が Y の運営者に就いた / O が b4 を差し戻す",
  );

  it.todo(
    "sendBackApplication#8 地域 X に運営者がいる。b1 は3日前から確認中 / O が b1 を差し戻す",
  );

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
