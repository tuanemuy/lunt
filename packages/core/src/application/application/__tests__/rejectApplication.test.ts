import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Place } from "@repo/core/domain/place/place";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { approvePlaceRegistration } from "../approvePlaceRegistration";
import { getApplicationForReview } from "../getApplicationForReview";
import { absentApplicationId, profileFields } from "./kit";
import { reviewKit } from "./reviewKit";
import { type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

/**
 * Place p1 with its steward S, and region `regionName` — with a steward
 * R unless `stewarded` is false — to which S applies for p1's
 * affiliation (or leave), under review for `days` days.
 */
async function membership(
  k: StewardSeatKit,
  spec: Readonly<{
    regionName: string;
    stewarded: boolean;
    days: number;
    kind?: "affiliation" | "leave";
  }>,
) {
  const region = await k.addRegion({ name: spec.regionName });
  const R = spec.stewarded ? await k.regionSteward(region, "R") : null;
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  if (spec.kind === "leave") await k.affiliate(p1, region);
  const apply = spec.kind === "leave" ? k.leaveAsPlace : k.affiliateAsPlace;
  const app = await apply(S, { placeId: p1, regionId: region });
  k.passDays(spec.days);
  return { region, R, p1, S, app };
}

const REASON = "所属の条件を満たしていません";

/** `rejectAs` on the 7-day review period of the testcases. */
const reject = (
  k: StewardSeatKit,
  who: Parameters<StewardSeatKit["rejectAs"]>[0],
  id: Parameters<StewardSeatKit["rejectAs"]>[1],
) => k.rejectAs(who, id, REASON, { container: k.week });

/** O opens the application on the 7-day period (CM-01). */
const openAs = (k: StewardSeatKit, id: Parameters<StewardSeatKit["app"]>[0]) =>
  getApplicationForReview({
    container: k.week,
    actor: k.O.actor,
    input: { applicationId: id },
  });

describe("rejectApplication", () => {
  it("rejectApplication#1 利用者 A の登録申請 r1 が確認中。申請が持ち主の写真は ph1、ph2。操作する人はサービス運営者 O / O が、確かめたときの版と、既存の店舗との重複の理由を添えて r1 を否認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const [ph1, ph2] = await k.photos(A, 2);
    if (ph1 === undefined || ph2 === undefined) throw new Error("photos");
    const { registration: r1 } = await k.register(A, {
      profile: { photoIds: [ph1, ph2] },
    });
    const mark = await k.mark();

    const result = await k.rejectAs(k.O, r1.id, "既存の店舗と重複しています");

    expect(result.status).toEqual({
      kind: "rejected",
      reason: "既存の店舗と重複しています",
    });
    expect((await k.app(r1.id)).status).toEqual(result.status);
    expect(
      await k.run(({ placeRepository }) =>
        placeRepository.findById(r1.reservedPlaceId),
      ),
    ).toBeNull();
    const events = await k.eventsSince(mark);
    expect(events.map((e) => e.type)).toEqual(["application.rejected"]);
    expect(events[0]?.payload).toEqual({
      applicationId: r1.id,
      applicant: { kind: "individual", accountId: A.accountId },
    });
    expect(await k.photoOwner(ph1)).toEqual(k.applicationOwner(r1.id));
    expect(await k.photoOwner(ph2)).toEqual(k.applicationOwner(r1.id));
  });

  it("rejectApplication#2 A の登録申請 r1 は、サービス運営者が非公開にしている店舗 p2 と重複している / O が、重複を理由に添えて r1 を否認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p2 } = await k.placeWithPhotos("山田珈琲店", 0);
    await k.suspendPlace(p2);
    const { registration: r1 } = await k.register(A, {
      profile: { name: "山田珈琲店" },
    });

    const result = await k.rejectAs(k.O, r1.id, "店舗 p2 と重複しています");

    expect(result.status.kind).toBe("rejected");
    expect(Place.isSuspended((await k.getPlace(p2)).entity)).toBe(true);
  });

  it("rejectApplication#3 A の登録申請 r1 と、併せた管理権限の申請 s1 が、どちらも確認中 / O が r1 を否認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    const before = await k.app(s1.id);

    await k.rejectAs(k.O, r1.id);

    expect((await k.app(r1.id)).status.kind).toBe("rejected");
    expect(await k.app(s1.id)).toEqual(before);
  });

  it("rejectApplication#4 登録申請 r1 は承認されている。併せた管理権限の申請 s1 が確認中 / O が、理由を添えて s1 を否認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.approveAs(approvePlaceRegistration, k.O, r1.id);

    const result = await k.rejectAs(k.O, s1.id, "店舗との関係を確認できません");

    expect(result.status).toEqual({
      kind: "rejected",
      reason: "店舗との関係を確認できません",
    });
    const place = await k.getPlace(r1.reservedPlaceId);
    expect(Place.isSuspended(place.entity)).toBe(false);
    expect(
      await k.stewardship({ kind: "place", id: r1.reservedPlaceId }),
    ).toMatchObject({ status: "vacant" });
  });

  it("rejectApplication#5 利用者 R は地域 X の運営者。X からの離脱の申請 b1 が確認中 / R が、理由を添えて b1 を否認する", async () => {
    const k = await stewardSeatKit();
    const {
      region: X,
      R,
      p1,
      app: b1,
    } = await membership(k, {
      regionName: "X",
      stewarded: true,
      days: 1,
      kind: "leave",
    });
    if (R === null) throw new Error("R");
    const mark = await k.mark();

    const result = await reject(k, R, b1.id);

    expect(result.status).toEqual({
      kind: "rejected",
      reason: REASON,
      reviewAs: "approver",
    });
    expect(await k.affiliatedRegions(p1)).toEqual([X]);
    expect((await k.eventsSince(mark)).map((e) => e.type)).toEqual([
      "application.rejected",
    ]);
  });

  it("rejectApplication#6 地域 X に運営者がいる。X への所属の申請 b2 は10日前から確認中。O は X の運営者でない / O が、理由を添えて b2 を否認する", async () => {
    const k = await stewardSeatKit();
    const { app: b2 } = await membership(k, {
      regionName: "X",
      stewarded: true,
      days: 10,
    });

    const result = await reject(k, k.O, b2.id);

    expect(result.status).toEqual({
      kind: "rejected",
      reason: REASON,
      reviewAs: "overdue_proxy",
    });
    expect((await k.app(b2.id)).status).toEqual(result.status);
  });

  it("an overdue proxy's rejection is refused when the seat lost its last steward before it committed, and is the approver's once it is vacant", async () => {
    const k = await stewardSeatKit();
    const {
      region: X,
      R,
      app: b2,
    } = await membership(k, {
      regionName: "X",
      stewarded: true,
      days: 10,
    });
    if (R === null) throw new Error("R");

    await expectCode(
      k.rejectAs(k.O, b2.id, REASON, {
        container: commitAfter(k.week, () =>
          k.removeSteward(k.regionRef(X), R),
        ),
      }),
      ForbiddenError,
    );
    expect(await k.app(b2.id)).toEqual(b2);

    const result = await reject(k, k.O, b2.id);
    expect(result.status).toEqual({
      kind: "rejected",
      reason: REASON,
      reviewAs: "approver",
    });
  });

  it("rejectApplication#7 A の申請が否認になっている / A が、その申請を確かめる（getMyApplication）", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);
    await k.rejectAs(k.O, a1.id, "連絡先に確認できませんでした");

    const view = await k.mine(A, a1.id);

    expect(view.status).toEqual({
      kind: "rejected",
      reason: "連絡先に確認できませんでした",
    });
  });

  it("rejectApplication#8 r1 が確認中 / O が、理由を空白だけにして否認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1 } = await k.register(A);

    await expectCode(
      k.rejectAs(k.O, r1.id, "  \n "),
      BusinessRuleError,
      "APPLICATION_INVALID_REJECTION_REASON",
    );
    expect((await k.app(r1.id)).status.kind).toBe("underReview");
  });

  it("a blank reason is judged after the application, the approver and its status, before the version", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const U = await k.person("U");
    const { registration: r1 } = await k.register(A);
    const read = await k.versionOf(r1.id);

    await expectCode(
      k.rejectAs(k.O, absentApplicationId(k), " ", {
        version: Version.initial(),
      }),
      NotFoundError,
    );
    await expectCode(k.rejectAs(U, r1.id, " "), ForbiddenError);
    await k.sendBackAs(k.O, r1.id);
    await expectCode(
      k.rejectAs(k.O, r1.id, " "),
      BusinessRuleError,
      "APPLICATION_RETURNED",
    );
    await k.resubmitAs(A, r1.id, {
      kind: "registration",
      profile: profileFields({ name: "新しい店（正式名称）" }),
    });
    await expectCode(
      k.rejectAs(k.O, r1.id, " ", { version: read }),
      BusinessRuleError,
      "APPLICATION_INVALID_REJECTION_REASON",
    );
    await expectCode(
      k.rejectAs(k.O, r1.id, undefined, { version: read }),
      ConflictError,
    );
    expect((await k.app(r1.id)).status.kind).toBe("underReview");
  });

  it("rejectApplication#9 地域 Y に運営者がいない。Y への所属の申請 b5 は3日前から確認中。サービス運営者 O が不在の代行で b5 を確かめた後、否認の前に利用者 R が Y の運営者に就いた / O が b5 を否認する", async () => {
    const k = await stewardSeatKit();
    const { region: Y, app: b5 } = await membership(k, {
      regionName: "Y",
      stewarded: false,
      days: 3,
    });
    const opened = await openAs(k, b5.id);
    expect(opened.permission).toEqual({ allowed: true, reviewAs: "approver" });
    await k.regionSteward(Y, "R");

    await expectCode(
      k.rejectAs(k.O, b5.id, REASON, {
        container: k.week,
        version: opened.version,
      }),
      BusinessRuleError,
      "APPLICATION_AWAITING_STEWARDS",
    );
    expect(await k.app(b5.id)).toEqual(b5);
  });

  it("rejectApplication#10 地域 Y に運営者がいない。Y への所属の申請 b6 は10日前から確認中。サービス運営者 O が不在の代行で b6 を確かめた後、否認の前に利用者 R が Y の運営者に就いた / O が、理由を添えて b6 を1回否認する", async () => {
    const k = await stewardSeatKit();
    const { region: Y, app: b6 } = await membership(k, {
      regionName: "Y",
      stewarded: false,
      days: 10,
    });
    const opened = await openAs(k, b6.id);
    expect(opened.permission).toEqual({ allowed: true, reviewAs: "approver" });
    await k.regionSteward(Y, "R");
    const mark = await k.mark();

    const result = await k.rejectAs(k.O, b6.id, REASON, {
      container: k.week,
      version: opened.version,
    });

    expect(result.status).toEqual({
      kind: "rejected",
      reason: REASON,
      reviewAs: "overdue_proxy",
    });
    expect((await k.app(b6.id)).status).toEqual(result.status);
    expect((await k.eventsSince(mark)).map((e) => e.type)).toEqual([
      "application.rejected",
    ]);
  });

  it("rejectApplication#11 地域 X に運営者がいる。b2 は3日前から確認中 / O が b2 を否認する", async () => {
    const k = await stewardSeatKit();
    const { app: b2 } = await membership(k, {
      regionName: "X",
      stewarded: true,
      days: 3,
    });

    await expectCode(
      reject(k, k.O, b2.id),
      BusinessRuleError,
      "APPLICATION_AWAITING_STEWARDS",
    );
    expect(await k.app(b2.id)).toEqual(b2);
  });

  it("rejectApplication#12 登録申請 r1 と併せた申請 s1 が、どちらも確認中 / O が s1 を否認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { stewardship: s1 } = await k.register(A, { claim: {} });
    if (s1 === null) throw new Error("no companion");

    await expectCode(
      k.rejectAs(k.O, s1.id),
      BusinessRuleError,
      "APPLICATION_REGISTRATION_PENDING",
    );
    expect((await k.app(s1.id)).status.kind).toBe("underReview");
  });

  it("rejectApplication#13 利用者 U は、r1 の承認者でない / U が r1 を否認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const U = await k.person("U");
    const { registration: r1 } = await k.register(A);

    await expectCode(k.rejectAs(U, r1.id), ForbiddenError);
    expect((await k.app(r1.id)).status.kind).toBe("underReview");
  });

  it("rejectApplication#14 ID が a9 の申請はない / O が a9 を否認する", async () => {
    const k = await reviewKit();
    const a9 = absentApplicationId(k);

    await expectCode(
      k.rejectAs(k.O, a9, undefined, { version: Version.initial() }),
      NotFoundError,
    );
  });

  it("rejectApplication#15 b2 は、期間超過の代行の前に、X の運営者が承認した / O が b2 を否認する", async () => {
    const k = await stewardSeatKit();
    const { R, app: b2 } = await membership(k, {
      regionName: "X",
      stewarded: true,
      days: 3,
    });
    if (R === null) throw new Error("R");
    const read = await k.versionOf(b2.id);
    await k.approveAffiliationAs(R, b2.id);

    await expectCode(
      k.rejectAs(k.O, b2.id, REASON, { container: k.week, version: read }),
      BusinessRuleError,
      "APPLICATION_ALREADY_APPROVED",
    );
    expect((await k.app(b2.id)).status).toEqual({
      kind: "approved",
      reviewAs: "approver",
    });
  });

  it("rejectApplication#16 A の情報修正の申請 a1 は、判断の前に失効した。または A が取り下げた / O が、理由を添えて a1 を否認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const S = await k.person("S");
    const { placeId: p1 } = await k.placeWithPhotos("店舗", 0);
    const { placeId: p2 } = await k.placeWithPhotos("別の店舗", 0);
    const lapsed = await k.revise(A, p1);
    const withdrawn = await k.revise(A, p2);
    await k.appoint({ kind: "place", id: p1 }, S);
    await k.lapse(lapsed.id);
    await k.withdrawAs(A, withdrawn.id);

    await expectCode(
      k.rejectAs(k.O, lapsed.id),
      BusinessRuleError,
      "APPLICATION_ALREADY_LAPSED",
    );
    await expectCode(
      k.rejectAs(k.O, withdrawn.id),
      BusinessRuleError,
      "APPLICATION_ALREADY_WITHDRAWN",
    );
  });

  it("rejectApplication#17 r1 は差し戻されている / O が r1 を否認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1 } = await k.register(A);
    await k.sendBackAs(k.O, r1.id);

    await expectCode(
      k.rejectAs(k.O, r1.id),
      BusinessRuleError,
      "APPLICATION_RETURNED",
    );
  });

  it("rejectApplication#18 r1 は、O が確かめた後に、別のサービス運営者が差し戻し、A が内容を直して再提出して確認中に戻った / O が、古い版と理由を添えて r1 を否認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const O2 = await k.operator("O2");
    const { registration: r1 } = await k.register(A);
    const read = await k.versionOf(r1.id);
    await k.sendBackAs(O2, r1.id);
    await k.resubmitAs(A, r1.id, {
      kind: "registration",
      profile: profileFields({ name: "新しい店（正式名称）" }),
    });
    const before = await k.app(r1.id);

    await expectCode(
      k.rejectAs(k.O, r1.id, undefined, { version: read }),
      ConflictError,
    );
    expect(await k.app(r1.id)).toEqual(before);
    expect(before.status.kind).toBe("underReview");
  });
});
