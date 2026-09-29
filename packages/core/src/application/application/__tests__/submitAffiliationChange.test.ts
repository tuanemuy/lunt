import type { ApplicationId, PlaceId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

const asPlace = (placeId: PlaceId) => ({ kind: "place", placeId }) as const;

/** A place with its steward `S`. */
async function stewardedPlace(k: StewardSeatKit) {
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  return { p1, S };
}

const expectNoApplication = async (k: StewardSeatKit, id: ApplicationId) =>
  expect(await k.findApp(id)).toBeNull();

describe("submitAffiliationChange", () => {
  it("submitAffiliationChange#1 利用者 S は店舗 p1 の店舗管理者。地域 X は公開中で、運営者がいる。p1 は X に所属していない / S が、店舗管理者として、p1 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S } = await stewardedPlace(k);
    const X = await k.addRegion({ name: "X" });
    await k.regionSteward(X, "R");
    const mark = await k.mark();

    const b1 = await k.affiliateAsPlace(S, { placeId: p1, regionId: X });

    expect(await k.app(b1.id)).toEqual(b1);
    expect(b1.status).toMatchObject({ kind: "underReview", answering: null });
    expect(b1.target).toEqual({
      kind: "affiliation",
      applicant: asPlace(p1),
      placeId: p1,
      regionId: X,
    });
    expect(b1.content).toBeNull();
    expect(await k.eventsSince(mark)).toEqual([
      expect.objectContaining({
        type: "application.submitted",
        payload: {
          applicationId: b1.id,
          approver: { kind: "steward", target: { kind: "region", id: X } },
        },
      }),
    ]);
    expect(await k.affiliations(p1)).toBeNull();
  });

  it("submitAffiliationChange#2 S は p1 の店舗管理者。p1 は X に所属中 / S が、店舗管理者として、p1 の X からの離脱を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S } = await stewardedPlace(k);
    const X = await k.addRegion();
    await k.affiliate(p1, X);

    const b2 = await k.leaveAsPlace(S, { placeId: p1, regionId: X });

    expect((await k.app(b2.id)).status.kind).toBe("underReview");
    expect(b2.target).toEqual({
      kind: "leave",
      applicant: asPlace(p1),
      placeId: p1,
      regionId: X,
    });
    expect(await k.affiliatedRegions(p1)).toEqual([X]);
  });

  it("submitAffiliationChange#3 S は p1 の店舗管理者。p1 は Y に所属中で、X には所属していない / S が、p1 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S } = await stewardedPlace(k);
    const [X, Y] = [await k.addRegion(), await k.addRegion()];
    await k.affiliate(p1, Y);
    const leaveY = await k.leaveAsPlace(S, { placeId: p1, regionId: Y });
    const affiliationsBefore = await k.affiliations(p1);

    const b1 = await k.affiliateAsPlace(S, { placeId: p1, regionId: X });

    expect(b1.status.kind).toBe("underReview");
    expect(await k.affiliations(p1)).toEqual(affiliationsBefore);
    expect(await k.app(leaveY.id)).toEqual(leaveY);
  });

  it("submitAffiliationChange#4 S は p1 の店舗管理者。p1 は、公開を取り下げた地域 Z に所属中 / S が、店舗管理者として、p1 の Z からの離脱を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S } = await stewardedPlace(k);
    const Z = await k.addRegion({ state: "unpublished" });
    await k.affiliate(p1, Z);

    const b5 = await k.leaveAsPlace(S, { placeId: p1, regionId: Z });

    expect((await k.app(b5.id)).status.kind).toBe("underReview");
  });

  it("submitAffiliationChange#5 店舗 p2 に店舗管理者がいない。利用者 A がログインしている。地域 X は公開中 / A が、個人として、p2 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const p2 = await k.place();
    const X = await k.addRegion();
    const mark = await k.mark();

    const b3 = await k.affiliateAsIndividual(A, { placeId: p2, regionId: X });

    expect(await k.app(b3.id)).toEqual(b3);
    expect(b3.status.kind).toBe("underReview");
    expect(b3.target).toEqual({
      kind: "affiliation",
      applicant: { kind: "individual", accountId: A.accountId },
      placeId: p2,
      regionId: X,
    });
    expect(
      (await k.eventsSince(mark, "application.submitted")).map(
        (e) => e.payload,
      ),
    ).toEqual([
      {
        applicationId: b3.id,
        approver: { kind: "steward", target: { kind: "region", id: X } },
      },
    ]);
  });

  it("submitAffiliationChange#6 店舗 p2 に店舗管理者がいない。p2 は X に所属中 / A が、個人として、p2 の X からの離脱を申請する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const p2 = await k.place();
    const X = await k.addRegion();
    await k.affiliate(p2, X);

    const b3 = await k.leaveAsIndividual(A, { placeId: p2, regionId: X });

    expect((await k.app(b3.id)).status.kind).toBe("underReview");
    expect(b3.target).toMatchObject({
      kind: "leave",
      applicant: { kind: "individual", accountId: A.accountId },
    });
  });

  it("submitAffiliationChange#7 店舗 p2 に店舗管理者がいない。利用者 B が個人として行った、p2 の X への所属の申請が確認中 / A が、個人として、p2 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const [A, B] = [await k.person("A"), await k.person("B")];
    const p2 = await k.place();
    const X = await k.addRegion();
    const byB = await k.affiliateAsIndividual(B, { placeId: p2, regionId: X });

    const byA = await k.affiliateAsIndividual(A, { placeId: p2, regionId: X });

    expect((await k.app(byA.id)).status.kind).toBe("underReview");
    expect((await k.app(byB.id)).status.kind).toBe("underReview");
  });

  it("submitAffiliationChange#8 店舗 p1 に店舗管理者 S がいる。A は p1 の店舗管理者でない / A が、個人として、p1 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const { p1 } = await stewardedPlace(k);
    const X = await k.addRegion();
    const id = k.newApplicationId();

    await expectCode(
      k.affiliateAsIndividual(A, { placeId: p1, regionId: X, id }),
      BusinessRuleError,
      "APPLICATION_PLACE_HAS_STEWARD",
    );
    await expectNoApplication(k, k.asApplicationId(id));
  });

  it("submitAffiliationChange#9 A は p1 の店舗管理者でない / A が、店舗管理者として、p1 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const { p1 } = await stewardedPlace(k);
    const X = await k.addRegion();
    const id = k.newApplicationId();

    await expectCode(
      k.affiliateAsPlace(A, { placeId: p1, regionId: X, id }),
      ForbiddenError,
    );
    await expectNoApplication(k, k.asApplicationId(id));
  });

  it("submitAffiliationChange#10 S は申請の入力の途中で p1 の管理権限を解除された / S が、店舗管理者として、p1 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S } = await stewardedPlace(k);
    const X = await k.addRegion();
    const id = k.newApplicationId();
    // S's stewardship is removed after the submission read it, before its commit.
    const racing = commitAfter(k.container, () =>
      k.removeSteward(k.ref(p1), S),
    );

    await expectCode(
      k.affiliateAsPlace(S, {
        placeId: p1,
        regionId: X,
        id,
        container: racing,
      }),
      ForbiddenError,
    );
    await expectNoApplication(k, k.asApplicationId(id));
    // Once removed, a fresh attempt is refused as well.
    await expectCode(
      k.affiliateAsPlace(S, { placeId: p1, regionId: X, id }),
      ForbiddenError,
    );
  });

  it("submitAffiliationChange#11 サービス運営者 O は、管理者のいない店舗 p2 の店舗管理者でない / O が、店舗管理者として、p2 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const p2 = await k.place();
    const X = await k.addRegion();
    const id = k.newApplicationId();

    await expectCode(
      k.affiliateAsPlace(k.O, { placeId: p2, regionId: X, id }),
      ForbiddenError,
    );
    await expectNoApplication(k, k.asApplicationId(id));
  });

  it("submitAffiliationChange#12 S は p1 の店舗管理者。p1 は X に所属中 / S が p1 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S } = await stewardedPlace(k);
    const X = await k.addRegion();
    await k.affiliate(p1, X);

    await expectCode(
      k.affiliateAsPlace(S, { placeId: p1, regionId: X }),
      BusinessRuleError,
      "APPLICATION_ALREADY_AFFILIATED",
    );
  });

  it("submitAffiliationChange#13 S は p1 の店舗管理者。p1 と X の所属は、除外で解除されている / S が p1 の X からの離脱を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S } = await stewardedPlace(k);
    const X = await k.addRegion();
    await k.affiliate(p1, X);
    await k.exclude(p1, X);

    await expectCode(
      k.leaveAsPlace(S, { placeId: p1, regionId: X }),
      BusinessRuleError,
      "APPLICATION_NOT_AFFILIATED",
    );
  });

  it("submitAffiliationChange#14 p1 の別の店舗管理者 T が店舗管理者として行った、p1 の X への所属の申請が確認中 / S が、店舗管理者として、p1 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S } = await stewardedPlace(k);
    const T = await k.manager(p1, "T");
    const X = await k.addRegion();
    await k.affiliateAsPlace(T, { placeId: p1, regionId: X });

    await expectCode(
      k.affiliateAsPlace(S, { placeId: p1, regionId: X }),
      BusinessRuleError,
      "APPLICATION_ALREADY_ACTIVE",
    );
  });

  it("submitAffiliationChange#15 S は p1 の店舗管理者。地域 X は、運営による非公開になっている / S が p1 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const { p1, S } = await stewardedPlace(k);
    const X = await k.addRegion({ suspended: true });

    await expectCode(
      k.affiliateAsPlace(S, { placeId: p1, regionId: X }),
      BusinessRuleError,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
  });

  it("submitAffiliationChange#16 店舗 p2 に店舗管理者がいない。p2 はサービス運営者が非公開にしている / A が、個人として、p2 の X への所属を申請する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const p2 = await k.place();
    await k.suspendPlace(p2);
    const X = await k.addRegion();

    await expectCode(
      k.affiliateAsIndividual(A, { placeId: p2, regionId: X }),
      BusinessRuleError,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
  });

  it("submitAffiliationChange#17 店舗 p2 に店舗管理者がいない。p2 は、公開を取り下げた地域 Z に所属中 / A が、個人として、p2 の Z からの離脱を申請する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const p2 = await k.place();
    const Z = await k.addRegion({ state: "unpublished" });
    await k.affiliate(p2, Z);

    await expectCode(
      k.leaveAsIndividual(A, { placeId: p2, regionId: Z }),
      BusinessRuleError,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
  });

  it("returns the stored application for a resend of the same target, and refuses the id for another target", async () => {
    const k = await stewardSeatKit();
    const { p1, S } = await stewardedPlace(k);
    const T = await k.manager(p1, "T");
    const [X, Y] = [await k.addRegion(), await k.addRegion()];
    const id = k.newApplicationId();
    const b1 = await k.affiliateAsPlace(S, { placeId: p1, regionId: X, id });
    await k.affiliate(p1, X);
    const mark = await k.mark();

    // Another steward resends it after the premise broke: the same application.
    expect(
      await k.affiliateAsPlace(T, { placeId: p1, regionId: X, id }),
    ).toEqual(b1);
    expect(await k.eventsSince(mark)).toEqual([]);
    await expectCode(
      k.affiliateAsPlace(S, { placeId: p1, regionId: Y, id }),
      ConflictError,
    );
    await expectCode(
      k.leaveAsPlace(S, { placeId: p1, regionId: X, id }),
      ConflictError,
    );
  });
});
