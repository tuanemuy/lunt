import {
  ApplicationCase,
  type ApplicationOf,
} from "@repo/core/domain/application/application";
import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import { Listing } from "@repo/core/domain/listing/listing";
import { ListingDescription } from "@repo/core/domain/listing/values";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError } from "../../errors";
import { period } from "../../listing/__tests__/kit";
import { applicationKit } from "./kit";

const fields = (app: ApplicationOf<"listingRevision">) =>
  FieldPatch.fields(app.content);

describe("submitListingRevision", () => {
  it("submitListingRevision#1 店舗 p1 に店舗管理者がいない。p1 の掲載 l1 は公開中。利用者 A がログインしている / A が、l1 の名称と提供の設定だけを変えた内容で、修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1, { name: "モーニング" });
    const before = await k.findListing(l1);
    const mark = await k.mark();
    const app = await k.reviseListing(A, l1, {
      name: "モーニングセット",
      offering: period("2026-08-01", null),
    });
    expect(await k.app(app.id)).toEqual(app);
    expect(app.status.kind).toBe("underReview");
    expect(fields(app)).toEqual(["name", "offering"]);
    expect(app.placeId).toBe(p1);
    expect(await k.eventsSince(mark)).toEqual([
      expect.objectContaining({
        type: "application.submitted",
        payload: { applicationId: app.id, approver: { kind: "operator" } },
      }),
    ]);
    expect(await k.findListing(l1)).toEqual(before);
  });

  it("submitListingRevision#2 l1 の写真は ph1、ph2。A が登録した、持ち主のない写真 ph3 がある / A が、写真を ph3、ph1 の順にして（ph2 を外し、ph3 を加える）修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const [ph1, ph2] = await k.photos(await k.setupOperator(), 2);
    if (ph1 === undefined || ph2 === undefined) throw new Error("no photos");
    const l1 = await k.listing(p1, { photos: [ph1, ph2] });
    const ph3 = await k.photo(A);
    const app = await k.reviseListing(A, l1, { photos: [ph3, ph1] });
    expect(FieldPatch.valueOf(app.content, "photos")).toEqual([
      { photoId: ph3, framing: null, origin: "added" },
      { photoId: ph1, framing: null, origin: "current" },
    ]);
    expect(ApplicationCase.ownedPhotoIds(app)).toEqual([ph3]);
    expect(await k.photoOwner(ph3)).toEqual(k.applicationOwner(app.id));
    expect(await k.photoOwner(ph1)).toEqual({ kind: "listing", id: l1 });
    expect(await k.photoOwner(ph2)).toEqual({ kind: "listing", id: l1 });
  });

  it("submitListingRevision#3 利用者 B の l1 への修正の申請が確認中 / A が l1 の修正を申請する", async () => {
    const k = await applicationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    const byB = await k.reviseListing(B, l1);
    const byA = await k.reviseListing(A, l1);
    expect(byA.status.kind).toBe("underReview");
    expect(await k.app(byB.id)).toEqual(byB);
  });

  it("submitListingRevision#4 店舗 p1 に店舗管理者がいる / A が l1 の修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    await k.manager(p1);
    await expectCode(
      k.reviseListing(A, l1),
      Error,
      "APPLICATION_PLACE_HAS_STEWARD",
    );
  });

  it("submitListingRevision#5 A の l1 への修正の申請が確認中 / A が、別の ID で l1 の修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    await k.reviseListing(A, l1);
    await expectCode(
      k.reviseListing(A, l1, { name: "別の名前" }),
      Error,
      "APPLICATION_ALREADY_ACTIVE",
    );
  });

  it("submitListingRevision#6 l1 は入力の間に削除された / A が l1 の修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    const input = await k.listingRevisionInput(l1);
    await k.remove(await k.setupOperator(), l1);
    await expectCode(
      k.submitListingRev(A, input),
      Error,
      "APPLICATION_LISTING_NOT_FOUND",
    );
    expect(await k.findApp(k.asApplicationId(input.applicationId))).toBeNull();
  });

  it("submitListingRevision#7 l1 は入力の間に一時非公開になった。または運営による非公開になった / A が l1 の修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const op = await k.setupOperator();
    const p1 = await k.place();
    const unpublished = await k.listing(p1);
    const suspended = await k.listing(p1);
    const inputs = [
      await k.listingRevisionInput(unpublished),
      await k.listingRevisionInput(suspended),
    ];
    await k.unpublish(op, unpublished);
    await k.suspend(op, suspended);
    for (const input of inputs) {
      await expectCode(
        k.submitListingRev(A, input),
        Error,
        "APPLICATION_TARGET_NOT_VIEWABLE",
      );
    }
  });

  it("submitListingRevision#8 l1 は公開中。店舗 p1 はサービス運営者が非公開にしている / A が l1 の修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    await k.suspendPlace(p1);
    await expectCode(
      k.reviseListing(A, l1),
      Error,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
  });

  it("submitListingRevision#9 l1 は公開中で、店舗管理者がいない / A が、現在の内容から何も変えずに申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    await expectCode(
      k.reviseListing(A, l1, {}),
      Error,
      "COMMON_INVALID_FIELD_PATCH",
    );
  });

  it("submitListingRevision#10 l1 は公開中で、店舗管理者がいない / A が、写真をすべて外して申請する。名称を空にして申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    for (const spec of [{ photos: [] }, { name: "" }] as const) {
      await expectCode(
        k.reviseListing(A, l1, spec),
        Error,
        "LISTING_PUBLISH_CONDITION_UNMET",
      );
    }
  });

  it("submitListingRevision#11 l1 は公開中で、店舗管理者がいない。カテゴリー c2 は廃止済み / A が、l1 のカテゴリーを c2 に変えて申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    const c2 = await k.addCategory("季節もの");
    await k.retireCategory(c2, await k.category("買う"));
    const input = await k.listingRevisionInput(l1, { categoryId: c2 });
    await expectCode(
      k.submitListingRev(A, input),
      Error,
      "LISTING_CATEGORY_NOT_AVAILABLE",
    );
    expect(await k.findApp(k.asApplicationId(input.applicationId))).toBeNull();
  });

  it("submitListingRevision#12 A の l1 への修正の申請 a1（名称の項目）が確認中で保存されている。その後、別の修正の申請の承認で l1 の説明が変わった / A が、同じ ID a1 と、最初と同じ修正後の内容で、もう一度申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    const input = await k.listingRevisionInput(l1, { name: "直した掲載" });
    const a1 = await k.submitListingRev(A, input);
    const catalog = (await k.catalog()).entity;
    await k.change(
      l1,
      (listing, now) =>
        Listing.applyPatch(
          listing,
          [
            {
              field: "description",
              value: ListingDescription.create("承認で変わった説明"),
            },
          ],
          catalog,
          now,
        ).entity,
    );
    const mark = await k.mark();
    const again = await k.submitListingRev(A, input);
    expect(again).toEqual(a1);
    expect(fields(again)).toEqual(["name"]);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("submitListingRevision#13 A の l1 への修正の申請 a1（名称の項目）が確認中で保存されている / A が、同じ ID a1 で、名称の違う修正後の内容を送る", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    const input = await k.listingRevisionInput(l1, { name: "名前A" });
    const a1 = await k.submitListingRev(A, input);
    await expectCode(
      k.submitListingRev(A, {
        ...input,
        content: { ...input.content, name: "名前B" },
      }),
      ConflictError,
    );
    expect(await k.app(a1.id)).toEqual(a1);
  });

  it("submitListingRevision#14 A の l1 への修正の申請 a1（名称の項目）が確認中で保存されている / A が、同じ ID a1 で、名称は同じまま説明も変えた修正後の内容を送る", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    const input = await k.listingRevisionInput(l1, { name: "名前A" });
    const a1 = await k.submitListingRev(A, input);
    await expectCode(
      k.submitListingRev(A, {
        ...input,
        content: { ...input.content, description: "説明も変えた" },
      }),
      ConflictError,
    );
    expect(
      fields((await k.app(a1.id)) as ApplicationOf<"listingRevision">),
    ).toEqual(["name"]);
  });

  describe("the order of checks with an input whose values fail to build", () => {
    const invalid = { name: "二行の\n名前" };

    it("answers an existing application of the same id with ConflictError", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      const l1 = await k.listing(await k.place());
      const input = await k.listingRevisionInput(l1);
      await k.submitListingRev(A, input);
      await expectCode(
        k.submitListingRev(A, {
          ...input,
          content: { ...input.content, ...invalid },
        }),
        ConflictError,
      );
    });

    it("answers a broken premise with the premise's code", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      const p1 = await k.place();
      const l1 = await k.listing(p1);
      await k.manager(p1);
      await expectCode(
        k.reviseListing(A, l1, invalid),
        Error,
        "APPLICATION_PLACE_HAS_STEWARD",
      );
    });

    it("answers an unviewable target with APPLICATION_TARGET_NOT_VIEWABLE", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      const p1 = await k.place();
      const l1 = await k.listing(p1);
      await k.suspendPlace(p1);
      await expectCode(
        k.reviseListing(A, l1, invalid),
        Error,
        "APPLICATION_TARGET_NOT_VIEWABLE",
      );
    });
  });
});
