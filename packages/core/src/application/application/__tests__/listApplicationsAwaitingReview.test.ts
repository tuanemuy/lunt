import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { approvePlaceRegistration } from "../approvePlaceRegistration";
import { approvePlaceRevision } from "../approvePlaceRevision";
import {
  listApplicationsAwaitingReview,
  type ReviewSection,
} from "../listApplicationsAwaitingReview";
import { reviewKit } from "./reviewKit";
import { type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

const DAY = 24 * 60 * 60 * 1000;

/** O reads a section on the testcases' 7-day review period. */
const awaitingOnWeek = (k: StewardSeatKit, section: ReviewSection) =>
  listApplicationsAwaitingReview({
    container: k.week,
    actor: k.O.actor,
    input: { section, pagination: { page: 1, limit: 100 } },
  });

/**
 * Region X with steward R and occasion e1 with steward V. Place p1
 * (steward S) applies for X's affiliation (b1, 10 days under review) and
 * e1's participation (b2, 8 days); place p2 (steward S2), affiliated with
 * X, for X's leave (b3, 3 days).
 */
async function overdueSetUp() {
  const k = await stewardSeatKit();
  const X = await k.addRegion({ name: "X" });
  const e1 = await k.addOccasion({ name: "秋祭り" });
  await k.regionSteward(X, "R");
  await k.organizer(e1, "V");
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  const p2 = await k.place("川沿いの店");
  const S2 = await k.manager(p2, "S2");
  await k.affiliate(p2, X);
  const b1 = await k.affiliateAsPlace(S, { placeId: p1, regionId: X });
  k.passDays(2);
  const b2 = await k.participationApp(S, { placeId: p1, occasionId: e1 });
  k.passDays(5);
  const b3 = await k.leaveAsPlace(S2, { placeId: p2, regionId: X });
  k.passDays(3);
  return { k, b1, b2, b3 };
}

describe("listApplicationsAwaitingReview", () => {
  it("listApplicationsAwaitingReview#1 登録申請 r1（3日前から確認中）、r1 に併せた管理権限の申請 s1（3日前から確認中）、情報修正の申請 a1（5日前から確認中）、掲載の申請 a2（1日前から確認中）、Y への所属の申請 a3（2日前から確認中）、e2 への参加の申請 a4（4日前から確認中）が保存されている。操作する人はサービス運営者 O / O が、承認者として判断する申請を読む", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const Y = await k.addRegion({ name: "Y" });
    const e2 = await k.addOccasion({ name: "冬祭り" });
    const { placeId: p0 } = await k.placeWithPhotos("山田珈琲店", 0);
    const p1 = await k.place("川沿いの店");
    const S = await k.manager(p1, "S");

    const a1 = await k.revise(A, p0);
    k.passDays(1);
    const a4 = await k.participationApp(S, { placeId: p1, occasionId: e2 });
    k.passDays(1);
    const { registration: r1, stewardship: s1 } = await k.register(B, {
      profile: { name: "新しい店" },
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    k.passDays(1);
    const a3 = await k.affiliateAsPlace(S, { placeId: p1, regionId: Y });
    k.passDays(1);
    const a2 = await k.newListing(A, p0, { name: "季節のパフェ" });
    k.passDays(1);

    const page = await awaitingOnWeek(k, "asApprover");

    expect(page.items.map((i) => i.id)).toEqual([
      a1.id,
      a4.id,
      ...[r1.id, s1.id].sort(),
      a3.id,
      a2.id,
    ]);
    expect(page.count).toBe(6);
    const byId = new Map(page.items.map((item) => [item.id, item]));
    expect(byId.get(a3.id)).toMatchObject({
      kind: "affiliation",
      applicant: { kind: "place", placeId: p1, name: "川沿いの店" },
      subjects: [
        { ref: { kind: "place", id: p1 }, name: "川沿いの店" },
        { ref: { kind: "region", id: Y }, name: "Y" },
      ],
    });
    expect(byId.get(a4.id)).toMatchObject({
      kind: "participation",
      applicant: { kind: "place", placeId: p1 },
      subjects: [
        { ref: { kind: "place", id: p1 }, name: "川沿いの店" },
        { ref: { kind: "occasion", id: e2 }, name: "冬祭り" },
      ],
    });
    expect(byId.get(a1.id)).toMatchObject({
      kind: "revision",
      applicant: { kind: "individual", accountId: A.accountId },
    });
  });

  it("the operator-seat applications under review come oldest spell first, ties by id, each with its kind, subjects and applicant", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    const a1 = await k.revise(A, p1);
    k.clock.advance(2 * DAY);
    const { registration: r1, stewardship: s1 } = await k.register(B, {
      profile: { name: "新しい店" },
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    k.clock.advance(2 * DAY);
    const a2 = await k.newListing(A, p1, { name: "季節のパフェ" });
    k.clock.advance(DAY);

    const page = await k.awaiting("asApprover");

    expect(page.items.map((i) => i.id)).toEqual([a1.id, r1.id, s1.id, a2.id]);
    expect(page.count).toBe(4);
    const [first, registration, claim, listing] = page.items;
    expect(first).toMatchObject({
      kind: "revision",
      applicant: { kind: "individual", accountId: A.accountId },
      subjects: [
        { ref: { kind: "place", id: p1 }, name: "山田珈琲店", notYet: false },
      ],
    });
    expect(registration?.kind).toBe("registration");
    expect(claim).toMatchObject({ kind: "stewardship", registrationId: r1.id });
    expect(listing).toMatchObject({
      kind: "listing",
      applicant: { kind: "individual", accountId: A.accountId },
      subjects: [
        { ref: { kind: "place", id: p1 }, name: "山田珈琲店", notYet: false },
        {
          ref: { kind: "listing", id: a2.reservedListingId },
          name: "季節のパフェ",
          notYet: true,
        },
      ],
    });
  });

  it("each individual applicant comes with their account's email address, or null once they have withdrawn", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const { claim: a1 } = await k.claimOnPlace(A);
    const { claim: b1 } = await k.claimOnPlace(B);
    await k.deleteAccount(B);

    const byId = new Map(
      (await k.awaiting("asApprover")).items.map((i) => [i.id, i]),
    );

    expect(byId.get(a1.id)?.applicant).toEqual({
      kind: "individual",
      accountId: A.accountId,
      email: A.email,
    });
    expect(byId.get(b1.id)?.applicant).toEqual({
      kind: "individual",
      accountId: B.accountId,
      email: null,
    });
  });

  it("listApplicationsAwaitingReview#2 X への所属の申請 b1（10日前から確認中）、e1 への参加の申請 b2（8日前から確認中）、X への離脱の申請 b3（3日前から確認中）が保存されている / O が、期間超過の代行ができる申請を読む", async () => {
    const { k, b1, b2 } = await overdueSetUp();

    const page = await awaitingOnWeek(k, "asOverdueProxy");

    expect(page.items.map((i) => i.id)).toEqual([b1.id, b2.id]);
    expect(page.count).toBe(2);
    expect(page.items.map((i) => i.kind)).toEqual([
      "affiliation",
      "participation",
    ]);
  });

  it("listApplicationsAwaitingReview#3 同上 / O が、承認者として判断する申請を読む", async () => {
    const { k } = await overdueSetUp();

    expect(await awaitingOnWeek(k, "asApprover")).toEqual({
      items: [],
      count: 0,
    });
  });

  it("listApplicationsAwaitingReview#4 X への所属の申請 b4 は、10日前に提出され、差し戻しの後、2日前に再提出されて確認中 / O が、期間超過の代行ができる申請を読む", async () => {
    const k = await stewardSeatKit();
    const X = await k.addRegion({ name: "X" });
    const R = await k.regionSteward(X, "R");
    const p1 = await k.place("山田珈琲店");
    const S = await k.manager(p1, "S");
    const b4 = await k.affiliateAsPlace(S, { placeId: p1, regionId: X });
    k.passDays(1);
    await k.sendBackAs(R, b4.id, undefined, { container: k.week });
    k.passDays(7);
    await k.resubmitAs(S, b4.id, { kind: "affiliation" });
    k.passDays(2);

    expect(await awaitingOnWeek(k, "asOverdueProxy")).toEqual({
      items: [],
      count: 0,
    });
  });

  it("listApplicationsAwaitingReview#5 情報修正の申請が、差し戻し・承認・否認・取り下げ・失効のそれぞれで保存されている / O が、承認者として判断する申請を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const S = await k.person("S");
    const place = async (name: string) =>
      (await k.placeWithPhotos(name, 0)).placeId;
    const returned = await k.revise(A, await place("店1"));
    const approved = await k.revise(A, await place("店2"));
    const rejected = await k.revise(A, await place("店3"));
    const withdrawn = await k.revise(A, await place("店4"));
    const p5 = await place("店5");
    const lapsed = await k.revise(A, p5);
    await k.sendBackAs(k.O, returned.id);
    await k.approveAs(approvePlaceRevision, k.O, approved.id);
    await k.rejectAs(k.O, rejected.id);
    await k.withdrawAs(A, withdrawn.id);
    await k.appoint({ kind: "place", id: p5 }, S);
    await k.lapse(lapsed.id);

    const page = await k.awaiting("asApprover");

    expect(page.items).toEqual([]);
    expect(page.count).toBe(0);
  });

  it("listApplicationsAwaitingReview#6 差し戻されていた情報修正の申請 a5 が、再提出されて確認中に戻った / O が、承認者として判断する申請を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    const a5 = await k.revise(A, p1);
    await k.sendBackAs(k.O, a5.id);
    k.clock.advance(DAY);
    await k.resubmitAs(A, a5.id, {
      kind: "revision",
      profile: await k.fieldsOf(p1, { name: "山田珈琲 本店" }),
      operatingStatus: "open",
    });
    const resubmittedAt = k.clock.now();

    const page = await k.awaiting("asApprover");

    expect(page.items.map((i) => i.id)).toEqual([a5.id]);
    expect(page.items[0]?.status).toMatchObject({
      kind: "underReview",
      since: resubmittedAt,
    });
    expect(page.items[0]?.submittedAt).toEqual(a5.submittedAt);
  });

  it("listApplicationsAwaitingReview#7 登録申請 r1 と、併せた管理権限の申請 s1 が確認中。登録申請 r3 は承認されて店舗 p3 が作られ、r3 に併せた管理権限の申請 s3 が確認中 / O が、承認者として判断する申請を読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      profile: { name: "駅前の店" },
      claim: {},
    });
    const { registration: r3, stewardship: s3 } = await k.register(B, {
      profile: { name: "川沿いの店" },
      claim: {},
    });
    if (s1 === null || s3 === null) throw new Error("no companion");
    await k.approveAs(approvePlaceRegistration, k.O, r3.id);
    const p3 = r3.reservedPlaceId;

    const page = await k.awaiting("asApprover");
    const byId = new Map(page.items.map((item) => [item.id, item]));

    const notYet = [
      {
        ref: { kind: "place", id: r1.reservedPlaceId },
        name: "駅前の店",
        notYet: true,
      },
    ];
    expect(byId.get(r1.id)?.subjects).toEqual(notYet);
    expect(byId.get(s1.id)?.subjects).toEqual(notYet);
    expect(byId.get(s3.id)?.subjects).toEqual([
      { ref: { kind: "place", id: p3 }, name: "川沿いの店", notYet: false },
    ]);
    expect(byId.has(r3.id)).toBe(false);
  });

  it("listApplicationsAwaitingReview#8 地域 X の最後の運営者が辞任し、X は運営者が不在になった。X への確認中の申請 b3 がある / O が、承認者として判断する申請を読む", async () => {
    const k = await stewardSeatKit();
    const X = await k.addRegion({ name: "X" });
    const R = await k.regionSteward(X, "R");
    const p1 = await k.place("山田珈琲店");
    const S = await k.manager(p1, "S");
    const b3 = await k.affiliateAsPlace(S, { placeId: p1, regionId: X });
    expect((await awaitingOnWeek(k, "asApprover")).items).toEqual([]);

    await k.removeSteward(k.regionRef(X), R);

    const page = await awaitingOnWeek(k, "asApprover");
    expect(page.items.map((i) => i.id)).toEqual([b3.id]);
    expect(page.count).toBe(1);
  });

  it("listApplicationsAwaitingReview#9 対応を待つ申請が1件もない / O が、2つの区分をそれぞれ読む", async () => {
    const k = await reviewKit();

    expect(await k.awaiting("asApprover")).toEqual({ items: [], count: 0 });
    expect(await k.awaiting("asOverdueProxy")).toEqual({ items: [], count: 0 });
  });

  it("listApplicationsAwaitingReview#10 利用者 R は地域 X の運営者で、サービス運営者でない / R が、承認者として判断する申請を読む", async () => {
    const k = await reviewKit();
    const R = await k.person("R");
    await k.appoint(k.region("X"), R);

    await expectCode(k.awaiting("asApprover", R), ForbiddenError);
  });
});
