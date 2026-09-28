import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Place } from "@repo/core/domain/place/place";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { approvePlaceRevision } from "../approvePlaceRevision";
import { expectLapsed } from "./kit";
import { reviewKit } from "./reviewKit";

async function setUp() {
  const k = await reviewKit();
  const A = await k.person("A");
  const { placeId: p1, photoIds } = await k.placeWithPhotos("山田珈琲店", 2);
  return { k, A, p1, photoIds };
}

describe("approvePlaceRevision", () => {
  it("approvePlaceRevision#1 店舗 p1 に店舗管理者がいない。利用者 A の情報修正の申請 a1（名称と営業時間の項目）が確認中。操作する人はサービス運営者 O / O が、確かめたときの版を添えて a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const before = (await k.getPlace(p1)).entity;
    const a1 = await k.revise(A, p1, {
      profile: { name: "山田珈琲 本店", businessHours: "10:00〜18:00" },
    });
    const mark = await k.mark();

    const result = await k.approveAs(approvePlaceRevision, k.O, a1.id);

    expect(result.outcome).toBe("approved");
    expect(result.application.status).toEqual({ kind: "approved" });
    expect(result.outcome === "approved" && result.reflected).toEqual({
      kind: "place",
      id: p1,
    });
    const after = (await k.getPlace(p1)).entity;
    expect(after.profile.name).toBe("山田珈琲 本店");
    expect(after.profile.visitInfo.businessHours).toBe("10:00〜18:00");
    expect(after.profile.description).toBe(before.profile.description);
    expect(after.profile.address).toEqual(before.profile.address);
    expect(after.profile.photos).toEqual(before.profile.photos);
    expect(after.version).toBe(Version.next(before.version));
    expect((await k.eventsSince(mark)).map((e) => e.type)).toEqual([
      "application.approved",
    ]);
  });

  it("approvePlaceRevision#2 a1 の提出の後に、別の承認で p1 の紹介が変わっている / O が a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const B = await k.person("B");
    const a1 = await k.revise(A, p1, {
      profile: { name: "山田珈琲 本店", businessHours: "10:00〜18:00" },
    });
    const other = await k.revise(B, p1, {
      profile: { name: "山田珈琲店", description: "自家焙煎の店" },
    });
    await k.approveAs(approvePlaceRevision, k.O, other.id);

    await k.approveAs(approvePlaceRevision, k.O, a1.id);

    const after = (await k.getPlace(p1)).entity;
    expect(after.profile.name).toBe("山田珈琲 本店");
    expect(after.profile.visitInfo.businessHours).toBe("10:00〜18:00");
    expect(after.profile.description).toBe("自家焙煎の店");
  });

  it("approvePlaceRevision#3 A の情報修正の申請 a2 は、営業状況を「閉店」にする項目を持つ。p1 は営業中 / O が a2 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const a2 = await k.revise(A, p1, {
      profile: { name: "山田珈琲店" },
      operatingStatus: "permanentlyClosed",
    });
    const mark = await k.mark();

    await k.approveAs(approvePlaceRevision, k.O, a2.id);

    expect((await k.getPlace(p1)).entity.operatingStatus).toBe(
      "permanentlyClosed",
    );
    expect((await k.eventsSince(mark)).map((e) => e.type)).toEqual([
      "place.operating_status_changed",
      "application.approved",
    ]);
  });

  it("approvePlaceRevision#4 p1 の写真は ph1、ph2。a3 の写真の項目は ph3、ph1（ph3 は a3 が持ち主） / O が a3 を承認する", async () => {
    const { k, A, p1, photoIds } = await setUp();
    const [ph1, ph2] = photoIds;
    if (ph1 === undefined || ph2 === undefined) throw new Error("photos");
    const ph3 = await k.photo(A);
    const a3 = await k.revise(A, p1, {
      profile: { name: "山田珈琲店", photoIds: [ph3, ph1] },
    });
    expect(await k.photoOwner(ph3)).toEqual(k.applicationOwner(a3.id));
    const mark = await k.mark();

    await k.approveAs(approvePlaceRevision, k.O, a3.id);

    const after = (await k.getPlace(p1)).entity;
    expect(PhotoSet.photoIds(after.profile.photos)).toEqual([ph3, ph1]);
    expect(await k.photoOwner(ph3)).toEqual({ kind: "place", id: p1 });
    const released = await k.eventsSince(mark, "photos.released");
    expect(released).toHaveLength(1);
    expect(released[0]?.payload).toEqual({ photoIds: [ph2] });
    expect(released[0]?.aggregateId).toBe(p1);
  });

  it("approvePlaceRevision#5 a1 の確認中に、p1 がサービス運営者によって非公開になった / O が a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const a1 = await k.revise(A, p1, { profile: { name: "山田珈琲 本店" } });
    await k.suspendPlace(p1);

    const result = await k.approveAs(approvePlaceRevision, k.O, a1.id);

    expect(result.outcome).toBe("approved");
    const after = (await k.getPlace(p1)).entity;
    expect(after.profile.name).toBe("山田珈琲 本店");
    expect(Place.isSuspended(after)).toBe(true);
  });

  it("approvePlaceRevision#6 利用者 B の p1 への情報修正の申請 a4（名称の項目）も確認中 / O が a1 を承認し、続けて a4 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const B = await k.person("B");
    const a1 = await k.revise(A, p1, {
      profile: { name: "山田珈琲 本店", businessHours: "10:00〜18:00" },
    });
    const a4 = await k.revise(B, p1, { profile: { name: "山田珈琲 駅前店" } });

    const first = await k.approveAs(approvePlaceRevision, k.O, a1.id);
    const second = await k.approveAs(approvePlaceRevision, k.O, a4.id);

    expect(first.outcome).toBe("approved");
    expect(second.outcome).toBe("approved");
    expect((await k.getPlace(p1)).entity.profile.name).toBe("山田珈琲 駅前店");
  });

  it("approvePlaceRevision#7 a1 の確認中に、p1 に店舗管理者が就いた。前提の再評価はまだ届いていない / O が a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const S = await k.person("S");
    const ph3 = await k.photo(A);
    const [ph1] = (await k.getPlace(p1)).entity.profile.photos.items;
    if (ph1 === undefined) throw new Error("photos");
    const a1 = await k.revise(A, p1, {
      profile: { name: "山田珈琲 本店", photoIds: [ph3, ph1.photoId] },
    });
    await k.appoint({ kind: "place", id: p1 }, S);
    const before = await k.getPlace(p1);
    const mark = await k.mark();

    await expectLapsed(k, () => k.approveAs(approvePlaceRevision, k.O, a1.id), [
      "placeHasNoSteward",
    ]);

    expect((await k.app(a1.id)).status).toEqual({
      kind: "lapsed",
      brokenPremises: ["placeHasNoSteward"],
    });
    expect((await k.eventsSince(mark)).map((e) => e.type)).toEqual([
      "application.lapsed",
    ]);
    expect(await k.photoOwner(ph3)).toEqual(k.applicationOwner(a1.id));
    expect(await k.getPlace(p1)).toEqual(before);
  });

  it("approvePlaceRevision#8 a1 は、前提の再評価ですでに失効している / O が a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const S = await k.person("S");
    const a1 = await k.revise(A, p1, { profile: { name: "山田珈琲 本店" } });
    await k.appoint({ kind: "place", id: p1 }, S);
    await k.lapse(a1.id);
    const before = await k.getPlace(p1);

    await expectCode(
      k.approveAs(approvePlaceRevision, k.O, a1.id),
      BusinessRuleError,
      "APPLICATION_ALREADY_LAPSED",
    );
    expect(await k.getPlace(p1)).toEqual(before);
  });

  it("approvePlaceRevision#9 利用者 U はサービス運営者でない / U が a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const U = await k.person("U");
    const a1 = await k.revise(A, p1);

    await expectCode(
      k.approveAs(approvePlaceRevision, U, a1.id),
      ForbiddenError,
    );
  });

  it("approvePlaceRevision#10 a1 は、O が確かめた後に、別のサービス運営者が差し戻し、A が項目を直して再提出して確認中に戻った / O が、古い版を添えて a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const O2 = await k.operator("O2");
    const a1 = await k.revise(A, p1, { profile: { name: "山田珈琲 本店" } });
    const read = await k.versionOf(a1.id);
    await k.sendBackAs(O2, a1.id);
    await k.resubmitAs(A, a1.id, {
      kind: "revision",
      profile: await k.fieldsOf(p1, { name: "山田珈琲 本館" }),
      operatingStatus: "open",
    });
    const before = await k.getPlace(p1);

    await expectCode(
      k.approveAs(approvePlaceRevision, k.O, a1.id, { version: read }),
      ConflictError,
    );
    expect((await k.app(a1.id)).status.kind).toBe("underReview");
    expect(await k.getPlace(p1)).toEqual(before);
  });

  it("approvePlaceRevision#11 a1 は、O が確かめた後に差し戻され、まだ再提出されていない / O が、古い版を添えて a1 を承認する", async () => {
    const { k, A, p1 } = await setUp();
    const O2 = await k.operator("O2");
    const a1 = await k.revise(A, p1, { profile: { name: "山田珈琲 本店" } });
    const read = await k.versionOf(a1.id);
    await k.sendBackAs(O2, a1.id);

    await expectCode(
      k.approveAs(approvePlaceRevision, k.O, a1.id, { version: read }),
      BusinessRuleError,
      "APPLICATION_RETURNED",
    );
  });
});
