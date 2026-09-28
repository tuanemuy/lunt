import {
  ApplicationCase,
  type ApplicationOf,
} from "@repo/core/domain/application/application";
import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import { PlaceId } from "@repo/core/domain/common/ids";
import { Place } from "@repo/core/domain/place/place";
import { PlaceProfile } from "@repo/core/domain/place/profile";
import { describe, expect, it } from "vitest";
import { expectCode } from "../../authority/__tests__/kit";
import { ConflictError } from "../../errors";
import { submitPlaceRevision } from "../submitPlaceRevision";
import { applicationKit, profileFields, Towns } from "./kit";

const fields = (app: ApplicationOf<"revision">) =>
  FieldPatch.fields(app.content);

describe("submitPlaceRevision", () => {
  it("submitPlaceRevision#1 店舗 p1 は公開されていて、店舗管理者がいない。利用者 A がログインしている / A が、p1 の名称と営業時間だけを変えた内容で、情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place("喫茶ルント");
    const before = await k.getPlace(p1);
    const mark = await k.mark();
    const app = await k.revise(A, p1, {
      profile: { name: "喫茶ルント本店", businessHours: "9:00-17:00" },
    });
    expect(await k.app(app.id)).toEqual(app);
    expect(app.status.kind).toBe("underReview");
    expect(fields(app)).toEqual(["name", "businessHours"]);
    expect(FieldPatch.valueOf(app.content, "name")).toBe("喫茶ルント本店");
    expect(FieldPatch.valueOf(app.content, "businessHours")).toBe("9:00-17:00");
    expect(await k.eventsSince(mark)).toEqual([
      expect.objectContaining({
        type: "application.submitted",
        payload: { applicationId: app.id, approver: { kind: "operator" } },
      }),
    ]);
    expect(await k.getPlace(p1)).toEqual(before);
  });

  it("submitPlaceRevision#2 店舗 p1（営業中）に店舗管理者がいない / A が、営業状況を「閉店」にするだけの情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place("喫茶ルント");
    const current = (await k.getPlace(p1)).entity;
    const app = await k.revise(A, p1, {
      profile: { name: current.profile.name },
      operatingStatus: "permanentlyClosed",
    });
    expect(app.status.kind).toBe("underReview");
    expect(app.content).toEqual([
      { field: "operatingStatus", value: "permanentlyClosed" },
    ]);
  });

  it("submitPlaceRevision#3 店舗 p1（誤って閉店になっている）に店舗管理者がいない / A が、営業状況を「営業中」にする情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place("喫茶ルント");
    await k.changePlace(
      p1,
      (place, now) =>
        Place.changeOperatingStatus(place, "permanentlyClosed", now).entity,
    );
    const app = await k.revise(A, p1, {
      profile: { name: "喫茶ルント" },
      operatingStatus: "open",
    });
    expect(app.status.kind).toBe("underReview");
    expect(app.content).toEqual([{ field: "operatingStatus", value: "open" }]);
  });

  it("submitPlaceRevision#4 店舗 p1 の写真は ph1。A が登録した、持ち主のない写真 ph2 がある / A が、写真の並びを ph1、ph2 にして情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const {
      placeId: p1,
      photoIds: [ph1],
    } = await k.placeWithPhotos("喫茶ルント", 1);
    if (ph1 === undefined) throw new Error("no photo");
    const ph2 = await k.photo(A);
    const app = await k.revise(A, p1, {
      profile: { name: "喫茶ルント", photoIds: [ph1, ph2] },
    });
    expect(ApplicationCase.ownedPhotoIds(app)).toEqual([ph2]);
    expect(FieldPatch.valueOf(app.content, "photos")).toEqual([
      { photoId: ph1, origin: "current" },
      { photoId: ph2, origin: "added" },
    ]);
    expect(await k.photoOwner(ph2)).toEqual(k.applicationOwner(app.id));
    expect(await k.photoOwner(ph1)).toEqual({ kind: "place", id: p1 });
  });

  it("submitPlaceRevision#5 店舗 p1 に店舗管理者がいない。利用者 B の p1 への情報修正の申請が確認中 / A が p1 の情報修正を申請する", async () => {
    const k = await applicationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const p1 = await k.place();
    const byB = await k.revise(B, p1);
    const byA = await k.revise(A, p1);
    expect(byA.status.kind).toBe("underReview");
    expect(await k.app(byB.id)).toEqual(byB);
  });

  it("submitPlaceRevision#6 A の p1 への情報修正の申請が否認になっている / A が、別の ID で p1 の情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const first = await k.revise(A, p1);
    const rejected = await k.reject(first.id);
    const next = await k.revise(A, p1);
    expect(next.status.kind).toBe("underReview");
    expect(await k.app(first.id)).toEqual(rejected);
  });

  it("submitPlaceRevision#7 店舗 p1 に店舗管理者がいる / A が p1 の情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.manager(p1);
    const input = await k.revisionInput(p1);
    await expectCode(
      k.submitRevision(A, input),
      Error,
      "APPLICATION_PLACE_HAS_STEWARD",
    );
    expect(await k.findApp(k.asApplicationId(input.applicationId))).toBeNull();
  });

  it("submitPlaceRevision#8 A の p1 への情報修正の申請が確認中 / A が、別の ID で p1 の情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.revise(A, p1);
    const input = await k.revisionInput(p1, { profile: { name: "別の名前" } });
    await expectCode(
      k.submitRevision(A, input),
      Error,
      "APPLICATION_ALREADY_ACTIVE",
    );
    expect(await k.findApp(k.asApplicationId(input.applicationId))).toBeNull();
  });

  it("submitPlaceRevision#9 A の p1 への情報修正の申請が差し戻し / A が、別の ID で p1 の情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const first = await k.revise(A, p1);
    await k.sendBack(first.id);
    await expectCode(
      k.revise(A, p1, { profile: { name: "別の名前" } }),
      Error,
      "APPLICATION_ALREADY_ACTIVE",
    );
  });

  it("submitPlaceRevision#10 店舗 p1 はサービス運営者が非公開にしている。店舗管理者はいない / A が p1 の情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.suspendPlace(p1);
    const input = await k.revisionInput(p1);
    await expectCode(
      k.submitRevision(A, input),
      Error,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
    expect(await k.findApp(k.asApplicationId(input.applicationId))).toBeNull();
  });

  it("submitPlaceRevision#11 店舗 p1 に店舗管理者がいない / A が、現在の内容から何も変えずに申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place("喫茶ルント");
    await expectCode(
      k.revise(A, p1, { profile: { name: "喫茶ルント" } }),
      Error,
      "COMMON_INVALID_FIELD_PATCH",
    );
  });

  it("submitPlaceRevision#12 店舗 p1 に店舗管理者がいない / A が、名称を空白だけにして申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await expectCode(
      k.revise(A, p1, { profile: { name: "   " } }),
      Error,
      "PLACE_INVALID_NAME",
    );
  });

  it("submitPlaceRevision#13 A の情報修正の申請 a1 が確認中で保存されている / A が、同じ ID a1 と同じ内容で、もう一度申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const input = await k.revisionInput(p1);
    const a1 = await k.submitRevision(A, input);
    const mark = await k.mark();
    expect(await k.submitRevision(A, input)).toEqual(a1);
    expect((await k.stored(a1.id)).entity.version).toBe(a1.version);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("submitPlaceRevision#14 A の情報修正の申請 a1（名称と営業時間の項目）が確認中で保存されている。その後、別の申請の承認で p1 の紹介が変わった / A が、同じ ID a1 と、最初と同じ入力で、もう一度申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place("喫茶ルント");
    const input = await k.revisionInput(p1, {
      profile: { name: "喫茶ルント本店", businessHours: "9:00-17:00" },
    });
    const a1 = await k.submitRevision(A, input);
    await k.changePlace(
      p1,
      (place, now) =>
        Place.updateProfile(
          place,
          PlaceProfile.create({
            name: place.profile.name,
            photoIds: [],
            description: "紹介を書き換えた",
            address: place.profile.address,
            location: place.profile.location,
            businessHours: null,
            contact: null,
          }),
          now,
        ).entity,
    );
    const mark = await k.mark();
    const again = await k.submitRevision(A, input);
    expect(again).toEqual(a1);
    expect(fields(again)).toEqual(["name", "businessHours"]);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("submitPlaceRevision#15 A の情報修正の申請 a1 は、再送の前に承認されている / A が、同じ ID a1 と、最初と同じ入力で、もう一度申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const input = await k.revisionInput(p1);
    const a1 = await k.submitRevision(A, input);
    const approved = await k.approveStatus(a1.id);
    const mark = await k.mark();
    const again = await k.submitRevision(A, input);
    expect(again).toEqual(approved);
    expect(again.status.kind).toBe("approved");
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("submitPlaceRevision#16 A の情報修正の申請 a1（名称の項目）が確認中で保存されている / A が、同じ ID a1 で、名称の違う入力を送る", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const input = await k.revisionInput(p1, { profile: { name: "名前A" } });
    const a1 = await k.submitRevision(A, input);
    await expectCode(
      k.submitRevision(A, {
        ...input,
        profile: { ...input.profile, name: "名前B" },
      }),
      ConflictError,
    );
    expect(await k.app(a1.id)).toEqual(a1);
  });

  it("submitPlaceRevision#17 A の情報修正の申請 a1（名称の項目）が確認中で保存されている / A が、同じ ID a1 で、名称は同じまま営業時間も変えた入力を送る", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const input = await k.revisionInput(p1, { profile: { name: "名前A" } });
    const a1 = await k.submitRevision(A, input);
    await expectCode(
      k.submitRevision(A, {
        ...input,
        profile: { ...input.profile, businessHours: "10:00-18:00" },
      }),
      ConflictError,
    );
    expect(fields((await k.app(a1.id)) as ApplicationOf<"revision">)).toEqual([
      "name",
    ]);
  });

  it("submitPlaceRevision#18 店舗 p1 に店舗管理者がいない / A が、マスターにない町域を指定して情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const input = await k.revisionInput(p1, {
      profile: { town: Towns.missing },
    });
    await expectCode(k.submitRevision(A, input), Error, "AREA_TOWN_NOT_FOUND");
    expect(await k.findApp(k.asApplicationId(input.applicationId))).toBeNull();
  });

  it("submitPlaceRevision#19 ID が p9 の店舗はない / A が p9 の情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p9 = PlaceId.create(k.newId());
    const applicationId = k.newApplicationId();
    await expectCode(
      submitPlaceRevision({
        container: k.container,
        actor: A.actor,
        input: {
          applicationId,
          placeId: p9,
          profile: profileFields(),
          operatingStatus: "open",
        },
      }),
      Error,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
    expect(await k.findApp(k.asApplicationId(applicationId))).toBeNull();
  });

  it("submitPlaceRevision#20 店舗 p1 に店舗管理者がいて、p1 はサービス運営者が非公開にしている / A が p1 の情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.manager(p1);
    await k.suspendPlace(p1);
    await expectCode(k.revise(A, p1), Error, "APPLICATION_PLACE_HAS_STEWARD");
  });

  it("submitPlaceRevision#21 A の p1 への情報修正の申請が確認中。その後、p1 はサービス運営者によって非公開になった / A が、別の ID で p1 の情報修正を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.revise(A, p1);
    await k.suspendPlace(p1);
    await expectCode(
      k.revise(A, p1, { profile: { name: "別の名前" } }),
      Error,
      "APPLICATION_TARGET_NOT_VIEWABLE",
    );
  });

  describe("the order of checks with an input whose values fail to build", () => {
    it("answers an existing application of the same id with ConflictError", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      const p1 = await k.place();
      const input = await k.revisionInput(p1);
      await k.submitRevision(A, input);
      for (const profile of [
        { ...input.profile, name: "  " },
        { ...input.profile, town: Towns.missing },
      ]) {
        await expectCode(
          k.submitRevision(A, { ...input, profile }),
          ConflictError,
        );
      }
    });

    it("answers a broken premise with the premise's code", async () => {
      const k = await applicationKit();
      const A = await k.person("a");
      const p1 = await k.place();
      await k.manager(p1);
      await expectCode(
        k.revise(A, p1, { profile: { name: "  " } }),
        Error,
        "APPLICATION_PLACE_HAS_STEWARD",
      );
      await expectCode(
        k.revise(A, p1, { profile: { town: Towns.missing } }),
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
        k.revise(A, p1, { operatingStatus: "unknown" }),
        Error,
        "APPLICATION_TARGET_NOT_VIEWABLE",
      );
    });
  });
});
