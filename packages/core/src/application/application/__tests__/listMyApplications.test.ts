import type { PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { approvePlaceRegistration } from "../approvePlaceRegistration";
import { approvePlaceRevision } from "../approvePlaceRevision";
import { listMyApplications } from "../listMyApplications";
import { type ReviewKit, reviewKit } from "./reviewKit";

const placeRef = (id: PlaceId) => ({ kind: "place", id }) as const;

const list = (k: ReviewKit, who: Person, placeId: PlaceId | null = null) =>
  listMyApplications({
    container: k.container,
    actor: who.actor,
    input: { placeId, pagination: { page: 1, limit: 100 } },
  });

describe("listMyApplications", () => {
  it.todo(
    "listMyApplications#1 利用者 A は店舗 p1 の店舗管理者。A の個人の申請 a1（先に提出、否認）と a2（最後に提出、確認中）、p1 について店舗管理者として行った所属の申請 a3（a1 と a2 の間に、別の店舗管理者 T が提出）が保存されている / A が、絞り込みなしで一覧を読む",
  );

  it("the actor's individual applications come in any status, newest submission first, with kind, subjects, applicant and status", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    const a1 = await k.revise(A, p1);
    await k.rejectAs(k.O, a1.id);
    k.clock.advance(60_000);
    const a2 = await k.claim(A, { placeId: p1 });

    const result = await list(k, A);

    expect(result.items.map((i) => i.id)).toEqual([a2.id, a1.id]);
    expect(result.count).toBe(2);
    expect(result.place).toBeNull();
    expect(result.items[0]).toMatchObject({
      kind: "stewardship",
      applicant: { kind: "individual", accountId: A.accountId, email: A.email },
      subjects: [{ ref: placeRef(p1), name: "山田珈琲店", notYet: false }],
      status: { kind: "underReview" },
    });
    expect(result.items[1]?.status.kind).toBe("rejected");
  });

  it("listMyApplications#2 A の登録申請 r1 と、併せた管理権限の申請 s1 が保存されている / A が一覧を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");

    const result = await list(k, A);

    expect(result.items.map((i) => i.id).sort()).toEqual([r1.id, s1.id].sort());
    expect(result.items.find((i) => i.id === s1.id)?.registrationId).toBe(
      r1.id,
    );
  });

  it.todo(
    "listMyApplications#3 A は店舗 p1 と p2 の店舗管理者。p1 について店舗管理者として行った申請と、p2 について店舗管理者として行った申請、A の個人の申請が保存されている / A が、p1 に絞って一覧を読む",
  );

  it("narrowed to a place the actor stewards, the actor's individual applications are left out and the place is named", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p1 = await k.place("山田珈琲店");
    const p2 = await k.place("別の店");
    await k.claim(A, { placeId: p2 });
    await k.appoint(placeRef(p1), A);

    const result = await list(k, A, p1);

    expect(result).toEqual({
      items: [],
      count: 0,
      place: { id: p1, name: "山田珈琲店" },
    });
  });

  it.todo(
    "listMyApplications#4 A は店舗 p1 の店舗管理者を辞任した。p1 について店舗管理者として行った申請 a3 は、A が提出したもの / A が、絞り込みなしで一覧を読む",
  );

  it("listMyApplications#5 A が個人として行った、店舗 p3 の情報修正の申請がある。A は p3 の店舗管理者でない / A が一覧を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p3 } = await k.placeWithPhotos("山田珈琲店", 0);
    const a = await k.revise(A, p3);

    const result = await list(k, A);

    expect(result.items.map((i) => i.id)).toEqual([a.id]);
  });

  it("listMyApplications#6 利用者 B の個人の申請だけが保存されている。A は申請を1件も出していない / A が一覧を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    await k.claimOnPlace(B);

    expect(await list(k, A)).toEqual({ items: [], count: 0, place: null });
  });

  it("listMyApplications#7 A の登録申請 r1（店舗の名称は N）が確認中。A の掲載の申請 a4（掲載の名称は M、店舗 p1）が確認中 / A が一覧を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p1 = await k.place("山田珈琲店");
    const { registration: r1 } = await k.register(A, {
      profile: { name: "新しい店" },
    });
    const a4 = await k.newListing(A, p1, { name: "季節のパフェ" });

    const byId = new Map((await list(k, A)).items.map((i) => [i.id, i]));

    expect(byId.get(r1.id)?.subjects.map((s) => s.name)).toEqual(["新しい店"]);
    expect(byId.get(a4.id)?.subjects).toEqual([
      { ref: placeRef(p1), name: "山田珈琲店", notYet: false },
      {
        ref: { kind: "listing", id: a4.reservedListingId },
        name: "季節のパフェ",
        notYet: true,
      },
    ]);
  });

  it("listMyApplications#8 r1 は承認され、店舗が作られた後に、その店舗の名称が N2 に変わった / A が一覧を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const { registration: r1 } = await k.register(A, {
      profile: { name: "新しい店" },
    });
    await k.approveAs(approvePlaceRegistration, k.O, r1.id);
    const rename = await k.revise(B, r1.reservedPlaceId, {
      profile: { name: "新しい店 本店" },
    });
    await k.approveAs(approvePlaceRevision, k.O, rename.id);

    const item = (await list(k, A)).items.find((i) => i.id === r1.id);

    expect(item?.subjects).toEqual([
      { ref: placeRef(r1.reservedPlaceId), name: "新しい店", notYet: false },
    ]);
  });

  it("listMyApplications#9 A の登録申請 r1 と、併せた管理権限の申請 s1 が確認中。A の登録申請 r2 は承認され、店舗 p2 が作られている / A が一覧を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      profile: { name: "駅前の店" },
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    const { registration: r2 } = await k.register(A, {
      profile: { name: "川沿いの店" },
    });
    await k.approveAs(approvePlaceRegistration, k.O, r2.id);

    const byId = new Map((await list(k, A)).items.map((i) => [i.id, i]));

    const notYet = [
      {
        ref: placeRef(r1.reservedPlaceId),
        name: "駅前の店",
        notYet: true,
      },
    ];
    expect(byId.get(r1.id)?.subjects).toEqual(notYet);
    expect(byId.get(s1.id)?.subjects).toEqual(notYet);
    expect(byId.get(r2.id)?.subjects).toEqual([
      {
        ref: placeRef(r2.reservedPlaceId),
        name: "川沿いの店",
        notYet: false,
      },
    ]);
  });

  it("listMyApplications#10 A の掲載の修正の申請 a5 の対象の掲載 l1 が削除された / A が一覧を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p1 = await k.place("山田珈琲店");
    const l1 = await k.listing(p1);
    const a5 = await k.reviseListing(A, l1);
    await k.remove(await k.setupOperator(), l1);

    const item = (await list(k, A)).items.find((i) => i.id === a5.id);

    expect(item?.subjects).toEqual([
      { ref: placeRef(p1), name: "山田珈琲店", notYet: false },
      { ref: { kind: "listing", id: l1 }, name: null, notYet: false },
    ]);
  });

  it("listMyApplications#11 A の情報修正の申請 a6（店舗 p1。p1 の現在の名称は N3）が確認中。p1 はサービス運営者が非公開にしている / A が一覧を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    const a6 = await k.revise(A, p1, { profile: { name: "山田珈琲 本店" } });
    const rename = await k.revise(B, p1, { profile: { name: "山田コーヒー" } });
    await k.approveAs(approvePlaceRevision, k.O, rename.id);
    await k.suspendPlace(p1);

    const item = (await list(k, A)).items.find((i) => i.id === a6.id);

    expect(item?.subjects).toEqual([
      { ref: placeRef(p1), name: "山田コーヒー", notYet: false },
    ]);
  });

  it("listMyApplications#12 A は店舗 p1 の店舗管理者でない / A が、p1 に絞って一覧を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p1 = await k.place();

    await expectCode(list(k, A, p1), ForbiddenError);
  });
});
