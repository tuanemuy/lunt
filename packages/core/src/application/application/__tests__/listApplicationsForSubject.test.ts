import type { OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { listApplicationsForSubject } from "../listApplicationsForSubject";
import { type ReviewKit, reviewKit } from "./reviewKit";
import { oct, type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

const read = (
  k: ReviewKit | StewardSeatKit,
  who: Person,
  subject: StewardedRef,
) =>
  listApplicationsForSubject({
    container: "week" in k ? k.week : k.container,
    actor: who.actor,
    input: { subject, pagination: { page: 1, limit: 100 } },
  });

const placeRef = (id: PlaceId) => ({ kind: "place", id }) as const;

/** A place with its own steward, named `name`. */
async function stewardedPlace(k: StewardSeatKit, name: string) {
  const placeId = await k.place(name);
  return { placeId, steward: await k.manager(placeId) };
}

/**
 * Occasion e1 (steward V); place p1 (steward S) applies for e1's
 * participation with its published listing l1 and 10/2.
 */
async function participationSetUp() {
  const k = await stewardSeatKit();
  const e1 = await k.addOccasion({ name: "秋祭り" });
  const V = await k.organizer(e1, "V");
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  const l1 = (await k.published(S, p1, { name: "ブレンド" })).id;
  const app = await k.participationApp(S, {
    placeId: p1,
    occasionId: e1,
    listingIds: [l1],
    dates: [oct(2)],
  });
  const occasion = { kind: "occasion", id: e1 } as const;
  return { k, e1, occasion, V, p1, S, l1, app };
}

const occasionRef = (id: OccasionId) => ({ kind: "occasion", id }) as const;

describe("listApplicationsForSubject", () => {
  it("listApplicationsForSubject#1 利用者 R は地域 X の運営者。X への所属の申請 x1（最も先に提出、承認）、離脱の申請 x2（次に提出、確認中）、所属の申請 x3（次に提出、否認）、所属の申請 x4（最後に提出、差し戻し）が保存されている / R が X の申請を読む", async () => {
    const k = await stewardSeatKit();
    const X = await k.addRegion({ name: "X" });
    const R = await k.regionSteward(X, "R");
    const [a, b, c, d] = [
      await stewardedPlace(k, "店1"),
      await stewardedPlace(k, "店2"),
      await stewardedPlace(k, "店3"),
      await stewardedPlace(k, "店4"),
    ];
    await k.affiliate(b.placeId, X);
    const x1 = await k.affiliateAsPlace(a.steward, {
      placeId: a.placeId,
      regionId: X,
    });
    k.clock.advance(60_000);
    const x2 = await k.leaveAsPlace(b.steward, {
      placeId: b.placeId,
      regionId: X,
    });
    k.clock.advance(60_000);
    const x3 = await k.affiliateAsPlace(c.steward, {
      placeId: c.placeId,
      regionId: X,
    });
    k.clock.advance(60_000);
    const x4 = await k.affiliateAsPlace(d.steward, {
      placeId: d.placeId,
      regionId: X,
    });
    await k.approveAffiliationAs(R, x1.id);
    await k.rejectAs(R, x3.id, undefined, { container: k.week });
    await k.sendBackAs(R, x4.id, undefined, { container: k.week });

    const result = await read(k, R, { kind: "region", id: X });

    expect(result.items.map((i) => i.id)).toEqual([x4.id, x2.id, x3.id, x1.id]);
    expect(result.count).toBe(4);
    expect(result.underReviewCount).toBe(1);
    expect(result.items.map((i) => [i.kind, i.status.kind])).toEqual([
      ["affiliation", "returned"],
      ["leave", "underReview"],
      ["affiliation", "rejected"],
      ["affiliation", "approved"],
    ]);
    expect(result.items[1]).toMatchObject({
      applicant: { kind: "place", placeId: b.placeId, name: "店2" },
      subjects: [
        { ref: placeRef(b.placeId), name: "店2" },
        { ref: { kind: "region", id: X }, name: "X" },
      ],
      participation: null,
    });
  });

  it("listApplicationsForSubject#2 X への所属の申請 x5 は、サービス運営者が期間超過の代行で承認した / R が X の申請を読む", async () => {
    const k = await stewardSeatKit();
    const X = await k.addRegion({ name: "X" });
    const R = await k.regionSteward(X, "R");
    const p = await stewardedPlace(k, "店5");
    const x5 = await k.affiliateAsPlace(p.steward, {
      placeId: p.placeId,
      regionId: X,
    });
    k.passDays(10);
    await k.approveAffiliationAs(k.O, x5.id);

    const result = await read(k, R, { kind: "region", id: X });

    expect(result.items.map((i) => [i.id, i.status])).toEqual([
      [x5.id, { kind: "approved", reviewAs: "overdue_proxy" }],
    ]);
  });

  it("listApplicationsForSubject#3 利用者 V はイベント e1 の運営者。e1 への参加の申請が、掲載 l1 と参加日を添えて確認中 / V が e1 の申請を読む", async () => {
    const { k, e1, occasion, V, p1, l1, app } = await participationSetUp();

    const result = await read(k, V, occasion);

    expect(result.count).toBe(1);
    expect(result.underReviewCount).toBe(1);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: app.id,
        kind: "participation",
        applicant: { kind: "place", placeId: p1, name: "山田珈琲店" },
        subjects: [
          { ref: placeRef(p1), name: "山田珈琲店", notYet: false },
          { ref: occasionRef(e1), name: "秋祭り", notYet: false },
        ],
        status: expect.objectContaining({ kind: "underReview" }),
        participation: {
          listings: [
            expect.objectContaining({
              id: l1,
              deleted: false,
              name: "ブレンド",
              viewable: true,
            }),
          ],
          dates: [oct(2)],
        },
      }),
    ]);
  });

  it("listApplicationsForSubject#4 e1 への参加の申請に添えた掲載 l1 が、確認中に削除された / V が e1 の申請を読む", async () => {
    const { k, occasion, V, S, l1 } = await participationSetUp();
    await k.remove(S, l1);

    const result = await read(k, V, occasion);

    expect(result.items.map((i) => i.participation)).toEqual([
      { listings: [{ id: l1, deleted: true }], dates: [oct(2)] },
    ]);
  });

  it("listApplicationsForSubject#5 地域 Y に運営者がいない。操作する人はサービス運営者 O / O が Y の申請を読む", async () => {
    const k = await stewardSeatKit();
    const Y = await k.addRegion({ name: "Y" });
    const p = await stewardedPlace(k, "店1");
    const y1 = await k.affiliateAsPlace(p.steward, {
      placeId: p.placeId,
      regionId: Y,
    });

    const result = await read(k, k.O, { kind: "region", id: Y });

    expect(result.items.map((i) => i.id)).toEqual([y1.id]);
    expect(result.underReviewCount).toBe(1);
  });

  it("an operator reads a region without stewards as its absence proxy", async () => {
    const k = await reviewKit();

    expect(await read(k, k.O, k.region("Y"))).toEqual({
      items: [],
      count: 0,
      underReviewCount: 0,
    });
  });

  it("listApplicationsForSubject#6 利用者 S は店舗 p1 の店舗管理者。p1 について店舗管理者として行った所属の申請 a1（確認中、別の店舗管理者 T が提出）、参加の申請 a2（差し戻し）、離脱の申請 a3（承認）と、利用者 B が個人として行った p1 の管理権限の申請 a4（確認中）が保存されている / S が p1 の申請を読む", async () => {
    const k = await stewardSeatKit();
    const S = await k.person("S");
    const T = await k.person("T");
    const B = await k.person("B");
    const p1 = await k.place("山田珈琲店");
    await k.appoint(placeRef(p1), S, T);
    const X = await k.addRegion({ name: "X" });
    const Z = await k.addRegion({ name: "Z" });
    const e1 = await k.addOccasion({ name: "秋祭り" });
    await k.affiliate(p1, Z);
    const a1 = await k.affiliateAsPlace(T, { placeId: p1, regionId: X });
    k.clock.advance(60_000);
    const a2 = await k.participationApp(S, { placeId: p1, occasionId: e1 });
    k.clock.advance(60_000);
    const a3 = await k.leaveAsPlace(S, { placeId: p1, regionId: Z });
    k.clock.advance(60_000);
    const a4 = await k.claim(B, { placeId: p1 });
    await k.sendBackAs(k.O, a2.id, undefined, { container: k.week });
    await k.approveLeaveAs(k.O, a3.id);

    const result = await read(k, S, placeRef(p1));

    expect(result.items.map((i) => i.id)).toEqual([a2.id, a1.id]);
    expect(result.items.map((i) => i.id)).not.toContain(a4.id);
    expect(result.count).toBe(2);
    expect(result.underReviewCount).toBeNull();
  });

  it("a place's steward reads only the applications made as its steward: individuals' applications about the place are left out", async () => {
    const k = await reviewKit();
    const S = await k.person("S");
    const B = await k.person("B");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    await k.claim(B, { placeId: p1 });
    await k.revise(B, p1);
    await k.appoint({ kind: "place", id: p1 }, S);

    expect(await read(k, S, { kind: "place", id: p1 })).toEqual({
      items: [],
      count: 0,
      underReviewCount: null,
    });
  });

  it("listApplicationsForSubject#7 X への申請が1件もない / R が X の申請を読む", async () => {
    const k = await reviewKit();
    const R = await k.person("R");
    const X = k.region("X");
    await k.appoint(X, R);

    expect(await read(k, R, X)).toEqual({
      items: [],
      count: 0,
      underReviewCount: 0,
    });
  });

  it("listApplicationsForSubject#8 利用者 U は X の運営者でも、サービス運営者でもない / U が X の申請を読む", async () => {
    const k = await reviewKit();
    const U = await k.person("U");
    const R = await k.person("R");
    const X = k.region("X");
    await k.appoint(X, R);

    await expectCode(read(k, U, X), ForbiddenError);
  });

  it("listApplicationsForSubject#9 地域 X に運営者がいる。サービス運営者 O は X の運営者でない / O が X の申請を読む", async () => {
    const k = await reviewKit();
    const R = await k.person("R");
    const X = k.region("X");
    await k.appoint(X, R);

    await expectCode(read(k, k.O, X), ForbiddenError);
  });

  it("listApplicationsForSubject#10 T は店舗 p1 の店舗管理者を辞任している / T が p1 の申請を読む", async () => {
    const k = await reviewKit();
    const T = await k.person("T");
    const S = await k.person("S");
    const p1 = { kind: "place", id: await k.place() } as const;
    await k.appoint(p1, T, S);
    await k.removeSteward(p1, T);

    await expectCode(read(k, T, p1), ForbiddenError);
  });

  it("listApplicationsForSubject#11 店舗 p2 に店舗管理者がいない。操作する人はサービス運営者 O / O が p2 の申請を読む", async () => {
    const k = await reviewKit();
    const p2 = { kind: "place", id: await k.place() } as const;

    await expectCode(read(k, k.O, p2), ForbiddenError);
  });
});
