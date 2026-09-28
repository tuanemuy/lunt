import { AccountEvents } from "@repo/core/domain/account/events";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { PlaceId } from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectCode, stewardIds } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { approvePlaceRegistration } from "../approvePlaceRegistration";
import { approveStewardshipClaim } from "../approveStewardshipClaim";
import { withdrawApplicationsOfWithdrawnAccount } from "../withdrawApplicationsOfWithdrawnAccount";
import { expectLapsed } from "./kit";
import { reviewKit } from "./reviewKit";

const placeRef = (id: PlaceId) => ({ kind: "place", id }) as const;

describe("approveStewardshipClaim", () => {
  it("approveStewardshipClaim#1 店舗 p1 に店舗管理者がいない（保存された管理体制がない）。利用者 A の管理権限の申請 a1 が確認中。操作する人はサービス運営者 O / O が、確かめたときの版を添えて a1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1, claim: a1 } = await k.claimOnPlace(A);
    expect(await k.findStewardship(placeRef(p1))).toBeNull();
    const account = await k.getAccount(A);
    const mark = await k.mark();

    const result = await k.approveAs(approveStewardshipClaim, k.O, a1.id);

    expect(result.outcome).toBe("approved");
    expect(result.application.status).toEqual({ kind: "approved" });
    expect(result.outcome === "approved" && result.reflected).toEqual(
      placeRef(p1),
    );
    expect(stewardIds(await k.stewardship(placeRef(p1)))).toEqual([
      A.accountId,
    ]);
    expect((await k.getAccount(A)).entity.version).toBe(
      Version.next(account.entity.version),
    );
    const events = await k.eventsSince(mark);
    expect(events.map((e) => e.type).sort()).toEqual([
      "application.approved",
      "authority.steward_appointed",
    ]);
    expect(
      events.find((e) => e.type === "authority.steward_appointed")?.payload,
    ).toEqual({
      target: placeRef(p1),
      accountId: A.accountId,
      via: "application",
    });
  });

  it("approveStewardshipClaim#2 店舗 p1 はサービス運営者が代理登録した店舗。店舗本人の A の管理権限の申請 a1 が確認中 / O が a1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 1);
    const a1 = await k.claim(A, { placeId: p1 });

    await k.approveAs(approveStewardshipClaim, k.O, a1.id);

    const stewardship = await k.stewardship(placeRef(p1));
    expect(
      await k.decide(A, {
        kind: "manage_target",
        standing: Stewardship.standingOf(stewardship, A.accountId),
      }),
    ).toEqual({ allowed: true, basis: "steward" });
  });

  it("approveStewardshipClaim#3 店舗 p1 に店舗管理者 S がいる。A の管理権限の申請 a1 が確認中 / O が a1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const S = await k.person("S");
    const p1 = await k.place();
    await k.appoint(placeRef(p1), S);
    const a1 = await k.claim(A, { placeId: p1 });

    await k.approveAs(approveStewardshipClaim, k.O, a1.id);

    expect(stewardIds(await k.stewardship(placeRef(p1)))).toEqual([
      S.accountId,
      A.accountId,
    ]);
  });

  it("approveStewardshipClaim#4 利用者 A と B の、p1 への管理権限の申請がどちらも確認中 / O が、A の申請と B の申請を順に承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const p1 = await k.place();
    const a = await k.claim(A, { placeId: p1 });
    const b = await k.claim(B, { placeId: p1 });

    const first = await k.approveAs(approveStewardshipClaim, k.O, a.id);
    const second = await k.approveAs(approveStewardshipClaim, k.O, b.id);

    expect([first.outcome, second.outcome]).toEqual(["approved", "approved"]);
    expect(stewardIds(await k.stewardship(placeRef(p1)))).toEqual([
      A.accountId,
      B.accountId,
    ]);
  });

  it("approveStewardshipClaim#5 登録申請 r1 は承認されていて、店舗 p1 が保存されている。r1 に併せた管理権限の申請 s1 が確認中 / O が s1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.approveAs(approvePlaceRegistration, k.O, r1.id);

    const result = await k.approveAs(approveStewardshipClaim, k.O, s1.id);

    expect(result.outcome).toBe("approved");
    expect(
      stewardIds(await k.stewardship(placeRef(r1.reservedPlaceId))),
    ).toEqual([A.accountId]);
  });

  it("approveStewardshipClaim#6 登録申請 r1 と、併せた管理権限の申請 s1 が、どちらも確認中 / O が s1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { stewardship: s1 } = await k.register(A, { claim: {} });
    if (s1 === null) throw new Error("no companion");

    await expectCode(
      k.approveAs(approveStewardshipClaim, k.O, s1.id),
      BusinessRuleError,
      "APPLICATION_REGISTRATION_PENDING",
    );
    expect((await k.app(s1.id)).status.kind).toBe("underReview");
  });

  it("approveStewardshipClaim#7 登録申請 r1 は否認された。s1 の前提の再評価はまだ届いていない / O が s1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.rejectAs(k.O, r1.id);

    await expectLapsed(k.approveAs(approveStewardshipClaim, k.O, s1.id), [
      "registrationStanding",
    ]);
    expect(await k.findStewardship(placeRef(r1.reservedPlaceId))).toBeNull();
  });

  it("approveStewardshipClaim#8 a1 の確認中に、A が招待の承諾で p1 の店舗管理者になった。前提の再評価はまだ届いていない / O が a1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1, claim: a1 } = await k.claimOnPlace(A);
    await k.appoint(placeRef(p1), A);
    const mark = await k.mark();

    await expectLapsed(k.approveAs(approveStewardshipClaim, k.O, a1.id), [
      "applicantNotSteward",
    ]);
    expect((await k.eventsSince(mark)).map((e) => e.type)).toEqual([
      "application.lapsed",
    ]);
  });

  it("approveStewardshipClaim#9 a1 の確認中に、p1 がサービス運営者によって非公開になった / O が a1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1, claim: a1 } = await k.claimOnPlace(A);
    await k.suspendPlace(p1);

    const result = await k.approveAs(approveStewardshipClaim, k.O, a1.id);

    expect(result.outcome).toBe("approved");
    expect(stewardIds(await k.stewardship(placeRef(p1)))).toEqual([
      A.accountId,
    ]);
  });

  it("approveStewardshipClaim#10 利用者 U はサービス運営者でない / U が a1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const U = await k.person("U");
    const { claim: a1 } = await k.claimOnPlace(A);

    await expectCode(
      k.approveAs(approveStewardshipClaim, U, a1.id),
      ForbiddenError,
    );
  });

  it("approveStewardshipClaim#11 a1 は、判断の前に A が取り下げた / O が a1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);
    await k.withdrawAs(A, a1.id);

    await expectCode(
      k.approveAs(approveStewardshipClaim, k.O, a1.id),
      BusinessRuleError,
      "APPLICATION_ALREADY_WITHDRAWN",
    );
  });

  it("approveStewardshipClaim#12 a1 の確認中に、A が退会した。account.withdrawn の消費による取り下げはまだ届いていない / O が a1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1, claim: a1 } = await k.claimOnPlace(A);
    await k.deleteAccount(A);

    await expectCode(
      k.approveAs(approveStewardshipClaim, k.O, a1.id),
      BusinessRuleError,
      "APPLICATION_APPLICANT_WITHDRAWN",
    );
    expect((await k.app(a1.id)).status.kind).toBe("underReview");
    expect(await k.findStewardship(placeRef(p1))).toBeNull();

    await withdrawApplicationsOfWithdrawnAccount.handle(
      k.container,
      k.delivered(AccountEvents.withdrawn(A.accountId, k.tick())),
    );
    expect((await k.app(a1.id)).status.kind).toBe("withdrawn");
  });

  it("approveStewardshipClaim#13 a1 は、O が確かめた後に、別のサービス運営者が差し戻し、A が内容を直して再提出して確認中に戻った / O が、古い版を添えて a1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const O2 = await k.operator("O2");
    const { placeId: p1, claim: a1 } = await k.claimOnPlace(A);
    const read = await k.versionOf(a1.id);
    await k.sendBackAs(O2, a1.id);
    await k.resubmitClaim(A, a1.id);

    await expectCode(
      k.approveAs(approveStewardshipClaim, k.O, a1.id, { version: read }),
      ConflictError,
    );
    expect((await k.app(a1.id)).status.kind).toBe("underReview");
    expect(await k.findStewardship(placeRef(p1))).toBeNull();
  });
});
