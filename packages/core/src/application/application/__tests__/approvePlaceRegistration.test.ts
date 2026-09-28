import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Place } from "@repo/core/domain/place/place";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { approvePlaceRegistration } from "../approvePlaceRegistration";
import { commitAfterRun, profileFields } from "./kit";
import { reviewKit } from "./reviewKit";

describe("approvePlaceRegistration", () => {
  it("approvePlaceRegistration#1 利用者 A の登録申請 r1 が確認中。予約した reservedPlaceId は p1。内容の写真は ph1、ph2（持ち主は r1）。操作する人はサービス運営者 O / O が、確かめたときの版を添えて r1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const [ph1, ph2] = await k.photos(A, 2);
    if (ph1 === undefined || ph2 === undefined) throw new Error("photos");
    const { registration: r1 } = await k.register(A, {
      profile: { name: "新しい店", photoIds: [ph1, ph2] },
    });
    const p1 = r1.reservedPlaceId;
    const mark = await k.mark();

    const result = await k.approveAs(approvePlaceRegistration, k.O, r1.id);

    expect(result.outcome).toBe("approved");
    expect(result.application.status).toEqual({ kind: "approved" });
    expect(result.outcome === "approved" && result.reflected).toEqual({
      kind: "place",
      id: p1,
    });
    expect(result.companion).toBeNull();
    const place = (await k.getPlace(p1)).entity;
    expect(place.profile.name).toBe("新しい店");
    expect(PhotoSet.photoIds(place.profile.photos)).toEqual([ph1, ph2]);
    expect(place.operatingStatus).toBe("open");
    expect(Place.isSuspended(place)).toBe(false);
    expect(await k.photoOwner(ph1)).toEqual({ kind: "place", id: p1 });
    expect(await k.photoOwner(ph2)).toEqual({ kind: "place", id: p1 });
    const events = await k.eventsSince(mark);
    expect(events.map((e) => e.type)).toEqual(["application.approved"]);
    expect(events[0]?.payload).toEqual({
      applicationId: r1.id,
      applicant: { kind: "individual", accountId: A.accountId },
    });
    expect(await k.findStewardship({ kind: "place", id: p1 })).toBeNull();
  });

  it("approvePlaceRegistration#2 承認された r1 の店舗 p1 / 閲覧者が p1 を開く（Discovery の isViewable）", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1 } = await k.register(A);
    await k.approveAs(approvePlaceRegistration, k.O, r1.id);

    expect(
      await k.container.referenceQueries.isViewable({
        kind: "place",
        id: r1.reservedPlaceId,
      }),
    ).toBe(true);
  });

  it("approvePlaceRegistration#3 A の登録申請 r1 と、併せた管理権限の申請 s1 が、どちらも確認中 / O が r1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");

    const result = await k.approveAs(approvePlaceRegistration, k.O, r1.id);

    expect(result.outcome).toBe("approved");
    await k.getPlace(r1.reservedPlaceId);
    expect((await k.app(s1.id)).status.kind).toBe("underReview");
    expect(result.companion).toEqual({ id: s1.id, status: "underReview" });
    expect((await k.forReview(k.O, s1.id)).permission).toEqual({
      allowed: true,
      reviewAs: "approver",
    });
  });

  it("approvePlaceRegistration#4 A の登録申請 r1 が確認中。r1 に併せた管理権限の申請 s1 は取り下げになり、その後に r1 を参照する再申請 s2 が確認中 / O が r1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.withdrawAs(A, s1.id);
    const s2 = await k.claim(A, { registrationId: r1.id });

    const result = await k.approveAs(approvePlaceRegistration, k.O, r1.id);

    expect(result.companion).toEqual({ id: s2.id, status: "underReview" });
  });

  it("approvePlaceRegistration#5 サービス運営者 O 自身の登録申請 r2 が確認中 / O が r2 を承認する", async () => {
    const k = await reviewKit();
    const { registration: r2 } = await k.register(k.O);

    const result = await k.approveAs(approvePlaceRegistration, k.O, r2.id);

    expect(result.outcome).toBe("approved");
    await k.getPlace(r2.reservedPlaceId);
  });

  it("approvePlaceRegistration#6 同じ店舗への登録申請 r1 と r3 が確認中 / O が r1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const { registration: r1 } = await k.register(A, {
      profile: { name: "駅前の店" },
    });
    const { registration: r3 } = await k.register(B, {
      profile: { name: "駅前の店" },
    });

    await k.approveAs(approvePlaceRegistration, k.O, r1.id);

    expect((await k.app(r1.id)).status.kind).toBe("approved");
    expect((await k.app(r3.id)).status.kind).toBe("underReview");
  });

  it("approvePlaceRegistration#7 利用者 U はサービス運営者でない / U が r1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const U = await k.person("U");
    const { registration: r1 } = await k.register(A);

    await expectCode(
      k.approveAs(approvePlaceRegistration, U, r1.id),
      ForbiddenError,
    );
    expect((await k.app(r1.id)).status.kind).toBe("underReview");
    expect(
      await k.run(({ placeRepository }) =>
        placeRepository.findById(r1.reservedPlaceId),
      ),
    ).toBeNull();
  });

  it("an approval whose approver loses the operator role before it commits is refused, and nothing is written (D-17)", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    await k.operator("O2");
    const { registration: r1 } = await k.register(A);
    const racing = commitAfterRun(k.container, 1, () =>
      k.revokeHolder("operator", k.O),
    );

    await expectCode(
      k.approveAs(approvePlaceRegistration, k.O, r1.id, {
        container: racing,
      }),
      ForbiddenError,
    );
    expect((await k.app(r1.id)).status.kind).toBe("underReview");
    expect(
      await k.run(({ placeRepository }) =>
        placeRepository.findById(r1.reservedPlaceId),
      ),
    ).toBeNull();
  });

  it("approvePlaceRegistration#8 r1 は、別のサービス運営者が先に否認した / O が r1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const O2 = await k.operator("O2");
    const { registration: r1 } = await k.register(A);
    const read = await k.versionOf(r1.id);
    await k.rejectAs(O2, r1.id);

    await expectCode(
      k.approveAs(approvePlaceRegistration, k.O, r1.id, { version: read }),
      BusinessRuleError,
      "APPLICATION_ALREADY_REJECTED",
    );
    expect(
      await k.run(({ placeRepository }) =>
        placeRepository.findById(r1.reservedPlaceId),
      ),
    ).toBeNull();
  });

  it("approvePlaceRegistration#9 r1 は、判断の前に A が取り下げた / O が r1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1 } = await k.register(A);
    await k.withdrawAs(A, r1.id);

    await expectCode(
      k.approveAs(approvePlaceRegistration, k.O, r1.id),
      BusinessRuleError,
      "APPLICATION_ALREADY_WITHDRAWN",
    );
  });

  it("approvePlaceRegistration#10 r1 は差し戻されている / O が r1 を承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1 } = await k.register(A);
    await k.sendBackAs(k.O, r1.id);

    await expectCode(
      k.approveAs(approvePlaceRegistration, k.O, r1.id),
      BusinessRuleError,
      "APPLICATION_RETURNED",
    );
  });

  it("approvePlaceRegistration#11 ID が a1 の申請は、情報修正の申請 / O が、a1 を登録申請として承認する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId } = await k.placeWithPhotos("店舗", 0);
    const a1 = await k.revise(A, placeId);

    await expectCode(
      k.approveAs(approvePlaceRegistration, k.O, a1.id),
      NotFoundError,
    );
    expect((await k.app(a1.id)).status.kind).toBe("underReview");
  });

  it("approvePlaceRegistration#12 r1 は、O が確かめた後に、別のサービス運営者が差し戻し、A が内容を直して再提出して確認中に戻った / O が、古い版を添えて r1 を承認する", async () => {
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

    await expectCode(
      k.approveAs(approvePlaceRegistration, k.O, r1.id, { version: read }),
      ConflictError,
    );
    expect((await k.app(r1.id)).status.kind).toBe("underReview");
    expect(
      await k.run(({ placeRepository }) =>
        placeRepository.findById(r1.reservedPlaceId),
      ),
    ).toBeNull();
  });
});
