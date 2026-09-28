import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { NotFoundError } from "../../errors";
import { applicationKit } from "./kit";

const individual = (accountId: string) => ({ kind: "individual", accountId });

describe("submitStewardshipClaim", () => {
  it("submitStewardshipClaim#1 店舗 p1 は公開されていて、店舗管理者がいない。利用者 A がログインしている / A が、店舗との関係と、確認に使える連絡先を文章で記して、p1 の管理権限を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const mark = await k.mark();
    const claim = await k.claim(
      A,
      { placeId: p1 },
      { relationship: " 店主です ", evidence: "電話 03-0000-0000" },
    );
    expect(await k.app(claim.id)).toEqual(claim);
    expect(claim.status.kind).toBe("underReview");
    expect(claim.content).toEqual({
      relationship: "店主です",
      evidence: "電話 03-0000-0000",
    });
    expect(claim.target).toEqual({
      kind: "stewardship",
      applicant: individual(A.accountId),
      placeId: p1,
      registrationId: null,
    });
    expect(await k.eventsSince(mark)).toEqual([
      expect.objectContaining({
        type: "application.submitted",
        payload: { applicationId: claim.id, approver: { kind: "operator" } },
      }),
    ]);
  });

  it("submitStewardshipClaim#2 店舗 p1 に店舗管理者 S がいる。A は p1 の店舗管理者でない / A が p1 の管理権限を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.manager(p1, "s");
    const claim = await k.claim(A, { placeId: p1 });
    expect(claim.status.kind).toBe("underReview");
  });

  it("submitStewardshipClaim#3 店舗 p1 はサービス運営者が代理登録した店舗で、店舗管理者がいない / 店舗本人の A が p1 の管理権限を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { placeId: p1 } = await k.placeWithPhotos("代理登録の店", 0);
    const claim = await k.claim(A, { placeId: p1 });
    expect(claim.status.kind).toBe("underReview");
  });

  it("submitStewardshipClaim#4 利用者 B の p1 への管理権限の申請が確認中 / A が p1 の管理権限を申請する", async () => {
    const k = await applicationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const p1 = await k.place();
    const byB = await k.claim(B, { placeId: p1 });
    const byA = await k.claim(A, { placeId: p1 });
    expect(byA.status.kind).toBe("underReview");
    expect(await k.app(byB.id)).toEqual(byB);
  });

  it("submitStewardshipClaim#5 A の登録申請 r1 は確認中。r1 に併せた管理権限の申請 s1 は取り下げになっている / A が、r1 を参照して、別の ID s2 で管理権限を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    const withdrawn = await k.withdrawRaw(s1.id);
    const s2 = await k.claim(A, { registrationId: r1.id });
    expect(s2.status.kind).toBe("underReview");
    expect(s2.target).toEqual({
      kind: "stewardship",
      applicant: individual(A.accountId),
      placeId: r1.reservedPlaceId,
      registrationId: r1.id,
    });
    expect(await k.app(s1.id)).toEqual(withdrawn);
    expect(
      await k.run(({ placeRepository }) =>
        placeRepository.findById(r1.reservedPlaceId),
      ),
    ).toBeNull();
  });

  it("submitStewardshipClaim#6 A の登録申請 r1 は否認になっている / A が、r1 を参照して管理権限を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1 } = await k.register(A);
    await k.reject(r1.id);
    const id = k.newApplicationId();
    await expectCode(
      k.claim(A, { registrationId: r1.id }, { id }),
      Error,
      "APPLICATION_REGISTRATION_NOT_STANDING",
    );
    expect(await k.findApp(k.asApplicationId(id))).toBeNull();
  });

  it("submitStewardshipClaim#7 A の登録申請 r1 は承認されて店舗 p1 が作られている。r1 に併せた管理権限の申請 s1 は否認になっている。p1 は公開されている / A が、r1 を参照して、別の ID s2 で管理権限を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    const p1 = await k.registrationApproved(r1.id);
    await k.reject(s1.id);
    const s2 = await k.claim(A, { registrationId: r1.id });
    expect(s2.status.kind).toBe("underReview");
    expect(s2.target).toEqual({
      kind: "stewardship",
      applicant: individual(A.accountId),
      placeId: p1,
      registrationId: null,
    });
  });

  it("submitStewardshipClaim#8 同上。p1 はサービス運営者が非公開にしている / A が、r1 を参照して管理権限を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    const p1 = await k.registrationApproved(r1.id);
    await k.reject(s1.id);
    await k.suspendPlace(p1);
    const id = k.newApplicationId();
    await expectCode(
      k.claim(A, { registrationId: r1.id }, { id }),
      Error,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
    expect(await k.findApp(k.asApplicationId(id))).toBeNull();
  });

  it("submitStewardshipClaim#9 A が r1 を参照して提出した管理権限の申請 s2（registrationId は r1）が確認中で保存されている。その後、r1 が承認された / A が、同じ ID s2 と、最初と同じ入力で、もう一度申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1 } = await k.register(A);
    const id = k.newApplicationId();
    const s2 = await k.claim(A, { registrationId: r1.id }, { id });
    expect(s2.target.registrationId).toBe(r1.id);
    await k.registrationApproved(r1.id);
    const mark = await k.mark();
    expect(await k.claim(A, { registrationId: r1.id }, { id })).toEqual(s2);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("submitStewardshipClaim#10 A は p1 の店舗管理者 / A が p1 の管理権限を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.appoint(k.ref(p1), A);
    await expectCode(
      k.claim(A, { placeId: p1 }),
      Error,
      "APPLICATION_ALREADY_STEWARD",
    );
  });

  it("submitStewardshipClaim#11 A の p1 への管理権限の申請が確認中 / A が、別の ID で p1 の管理権限を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.claim(A, { placeId: p1 });
    await expectCode(
      k.claim(A, { placeId: p1 }, { relationship: "店長です" }),
      Error,
      "APPLICATION_ALREADY_ACTIVE",
    );
  });

  it("submitStewardshipClaim#12 店舗 p1 はサービス運営者が非公開にしている / A が p1 の管理権限を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.suspendPlace(p1);
    await expectCode(
      k.claim(A, { placeId: p1 }),
      Error,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
  });

  it("submitStewardshipClaim#13 店舗 p1 に店舗管理者がいない / A が、確認に使える連絡先または資料を空にして申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await expectCode(
      k.claim(A, { placeId: p1 }, { evidence: "  " }),
      Error,
      "APPLICATION_INVALID_STEWARDSHIP_CLAIM",
    );
  });

  it("submitStewardshipClaim#14 利用者 B の登録申請 r2 が確認中 / A が、r2 を参照して管理権限を申請する", async () => {
    const k = await applicationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const { registration: r2 } = await k.register(B);
    const id = k.newApplicationId();
    await expectCode(
      k.claim(A, { registrationId: r2.id }, { id }),
      NotFoundError,
    );
    expect(await k.findApp(k.asApplicationId(id))).toBeNull();
  });

  it("refers to a missing application, or one that is not a registration, as not found", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const revision = await k.revise(A, p1);
    await expectCode(
      k.claim(A, { registrationId: revision.id }),
      NotFoundError,
    );
    await expectCode(
      k.claim(A, { registrationId: k.asApplicationId(k.newId()) }),
      NotFoundError,
    );
  });

  describe("the order of checks with an input whose values fail to build", () => {
    it("answers an existing application of the same id with ConflictError", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      const p1 = await k.place();
      const id = k.newApplicationId();
      await k.claim(A, { placeId: p1 }, { id });
      await expectCode(
        k.claim(A, { placeId: p1 }, { id, evidence: " " }),
        Error,
        "APPLICATION_ID_CONFLICT",
      );
    });

    it("answers a broken premise with the premise's code", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      const p1 = await k.place();
      await k.appoint(k.ref(p1), A);
      await expectCode(
        k.claim(A, { placeId: p1 }, { evidence: " " }),
        Error,
        "APPLICATION_ALREADY_STEWARD",
      );
    });

    it("answers an unviewable target with APPLICATION_TARGET_NOT_VIEWABLE", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      const p1 = await k.place();
      await k.suspendPlace(p1);
      await expectCode(
        k.claim(A, { placeId: p1 }, { relationship: " " }),
        Error,
        "APPLICATION_TARGET_NOT_VIEWABLE",
      );
    });
  });
});
