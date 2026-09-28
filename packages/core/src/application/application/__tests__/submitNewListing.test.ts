import { PlaceId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { period } from "../../listing/__tests__/kit";
import { prepareReapplication } from "../prepareReapplication";
import { applicationKit } from "./kit";

const framing = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };

describe("submitNewListing", () => {
  it("submitNewListing#1 店舗 p1 は公開されていて、店舗管理者がいない。カテゴリー c1 は現役。利用者 A が登録した、持ち主のない写真 ph1、ph2 がある / A が、写真 ph1・ph2（見せる範囲を含む）、名称、カテゴリー c1、説明、提供期間を入力して、p1 の掲載を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const c1 = await k.category("食べる");
    const [ph1, ph2] = await k.photos(A, 2);
    if (ph1 === undefined || ph2 === undefined) throw new Error("no photos");
    const mark = await k.mark();
    const app = await k.newListing(A, p1, {
      photos: [{ photoId: ph1, framing }, ph2],
      name: "季節のパフェ",
      categoryId: c1,
      description: "果物をたっぷり",
      offering: period("2026-07-01", "2026-08-31"),
    });
    expect(await k.app(app.id)).toEqual(app);
    expect(app.status.kind).toBe("underReview");
    expect(app.content.name).toBe("季節のパフェ");
    expect(app.content.categoryId).toBe(c1);
    expect(app.content.description).toBe("果物をたっぷり");
    expect(app.content.offering).toEqual({
      kind: "period",
      period: { start: "2026-07-01", end: "2026-08-31" },
    });
    expect(app.content.photos.items).toEqual([
      { photoId: ph1, framing },
      { photoId: ph2, framing: null },
    ]);
    expect(await k.findListing(app.reservedListingId)).toBeNull();
    expect(await k.photoOwner(ph1)).toEqual(k.applicationOwner(app.id));
    expect(await k.photoOwner(ph2)).toEqual(k.applicationOwner(app.id));
    expect(await k.eventsSince(mark)).toEqual([
      expect.objectContaining({
        type: "application.submitted",
        payload: { applicationId: app.id, approver: { kind: "operator" } },
      }),
    ]);
  });

  it("submitNewListing#2 A の p1 への掲載の申請が確認中 / A が、別の ID で p1 の別の掲載を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const first = await k.newListing(A, p1, { name: "掲載1" });
    const second = await k.newListing(A, p1, { name: "掲載2" });
    expect(second.status.kind).toBe("underReview");
    expect(await k.app(first.id)).toEqual(first);
  });

  it("submitNewListing#3 A の p1 への掲載の申請 a0（写真 ph1）が取り下げになっている。A は a0 から再申請を始め（prepareReapplication）、ph1 の複製 ph5 を得た / A が、返った内容を直し、ph5 を添えて、別の ID で申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const ph1 = await k.photo(A);
    const a0 = await k.newListing(A, p1, { photos: [ph1] });
    const withdrawn = await k.withdrawRaw(a0.id);
    const prepared = await prepareReapplication({
      container: k.container,
      actor: A.actor,
      input: { applicationId: a0.id },
    });
    if (prepared.content.kind !== "listing") throw new Error("kind");
    const [ph5] = PhotoSet.photoIds(prepared.content.content.photos);
    if (ph5 === undefined) throw new Error("no duplicate");
    const next = await k.newListing(A, p1, {
      photos: [ph5],
      name: "直した掲載",
    });
    expect(next.status.kind).toBe("underReview");
    expect(await k.photoOwner(ph5)).toEqual(k.applicationOwner(next.id));
    expect(await k.app(a0.id)).toEqual(withdrawn);
    expect(await k.photoOwner(ph1)).toEqual(k.applicationOwner(a0.id));
  });

  it("submitNewListing#4 A の p1 への掲載の申請 a0（写真 ph1）が取り下げになっている / A が、a0 の写真 ph1 をそのまま添えて、別の ID で申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const ph1 = await k.photo(A);
    const a0 = await k.newListing(A, p1, { photos: [ph1] });
    await k.withdrawRaw(a0.id);
    const id = k.newApplicationId();
    await expectCode(
      k.newListing(A, p1, { photos: [ph1] }, id),
      Error,
      "MEDIA_PHOTO_ALREADY_OWNED",
    );
    expect(await k.findApp(k.asApplicationId(id))).toBeNull();
  });

  it("submitNewListing#5 店舗 p1 に店舗管理者がいる / A が p1 の掲載を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.manager(p1);
    const ph1 = await k.photo(A);
    const id = k.newApplicationId();
    await expectCode(
      k.newListing(A, p1, { photos: [ph1] }, id),
      Error,
      "APPLICATION_PLACE_HAS_STEWARD",
    );
    expect(await k.findApp(k.asApplicationId(id))).toBeNull();
    expect(await k.photoOwner(ph1)).toBeNull();
  });

  it("submitNewListing#6 店舗 p1 はサービス運営者が非公開にしている / A が p1 の掲載を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.suspendPlace(p1);
    await expectCode(
      k.newListing(A, p1),
      Error,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
  });

  it("submitNewListing#7 ID が p9 の店舗はない / A が p9 の掲載を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    await expectCode(
      k.newListing(A, PlaceId.create(k.newId())),
      Error,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
  });

  it("submitNewListing#8 店舗 p1 に店舗管理者がいない / A が、写真を添えずに申請する。名称を空にして申請する。カテゴリーを選ばずに申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    for (const spec of [
      { photos: [] },
      { name: "" },
      { categoryId: null },
    ] as const) {
      await expectCode(
        k.newListing(A, p1, spec),
        Error,
        "LISTING_PUBLISH_CONDITION_UNMET",
      );
    }
  });

  it("submitNewListing#9 カテゴリー c2 は廃止済み / A が、カテゴリーを c2 にして申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const c2 = await k.addCategory("季節もの");
    await k.retireCategory(c2, await k.category("食べる"));
    await expectCode(
      k.newListing(A, p1, { categoryId: c2 }),
      Error,
      "LISTING_CATEGORY_NOT_AVAILABLE",
    );
  });

  it("submitNewListing#10 写真 ph3 は別の利用者が登録した、持ち主のない写真 / A が、ph3 を添えて申請する", async () => {
    const k = await applicationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const p1 = await k.place();
    const ph3 = await k.photo(B);
    const id = k.newApplicationId();
    await expectCode(
      k.newListing(A, p1, { photos: [ph3] }, id),
      Error,
      "MEDIA_PHOTO_NOT_REGISTRANT",
    );
    expect(await k.findApp(k.asApplicationId(id))).toBeNull();
  });

  it("submitNewListing#11 A の掲載の申請 a1 が確認中で保存されている / A が、同じ ID a1 と同じ内容で、もう一度申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const ph1 = await k.photo(A);
    const id = k.newApplicationId();
    const a1 = await k.newListing(A, p1, { photos: [ph1] }, id);
    const mark = await k.mark();
    const again = await k.newListing(A, p1, { photos: [ph1] }, id);
    expect(again).toEqual(a1);
    expect(again.reservedListingId).toBe(a1.reservedListingId);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("submitNewListing#12 A の掲載の申請 a1（カテゴリー c1）が確認中で保存されている。その後、c1 が廃止された / A が、同じ ID a1 と、最初と同じ内容で、もう一度申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const c1 = await k.addCategory("季節もの");
    const ph1 = await k.photo(A);
    const id = k.newApplicationId();
    const spec = { photos: [ph1], categoryId: c1 };
    const a1 = await k.newListing(A, p1, spec, id);
    await k.retireCategory(c1, await k.category("食べる"));
    expect(await k.newListing(A, p1, spec, id)).toEqual(a1);
  });

  it("a resend with other content under the same id is a conflict", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const ph1 = await k.photo(A);
    const id = k.newApplicationId();
    await k.newListing(A, p1, { photos: [ph1] }, id);
    await expectCode(
      k.newListing(A, p1, { photos: [ph1], name: "別の掲載" }, id),
      Error,
      "APPLICATION_ID_CONFLICT",
    );
  });

  describe("the order of checks with an input whose values fail to build", () => {
    const invalid = { name: "二行の\n名前" };

    it("answers an existing application of the same id with ConflictError", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      const p1 = await k.place();
      const ph1 = await k.photo(A);
      const id = k.newApplicationId();
      await k.newListing(A, p1, { photos: [ph1] }, id);
      await expectCode(
        k.newListing(A, p1, { photos: [ph1], ...invalid }, id),
        Error,
        "APPLICATION_ID_CONFLICT",
      );
    });

    it("answers a broken premise with the premise's code", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      const p1 = await k.place();
      await k.manager(p1);
      await expectCode(
        k.newListing(A, p1, invalid),
        Error,
        "APPLICATION_PLACE_HAS_STEWARD",
      );
    });

    it("answers an unviewable target with APPLICATION_TARGET_NOT_VIEWABLE", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      const p1 = await k.place();
      await k.suspendPlace(p1);
      await expectCode(
        k.newListing(A, p1, invalid),
        Error,
        "APPLICATION_TARGET_NOT_VIEWABLE",
      );
    });

    it("builds the values after the admission: the value's own code", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      await expectCode(
        k.newListing(A, await k.place(), invalid),
        Error,
        "LISTING_INVALID_NAME",
      );
    });
  });
});
