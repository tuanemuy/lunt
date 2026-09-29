import type { PhotoId, PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { approveNewListing } from "../approveNewListing";
import { approveStewardshipClaim } from "../approveStewardshipClaim";
import type { ApplicationContentView } from "../detail";
import { absentApplicationId } from "./kit";
import { reviewKit } from "./reviewKit";
import { oct, stewardSeatKit } from "./stewardSeatKit";

/**
 * Occasion e1; place p1 with stewards T and S. T applies, as p1, for
 * e1's participation with a published listing l1 and 10/2: a6.
 */
async function participationSetUp() {
  const k = await stewardSeatKit();
  const e1 = await k.addOccasion({ name: "秋祭り" });
  const p1 = await k.place("山田珈琲店");
  const T = await k.manager(p1, "T");
  const S = await k.manager(p1, "S");
  const l1 = (await k.published(T, p1, { name: "ブレンド" })).id;
  const a6 = await k.participationApp(T, {
    placeId: p1,
    occasionId: e1,
    listingIds: [l1],
    dates: [oct(2)],
  });
  return { k, e1, p1, T, S, l1, a6 };
}

const placeRef = (id: PlaceId) => ({ kind: "place", id }) as const;

const shown = (photoId: PhotoId) => ({
  photoId,
  display: expect.objectContaining({ url: expect.stringContaining(photoId) }),
});

function contentOf<K extends ApplicationContentView["kind"]>(
  content: ApplicationContentView,
  kind: K,
): Extract<ApplicationContentView, { kind: K }> {
  if (content.kind !== kind) throw new Error(`not a ${kind}: ${content.kind}`);
  return content as Extract<ApplicationContentView, { kind: K }>;
}

describe("getMyApplication", () => {
  it("getMyApplication#1 利用者 A の管理権限の申請 a1 が確認中 / A が a1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p1 = await k.place("山田珈琲店");
    const a1 = await k.claim(
      A,
      { placeId: p1 },
      { relationship: "店主です", evidence: "03-1111-2222" },
    );

    const view = await k.mine(A, a1.id);

    expect(view).toEqual({
      id: a1.id,
      kind: "stewardship",
      version: a1.version,
      submittedAt: a1.submittedAt,
      applicant: { kind: "individual", accountId: A.accountId, email: A.email },
      subjects: [{ ref: placeRef(p1), name: "山田珈琲店", notYet: false }],
      status: { kind: "underReview", since: a1.submittedAt, answering: null },
      content: {
        kind: "stewardship",
        placeId: p1,
        relationship: "店主です",
        evidence: "03-1111-2222",
      },
      companion: null,
      registrationId: null,
      reflected: null,
    });
  });

  it("getMyApplication#2 A の申請 a1 は、追加で必要な確認 q で差し戻された後、回答 w を添えて再提出されて確認中 / A が a1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);
    await k.sendBackAs(k.O, a1.id, "登記簿の写しを添えてください");
    await k.resubmitClaim(A, a1.id, undefined, "写しを添えました");

    const view = await k.mine(A, a1.id);

    expect(view.status).toMatchObject({
      kind: "underReview",
      answering: {
        request: "登記簿の写しを添えてください",
        reply: "写しを添えました",
      },
    });
  });

  it("getMyApplication#3 A の申請 a1 は、q で差し戻され、回答 w を添えて再提出された後に、承認された / A が a1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1, claim: a1 } = await k.claimOnPlace(A);
    await k.sendBackAs(k.O, a1.id);
    await k.resubmitClaim(A, a1.id);
    await k.approveAs(approveStewardshipClaim, k.O, a1.id);

    const view = await k.mine(A, a1.id);

    expect(view.status).toEqual({ kind: "approved" });
    expect(view.reflected).toEqual(placeRef(p1));
  });

  it("getMyApplication#4 A の申請 a1 が、追加で必要な確認 q を添えて差し戻されている / A が a1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);
    await k.sendBackAs(k.O, a1.id, "登記簿の写しを添えてください");

    expect((await k.mine(A, a1.id)).status).toEqual({
      kind: "returned",
      request: "登記簿の写しを添えてください",
    });
  });

  it("getMyApplication#5 A の申請 a1 が、理由 r を添えて否認されている / A が a1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);
    await k.rejectAs(k.O, a1.id, "確認できませんでした");

    expect((await k.mine(A, a1.id)).status).toEqual({
      kind: "rejected",
      reason: "確認できませんでした",
    });
  });

  it("getMyApplication#6 A の情報修正の申請 a2（店舗 p1）が、placeHasNoSteward を欠いて失効している / A が a2 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const S = await k.person("S");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    const a2 = await k.revise(A, p1);
    await k.appoint(placeRef(p1), S);
    await k.lapse(a2.id);

    expect((await k.mine(A, a2.id)).status).toEqual({
      kind: "lapsed",
      brokenPremises: ["placeHasNoSteward"],
    });
  });

  it("getMyApplication#7 A の情報修正の申請 a2（店舗 p1、名称と営業時間の項目）が確認中 / A が a2 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    const a2 = await k.revise(A, p1, {
      profile: { name: "山田珈琲 本店", businessHours: "10:00〜18:00" },
    });
    const place = (await k.getPlace(p1)).entity;

    const content = contentOf((await k.mine(A, a2.id)).content, "revision");

    expect(content.changes).toEqual([
      { field: "name", current: "山田珈琲店", proposed: "山田珈琲 本店" },
      { field: "businessHours", current: null, proposed: "10:00〜18:00" },
    ]);
    expect(content.preview).toMatchObject({
      profile: {
        name: "山田珈琲 本店",
        businessHours: "10:00〜18:00",
        address: place.profile.address,
      },
      operatingStatus: "open",
    });
  });

  it("getMyApplication#8 A の掲載の修正の申請 a3（掲載 l1、名称の項目）が確認中 / A が a3 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p1 = await k.place();
    const l1 = await k.listing(p1, { name: "ブレンド" });
    const a3 = await k.reviseListing(A, l1, { name: "夏のブレンド" });

    const { revision } = contentOf(
      (await k.mine(A, a3.id)).content,
      "listingRevision",
    );

    if (revision.listing !== "present") throw new Error("listing gone");
    expect(revision.changes).toEqual([
      { field: "name", current: "ブレンド", proposed: "夏のブレンド" },
    ]);
  });

  it("getMyApplication#9 A の掲載の申請 a4 が承認されている / A が a4 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p1 = await k.place();
    const a4 = await k.newListing(A, p1);
    await k.approveAs(approveNewListing, k.O, a4.id);

    const view = await k.mine(A, a4.id);

    expect(view.status).toEqual({ kind: "approved" });
    expect(view.reflected).toEqual({
      kind: "listing",
      id: a4.reservedListingId,
    });
  });

  it("getMyApplication#10 A の管理権限の申請 a1 が承認されている / A が a1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1, claim: a1 } = await k.claimOnPlace(A);
    await k.approveAs(approveStewardshipClaim, k.O, a1.id);

    expect((await k.mine(A, a1.id)).reflected).toEqual(placeRef(p1));
  });

  it("getMyApplication#11 A の掲載の申請 a4 が承認された後に、その掲載が削除された / A が a4 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p1 = await k.place();
    const a4 = await k.newListing(A, p1, { name: "季節のパフェ" });
    await k.approveAs(approveNewListing, k.O, a4.id);
    await k.remove(k.O, a4.reservedListingId);

    const view = await k.mine(A, a4.id);

    expect(view.status).toEqual({ kind: "approved" });
    expect(view.reflected).toEqual({
      kind: "listing",
      id: a4.reservedListingId,
    });
    expect(view.subjects).toContainEqual({
      ref: { kind: "listing", id: a4.reservedListingId },
      name: "季節のパフェ",
      notYet: false,
    });
  });

  it("getMyApplication#12 A の掲載の申請 a7（写真 ph1、ph2）が否認されている / A が a7 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p1 = await k.place();
    const [ph1, ph2] = await k.photos(A, 2);
    if (ph1 === undefined || ph2 === undefined) throw new Error("photos");
    const a7 = await k.newListing(A, p1, {
      name: "季節のパフェ",
      description: "桃のパフェ",
      photos: [ph1, ph2],
    });
    await k.rejectAs(k.O, a7.id, "写真が不鮮明です");

    const view = await k.mine(A, a7.id);

    expect(view.status).toEqual({
      kind: "rejected",
      reason: "写真が不鮮明です",
    });
    const { content } = contentOf(view.content, "listing");
    expect(content).toMatchObject({
      name: "季節のパフェ",
      description: "桃のパフェ",
      category: { id: k.defaultCategory, name: "食べる" },
      offering: { kind: "none" },
    });
    expect(content.photos).toEqual([
      { ...shown(ph1), framing: null },
      { ...shown(ph2), framing: null },
    ]);
  });

  it("getMyApplication#13 A の情報修正の申請 a8（店舗 p1 の写真 ph0 に、新たに ph3 を加える写真の項目）が取り下げになっている / A が a8 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1, photoIds } = await k.placeWithPhotos("山田珈琲店", 1);
    const [ph0] = photoIds;
    if (ph0 === undefined) throw new Error("photos");
    const ph3 = await k.photo(A);
    const a8 = await k.revise(A, p1, {
      profile: { name: "山田珈琲店", photoIds: [ph0, ph3] },
    });
    await k.withdrawAs(A, a8.id);

    const content = contentOf((await k.mine(A, a8.id)).content, "revision");

    expect(content.changes).toEqual([
      {
        field: "photos",
        current: [shown(ph0)],
        proposed: [
          { ...shown(ph0), origin: "current" },
          { ...shown(ph3), origin: "added" },
        ],
      },
    ]);
    expect(content.preview.profile.photos).toEqual([shown(ph0), shown(ph3)]);
  });

  it("getMyApplication#14 A の掲載の修正の申請 a9（掲載 l1、名称と写真の項目。写真は l1 の ph1 と、a9 が持ち主の ph5）が、l1 の削除で失効している / A が a9 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const setup = await k.setupOperator();
    const p1 = await k.place();
    const ph1 = await k.photo(setup);
    const l1 = await k.listing(p1, { name: "ブレンド", photos: [ph1] });
    const ph5 = await k.photo(A);
    const a9 = await k.reviseListing(A, l1, {
      name: "夏のブレンド",
      photos: [ph1, ph5],
    });
    await k.remove(setup, l1);
    await k.lapse(a9.id);

    const view = await k.mine(A, a9.id);

    expect(view.status).toEqual({
      kind: "lapsed",
      brokenPremises: ["listingExists"],
    });
    expect(contentOf(view.content, "listingRevision").revision).toEqual({
      listing: "deleted",
      proposals: [
        { field: "name", proposed: "夏のブレンド" },
        {
          field: "photos",
          proposed: [{ ...shown(ph5), framing: null, origin: "added" }],
        },
      ],
    });
  });

  it("getMyApplication#15 A の登録申請 r1 と、併せた管理権限の申請 s1 がある / A が r1 と s1 をそれぞれ確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");

    const registration = await k.mine(A, r1.id);
    const claim = await k.mine(A, s1.id);

    expect(registration.companion).toEqual({
      id: s1.id,
      status: "underReview",
    });
    expect(registration.status.kind).toBe("underReview");
    expect(claim.registrationId).toBe(r1.id);
    expect(claim.status.kind).toBe("underReview");
  });

  it("getMyApplication#16 A の登録申請 r1 に併せた s1 が取り下げになり、その後に r1 を参照する再申請 s2 が確認中 / A が r1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.withdrawAs(A, s1.id);
    const s2 = await k.claim(A, { registrationId: r1.id });

    expect((await k.mine(A, r1.id)).companion).toEqual({
      id: s2.id,
      status: "underReview",
    });
  });

  it("getMyApplication#17 A の登録申請 r1（店舗の名称は N）が差し戻し / A が r1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1 } = await k.register(A, {
      profile: { name: "新しい店" },
    });
    await k.sendBackAs(k.O, r1.id);

    expect((await k.mine(A, r1.id)).subjects).toEqual([
      { ref: placeRef(r1.reservedPlaceId), name: "新しい店", notYet: true },
    ]);
  });

  it("getMyApplication#18 同上。その後、s2 も取り下げになった / A が r1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      profile: { name: "新しい店" },
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.withdrawAs(A, s1.id);
    k.clock.advance(60_000);
    const s2 = await k.claim(A, { registrationId: r1.id });
    await k.sendBackAs(k.O, r1.id);
    await k.withdrawAs(A, s2.id);

    expect((await k.mine(A, r1.id)).companion).toEqual({
      id: s2.id,
      status: "withdrawn",
    });
  });

  it("getMyApplication#19 A の掲載の申請 a5 の内容のカテゴリー c1 は、提出の後に廃止され、移行先は c2 / A が a5 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p1 = await k.place();
    const c1 = await k.addCategory("甘味");
    const a5 = await k.newListing(A, p1, { categoryId: c1 });
    const c2 = await k.addCategory("菓子");
    await k.retireCategory(c1, c2);

    expect(
      contentOf((await k.mine(A, a5.id)).content, "listing").content.category,
    ).toEqual({ id: c2, name: "菓子" });
  });

  it("getMyApplication#20 店舗 p1 の店舗管理者 T が店舗管理者として行った参加の申請 a6 がある。S は p1 の別の店舗管理者 / S が a6 を確かめる", async () => {
    const { k, e1, p1, T, S, l1, a6 } = await participationSetUp();

    const bySteward = await k.mine(S, a6.id);

    expect(bySteward).toEqual(await k.mine(T, a6.id));
    expect(bySteward.applicant).toEqual({
      kind: "place",
      placeId: p1,
      name: "山田珈琲店",
    });
    expect(bySteward.subjects).toEqual([
      { ref: placeRef(p1), name: "山田珈琲店", notYet: false },
      { ref: { kind: "occasion", id: e1 }, name: "秋祭り", notYet: false },
    ]);
    expect(bySteward.content).toEqual({
      kind: "participation",
      placeId: p1,
      occasionId: e1,
      listings: [
        expect.objectContaining({ id: l1, deleted: false, name: "ブレンド" }),
      ],
      dates: [oct(2)],
    });
  });

  it("getMyApplication#21 a6 に添えた掲載 l1 が、確認中に一時非公開になった / S が a6 を確かめる", async () => {
    const { k, T, S, l1, a6 } = await participationSetUp();
    await k.unpublish(T, l1);

    const view = await k.mine(S, a6.id);

    expect(contentOf(view.content, "participation").listings).toEqual([
      expect.objectContaining({
        id: l1,
        deleted: false,
        publication: expect.objectContaining({ status: "unpublished" }),
        viewable: false,
      }),
    ]);
  });

  it("getMyApplication#22 A の申請 a1 がある。利用者 B は申請者でない / B が a1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const { claim: a1 } = await k.claimOnPlace(A);

    await expectCode(k.mine(B, a1.id), ForbiddenError);
  });

  it("getMyApplication#23 店舗 p1 について店舗管理者として行った申請 a6 がある。T は p1 の管理権限を解除されている / T が、自分が提出した a6 を確かめる", async () => {
    const { k, p1, T, a6 } = await participationSetUp();
    await k.removeSteward(placeRef(p1), T);

    await expectCode(k.mine(T, a6.id), ForbiddenError);
  });

  it("getMyApplication#24 ID が a9 の申請はない / A が a9 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");

    await expectCode(k.mine(A, absentApplicationId(k)), NotFoundError);
  });
});
