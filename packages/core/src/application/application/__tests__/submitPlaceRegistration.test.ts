import type { ApplicationOf } from "@repo/core/domain/application/application";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError } from "../../errors";
import { prepareReapplication } from "../prepareReapplication";
import { applicationKit, profileFields, Towns } from "./kit";

const operatorSeat = { kind: "operator" } as const;

/** The counter of a `FakeIdGenerator` id. */
const serial = (id: string): number => Number.parseInt(id.slice(-12), 16);

describe("submitPlaceRegistration", () => {
  it("submitPlaceRegistration#1 利用者 A がログインしている / A が、申請の ID r1、名称、町域、位置を入力して、登録を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const r1 = k.newApplicationId();
    const mark = await k.mark();
    const { registration, stewardship } = await k.register(A, { id: r1 });
    expect(stewardship).toBeNull();
    const stored = (await k.app(
      registration.id,
    )) as ApplicationOf<"registration">;
    expect(stored).toEqual(registration);
    expect(stored.id).toBe(r1);
    expect(stored.target.applicant).toEqual({
      kind: "individual",
      accountId: A.accountId,
    });
    expect(stored.submittedAt).toEqual(k.clock.now());
    expect(stored.status).toEqual({
      kind: "underReview",
      since: k.clock.now(),
      answering: null,
    });
    expect(stored.content.name).toBe("新しい店");
    expect(
      await k.run(({ placeRepository }) =>
        placeRepository.findById(stored.reservedPlaceId),
      ),
    ).toBeNull();
    const events = await k.eventsSince(mark);
    expect(events).toEqual([
      expect.objectContaining({
        type: "application.submitted",
        aggregateId: r1,
        payload: { applicationId: r1, approver: operatorSeat },
      }),
    ]);
  });

  it("submitPlaceRegistration#2 A が登録した、持ち主のない写真 ph1、ph2 がある / A が、写真を ph1、ph2 の順に添えて登録を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const [ph1, ph2] = await k.photos(A, 2);
    if (ph1 === undefined || ph2 === undefined) throw new Error("no photos");
    const { registration } = await k.register(A, {
      profile: { photoIds: [ph1, ph2] },
    });
    expect(PhotoSet.photoIds(registration.content.photos)).toEqual([ph1, ph2]);
    const owner = k.applicationOwner(registration.id);
    expect(await k.photoOwner(ph1)).toEqual(owner);
    expect(await k.photoOwner(ph2)).toEqual(owner);
  });

  it("submitPlaceRegistration#3 利用者 A がログインしている / A が、登録申請の ID r1 と管理権限の申請の ID s1、店舗の情報、店舗との関係、確認に使える連絡先を入力して、管理権限の申請を併せて登録を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const [r1, s1] = [k.newApplicationId(), k.newApplicationId()];
    const mark = await k.mark();
    const { registration, stewardship } = await k.register(A, {
      id: r1,
      claim: { id: s1 },
    });
    expect(stewardship).not.toBeNull();
    expect(await k.app(k.asApplicationId(r1))).toEqual(registration);
    const claim = (await k.app(
      k.asApplicationId(s1),
    )) as ApplicationOf<"stewardship">;
    expect(claim).toEqual(stewardship);
    expect(claim.status.kind).toBe("underReview");
    expect(claim.target).toEqual({
      kind: "stewardship",
      applicant: { kind: "individual", accountId: A.accountId },
      placeId: registration.reservedPlaceId,
      registrationId: r1,
    });
    expect(claim.content).toEqual({
      relationship: "店主です",
      evidence: "03-0000-0000",
    });
    const submitted = await k.eventsSince(mark, "application.submitted");
    expect(submitted.map((e) => e.aggregateId)).toEqual([r1, s1]);
  });

  it("submitPlaceRegistration#4 A の登録申請 r1 が確認中 / A が、同じ店舗の情報で、別の ID r2 の登録を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1 } = await k.register(A);
    const { registration: r2 } = await k.register(A);
    expect(r2.id).not.toBe(r1.id);
    expect(r2.status.kind).toBe("underReview");
    expect(r2.reservedPlaceId).not.toBe(r1.reservedPlaceId);
    expect(await k.app(r1.id)).toEqual(r1);
  });

  it("submitPlaceRegistration#5 A の登録申請 r1（写真 ph1）が否認になっている。A は r1 から再申請を始め（prepareReapplication）、ph1 の複製 ph4 を得た / A が、返った内容を直し、ph4 を添えて、別の ID r2 で登録を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const ph1 = await k.photo(A);
    const { registration: r1 } = await k.register(A, {
      profile: { photoIds: [ph1] },
    });
    const rejected = await k.reject(r1.id);
    const prepared = await prepareReapplication({
      container: k.container,
      actor: A.actor,
      input: { applicationId: r1.id },
    });
    if (prepared.content.kind !== "registration") throw new Error("kind");
    const [ph4] = PhotoSet.photoIds(prepared.content.profile.photos);
    if (ph4 === undefined) throw new Error("no duplicate");
    const { registration: r2 } = await k.register(A, {
      profile: { name: "直した店", photoIds: [ph4] },
    });
    expect(r2.status.kind).toBe("underReview");
    expect(await k.photoOwner(ph4)).toEqual(k.applicationOwner(r2.id));
    expect(await k.app(r1.id)).toEqual(rejected);
    expect(await k.photoOwner(ph1)).toEqual(k.applicationOwner(r1.id));
    expect(r2.reservedPlaceId).not.toBe(r1.reservedPlaceId);
  });

  it("submitPlaceRegistration#6 A の登録申請 r1 が確認中で保存されている / A が、同じ ID r1 と同じ内容で、もう一度申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const r1 = k.newApplicationId();
    const { registration } = await k.register(A, { id: r1 });
    const mark = await k.mark();
    const again = await k.register(A, { id: r1 });
    expect(again).toEqual({ registration, stewardship: null });
    expect((await k.stored(registration.id)).entity.version).toBe(
      registration.version,
    );
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("submitPlaceRegistration#7 A の登録申請 r1 と併せた申請 s1 が確認中で保存されている / A が、同じ ID r1・s1 と同じ内容で、もう一度申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const [r1, s1] = [k.newApplicationId(), k.newApplicationId()];
    const first = await k.register(A, { id: r1, claim: { id: s1 } });
    const mark = await k.mark();
    const before = serial(k.t.idGenerator.next());
    const again = await k.register(A, { id: r1, claim: { id: s1 } });
    // No id was reserved by the resend: the next id follows the last one minted.
    expect(serial(k.t.idGenerator.next())).toBe(before + 1);
    expect(again).toEqual(first);
    expect(await k.eventsSince(mark)).toEqual([]);
    expect(again.stewardship?.target).toEqual({
      kind: "stewardship",
      applicant: { kind: "individual", accountId: A.accountId },
      placeId: first.registration.reservedPlaceId,
      registrationId: r1,
    });
  });

  it("submitPlaceRegistration#8 A の登録申請 r1 と併せた申請 s1 が保存されている。その後、r1 が承認された / A が、同じ ID r1・s1 と同じ内容で、もう一度申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const [r1, s1] = [k.newApplicationId(), k.newApplicationId()];
    await k.register(A, { id: r1, claim: { id: s1 } });
    const approved = await k.approveStatus(k.asApplicationId(r1));
    const mark = await k.mark();
    const again = await k.register(A, { id: r1, claim: { id: s1 } });
    expect(again.registration).toEqual(approved);
    expect(again.stewardship).toEqual(await k.app(k.asApplicationId(s1)));
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("submitPlaceRegistration#9 A の登録申請 r1 が確認中で保存されている / A が、同じ ID r1 で、名称の違う内容を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const r1 = k.newApplicationId();
    const { registration } = await k.register(A, { id: r1 });
    await expectCode(
      k.register(A, { id: r1, profile: { name: "別の店" } }),
      ConflictError,
    );
    expect(await k.app(k.asApplicationId(r1))).toEqual(registration);
  });

  it("submitPlaceRegistration#10 利用者 A がログインしている / A が、名称を空白だけにして登録を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const id = k.newApplicationId();
    await expectCode(
      k.register(A, { id, profile: { name: "  " } }),
      Error,
      "PLACE_INVALID_NAME",
    );
    expect(await k.findApp(k.asApplicationId(id))).toBeNull();
  });

  it("submitPlaceRegistration#11 利用者 A がログインしている / A が、マスターにない町域を指定して登録を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const id = k.newApplicationId();
    await expectCode(
      k.register(A, { id, profile: { town: Towns.missing } }),
      Error,
      "AREA_TOWN_NOT_FOUND",
    );
    expect(await k.findApp(k.asApplicationId(id))).toBeNull();
  });

  it("submitPlaceRegistration#12 利用者 A がログインしている / A が、管理権限の申請を併せ、店舗との関係を空にして申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const [r1, s1] = [k.newApplicationId(), k.newApplicationId()];
    await expectCode(
      k.register(A, { id: r1, claim: { id: s1, relationship: " " } }),
      Error,
      "APPLICATION_INVALID_STEWARDSHIP_CLAIM",
    );
    expect(await k.findApp(k.asApplicationId(r1))).toBeNull();
    expect(await k.findApp(k.asApplicationId(s1))).toBeNull();
  });

  it("submitPlaceRegistration#13 写真 ph3 は別の利用者が登録した、持ち主のない写真 / A が、ph3 を添えて登録を申請する", async () => {
    const k = await applicationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const ph3 = await k.photo(B);
    const id = k.newApplicationId();
    await expectCode(
      k.register(A, { id, profile: { photoIds: [ph3] } }),
      Error,
      "MEDIA_PHOTO_NOT_REGISTRANT",
    );
    expect(await k.findApp(k.asApplicationId(id))).toBeNull();
    expect(await k.photoOwner(ph3)).toBeNull();
  });

  it("submitPlaceRegistration#14 A が登録した写真 ph4 は、持ち主のないまま削除されている / A が、ph4 を添えて登録を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const ph4 = await k.photo(A);
    await k.run(async ({ photoAssetRepository }) => {
      const found = await photoAssetRepository.findById(ph4);
      if (found === null || found.entity.stage !== "stored") {
        throw new Error("no stored photo");
      }
      await photoAssetRepository.save(
        PhotoAsset.discard(found.entity),
        found.expectedVersion,
      );
    });
    const id = k.newApplicationId();
    await expectCode(
      k.register(A, { id, profile: { photoIds: [ph4] } }),
      Error,
      "MEDIA_PHOTO_NOT_AVAILABLE",
    );
    expect(await k.findApp(k.asApplicationId(id))).toBeNull();
  });

  it("submitPlaceRegistration#15 A の登録申請 r1 が、併せた申請なしで確認中で保存されている / A が、同じ ID r1 と同じ店舗の情報に、管理権限の申請 s1 を併せて申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const [r1, s1] = [k.newApplicationId(), k.newApplicationId()];
    const { registration } = await k.register(A, { id: r1 });
    await expectCode(
      k.register(A, { id: r1, claim: { id: s1 } }),
      ConflictError,
    );
    expect(await k.app(k.asApplicationId(r1))).toEqual(registration);
    expect(await k.findApp(k.asApplicationId(s1))).toBeNull();
  });

  it("submitPlaceRegistration#16 同じ ID s1 の管理権限の申請が、すでに別の内容で保存されている / A が、登録申請の ID r1 と管理権限の申請の ID s1 で、併せて申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place("店舗");
    const s1 = k.newApplicationId();
    const other = await k.claim(A, { placeId: p1 }, { id: s1 });
    const r1 = k.newApplicationId();
    await expectCode(
      k.register(A, { id: r1, claim: { id: s1 } }),
      ConflictError,
    );
    expect(await k.findApp(k.asApplicationId(r1))).toBeNull();
    expect(await k.app(other.id)).toEqual(other);
  });

  it("a resend without the claim filed with the stored registration is a conflict", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const [r1, s1] = [k.newApplicationId(), k.newApplicationId()];
    await k.register(A, { id: r1, claim: { id: s1 } });
    await expectCode(k.register(A, { id: r1 }), ConflictError);
    await expectCode(
      k.register(A, { id: r1, claim: { id: s1, evidence: "別の資料" } }),
      ConflictError,
    );
    await expectCode(
      k.register(A, { id: r1, profile: profileFields({ name: "新しい店" }) }),
      ConflictError,
    );
  });

  it("answers an existing registration of the same id with ConflictError when the input's values fail to build", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const [r1, s1] = [k.newApplicationId(), k.newApplicationId()];
    await k.register(A, { id: r1, claim: { id: s1 } });
    await expectCode(
      k.register(A, { id: r1, profile: { name: " " }, claim: { id: s1 } }),
      ConflictError,
    );
    await expectCode(
      k.register(A, {
        id: r1,
        profile: { town: Towns.missing },
        claim: { id: s1 },
      }),
      ConflictError,
    );
    await expectCode(
      k.register(A, { id: r1, claim: { id: s1, relationship: " " } }),
      ConflictError,
    );
  });
});
