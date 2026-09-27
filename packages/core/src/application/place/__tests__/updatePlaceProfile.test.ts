import type { PhotoId } from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError } from "@repo/core/domain/error";
import type { Place } from "@repo/core/domain/place/place";
import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  type Person,
} from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import type { PlaceProfileFields } from "../profileInput";
import { updatePlaceProfile } from "../updatePlaceProfile";
import { type PlaceKit, placeKit, profileFields, Towns } from "./kit";

const update = (
  k: PlaceKit,
  who: Person,
  place: Place,
  profile: Partial<PlaceProfileFields>,
  options: Readonly<{ version?: number; container?: RequestContainer }> = {},
) =>
  updatePlaceProfile({
    container: options.container ?? k.container,
    actor: who.actor,
    input: {
      placeId: place.id,
      version: Version.create(options.version ?? place.version),
      profile: profileFields(profile),
    },
  });

const photoIdsOf = (place: Place): readonly PhotoId[] =>
  place.profile.photos.items.map((photo) => photo.photoId);

/** A place stewarded by a fresh person A. */
async function stewardedPlace(
  overrides: Partial<PlaceProfileFields> = {},
): Promise<Readonly<{ k: PlaceKit; A: Person; p1: Place }>> {
  const k = placeKit();
  const A = await k.person("steward");
  const p1 = await k.place(overrides);
  await k.appoint(k.placeRef(p1), A);
  return { k, A, p1 };
}

/** Everything unchanged after a refused update. */
async function expectUnchanged(k: PlaceKit, place: Place, mark: number) {
  expect(await k.getPlace(place.id)).toEqual(place);
  expect(await k.since(mark)).toEqual([]);
}

describe("updatePlaceProfile", () => {
  it("updatePlaceProfile#1 利用者 A は店舗 p1（東京都千代田区大手町、areaCode 1000004、版 0）の店舗管理者 / A が、版 0 を添えて、名称と紹介を変え、町域を「銀座」（1040061）に変えた内容で更新する", async () => {
    const { k, A, p1 } = await stewardedPlace();
    expect(p1.version).toBe(0);
    expect(p1.profile.address.areaCode).toBe("1000004");
    k.clock.advance(60_000);
    const now = k.clock.now();
    const mark = await k.mark();
    const updated = await update(k, A, p1, {
      name: "川辺食堂",
      description: "川沿いの食堂",
      town: Towns.ginza,
      addressRest: "2-2",
    });
    const stored = await k.getPlace(p1.id);
    expect(stored).toEqual(updated);
    expect(stored.profile.name).toBe("川辺食堂");
    expect(stored.profile.description).toBe("川沿いの食堂");
    expect(stored.profile.address).toEqual({
      areaCode: "1040061",
      prefecture: "東京都",
      municipality: "中央区",
      town: "銀座",
      rest: "2-2",
    });
    expect(stored).toMatchObject({
      version: 1,
      updatedAt: now,
      registeredAt: p1.registeredAt,
      operatingStatus: "open",
    });
    expect(await k.since(mark)).toEqual([]);
  });

  it("updatePlaceProfile#2 利用者 A は店舗 p1 の店舗管理者。p1 の写真は ph1、ph2 の順。A が登録した、持ち主のない写真 ph3 がある / A が、写真の並びを ph3、ph2 にして更新する", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    const [ph1, ph2] = [await k.photo(O), await k.photo(O)];
    const p1 = await k.place({ photoIds: [ph1, ph2] });
    const A = await k.person("steward");
    await k.appoint(k.placeRef(p1), A);
    const ph3 = await k.photo(A);
    const mark = await k.mark();
    await update(k, A, p1, { photoIds: [ph3, ph2] });
    expect(photoIdsOf(await k.getPlace(p1.id))).toEqual([ph3, ph2]);
    expect(await k.ownerOf(ph3)).toEqual({ kind: "place", id: p1.id });
    expect(await k.since(mark)).toMatchObject([
      {
        type: "photos.released",
        aggregateId: p1.id,
        payload: { photoIds: [ph1] },
      },
    ]);
  });

  it("updatePlaceProfile#3 利用者 A は店舗 p1 の店舗管理者 / A が、現在と同じ内容で更新する", async () => {
    const { k, A, p1 } = await stewardedPlace();
    k.clock.advance(60_000);
    const mark = await k.mark();
    expect(await update(k, A, p1, {})).toEqual(p1);
    await expectUnchanged(k, p1, mark);
  });

  it("updatePlaceProfile#4 店舗 p1 は代理登録された店舗で、利用者 B の管理権限の申請が承認され、B が p1 の店舗管理者になっている / B が p1 の店舗情報を更新する", async () => {
    // The approval itself is Application's (S2B); its result — B appointed
    // by approval over a place registered by proxy — is stored directly.
    const k = placeKit();
    const p1 = await k.place();
    const B = await k.person("claimant");
    await k.appoint(k.placeRef(p1), B);
    await update(k, B, p1, { description: "店主が書いた紹介" });
    expect((await k.getPlace(p1.id)).profile.description).toBe(
      "店主が書いた紹介",
    );
  });

  it("updatePlaceProfile#5 店舗 p1 に店舗管理者がいない。操作する人はサービス運営者 O / O が p1 の店舗情報を更新する", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    const p1 = await k.place();
    const updated = await update(k, O, p1, { name: "代行で直した店" });
    expect(await k.getPlace(p1.id)).toEqual(updated);
    expect(updated.profile.name).toBe("代行で直した店");
  });

  it("updatePlaceProfile#6 利用者 A はスポット p1（店舗に属さない景色の場所）の店舗管理者 / A が、紹介と位置を変えて更新する", async () => {
    const spot = {
      name: "白浜展望台",
      town: Towns.chiyoda,
      addressRest: "",
      location: { latitude: 33.68, longitude: 135.34 },
    };
    const { k, A, p1 } = await stewardedPlace(spot);
    await update(k, A, p1, {
      ...spot,
      description: "夕日が見える",
      location: { latitude: 33.69, longitude: 135.35 },
    });
    const stored = await k.getPlace(p1.id);
    expect(stored.profile.description).toBe("夕日が見える");
    expect(stored.profile.location).toEqual({
      latitude: 33.69,
      longitude: 135.35,
    });
  });

  it("updatePlaceProfile#7 利用者 A は店舗 p1 の店舗管理者。サービス運営者が p1 を非公開にしている / A が p1 の店舗情報を更新する", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const suspended = await k.suspend(p1.id);
    await update(k, A, suspended, { name: "非公開の間の名前" });
    const stored = await k.getPlace(p1.id);
    expect(stored.profile.name).toBe("非公開の間の名前");
    expect(stored.suspension).toEqual({ suspended: true });
  });

  it("updatePlaceProfile#8 店舗 p1 に店舗管理者 A がいる。操作する人は、p1 の店舗管理者でないサービス運営者 O / O が p1 の店舗情報を更新する", async () => {
    const { k, p1 } = await stewardedPlace();
    const O = await k.setupOperator();
    const mark = await k.mark();
    await expectCode(update(k, O, p1, { name: "代行" }), ForbiddenError);
    await expectUnchanged(k, p1, mark);
  });

  it("updatePlaceProfile#9 店舗 p1 に店舗管理者がいない間にサービス運営者 O が編集を始め、保存の前に利用者 B が p1 の店舗管理者に就いた / O が p1 の店舗情報を更新する", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    const p1 = await k.place();
    const B = await k.person("claimant");
    const mark = await k.mark();
    const racing = commitAfter(k.container, () => k.appoint(k.placeRef(p1), B));
    await expectCode(
      update(k, O, p1, { name: "代行" }, { container: racing }),
      ForbiddenError,
    );
    await expectUnchanged(k, p1, mark);
  });

  it("updatePlaceProfile#10 利用者 U は、店舗 p1 の店舗管理者でもサービス運営者でもない / U が p1 の店舗情報を更新する", async () => {
    const { k, p1 } = await stewardedPlace();
    const U = await k.person();
    const mark = await k.mark();
    await expectCode(update(k, U, p1, { name: "他人" }), ForbiddenError);
    await expectUnchanged(k, p1, mark);
  });

  it("updatePlaceProfile#11 利用者 A は店舗 p1 の店舗管理者だったが、編集の途中で権限を解除された / A が p1 の店舗情報を更新する", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const mark = await k.mark();
    const racing = commitAfter(k.container, () =>
      k.removeSteward(k.placeRef(p1), A),
    );
    await expectCode(
      update(k, A, p1, { name: "解除の後" }, { container: racing }),
      ForbiddenError,
    );
    await expectUnchanged(k, p1, mark);
  });

  it.todo(
    "updatePlaceProfile#12 店舗 p1 は地域 X に所属している。利用者 R は X の地域運営者で、店舗の管理権限を持たない / R が p1 の店舗情報を更新する",
  );
  it.todo(
    "updatePlaceProfile#13 店舗 p1 はイベント E に参加している。利用者 V は E のイベント運営者で、店舗の管理権限を持たない / V が p1 の店舗情報を更新する",
  );

  it("a steward of a region or an occasion cannot update a place (stage-2 stand-in for #12, #13)", async () => {
    const { k, p1 } = await stewardedPlace();
    const [R, V] = [await k.person("region"), await k.person("occasion")];
    await k.appoint(k.region("地域 X"), R);
    await k.appoint(k.occasion("イベント E"), V);
    const mark = await k.mark();
    await expectCode(update(k, R, p1, { name: "地域から" }), ForbiddenError);
    await expectCode(
      update(k, V, p1, { name: "イベントから" }),
      ForbiddenError,
    );
    await expectUnchanged(k, p1, mark);
  });

  it("updatePlaceProfile#14 利用者 A と B は店舗 p1（版 0）の店舗管理者。どちらも版 0 で編集を始め、B が先に更新して版が 1 になった / A が、版 0 を添えて更新する", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const B = await k.person("steward-b");
    await k.appoint(k.placeRef(p1), B);
    const byB = await update(k, B, p1, { name: "B の名前" });
    expect(byB.version).toBe(1);
    await expectCode(
      update(k, A, p1, { name: "A の名前" }, { version: 0 }),
      ConflictError,
    );
    expect(await k.getPlace(p1.id)).toEqual(byB);
  });

  it("updatePlaceProfile#15 利用者 A は店舗 p1 の店舗管理者 / A が、名称を空白だけにして更新する", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const mark = await k.mark();
    await expectCode(
      update(k, A, p1, { name: "  " }),
      BusinessRuleError,
      "PLACE_INVALID_NAME",
    );
    await expectUnchanged(k, p1, mark);
  });

  it("updatePlaceProfile#16 利用者 A は店舗 p1 の店舗管理者 / A が、マスターにない町域（TownRef を解決できない）を指定して更新する", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const mark = await k.mark();
    await expectCode(
      update(k, A, p1, { town: Towns.missing }),
      BusinessRuleError,
      "AREA_TOWN_NOT_FOUND",
    );
    await expectUnchanged(k, p1, mark);
  });

  it("updatePlaceProfile#17 利用者 A は店舗 p1 の店舗管理者。写真 ph4 は別の利用者が登録した、持ち主のない写真 / A が、名称を変え、ph4 を加えて更新する", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const ph4 = await k.photo(await k.person("other"));
    const mark = await k.mark();
    await expectCode(
      update(k, A, p1, { name: "川辺食堂", photoIds: [ph4] }),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_REGISTRANT",
    );
    await expectUnchanged(k, p1, mark);
    expect(await k.ownerOf(ph4)).toBeNull();
  });

  it("updatePlaceProfile#18 操作する人はサービス運営者 O。ID が p9 の店舗はない / O が p9 の店舗情報を更新する", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    await expectCode(
      updatePlaceProfile({
        container: k.container,
        actor: O.actor,
        input: {
          placeId: k.absentPlaceId(),
          version: Version.initial(),
          profile: profileFields(),
        },
      }),
      NotFoundError,
    );
  });

  it("updatePlaceProfile#19 利用者 A は店舗 p1 の店舗管理者。p1 の写真は ph1 / A が、写真を ph1・ph1 の順にして更新する", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    const ph1 = await k.photo(O);
    const p1 = await k.place({ photoIds: [ph1] });
    const A = await k.person("steward");
    await k.appoint(k.placeRef(p1), A);
    const mark = await k.mark();
    await expectCode(
      update(k, A, p1, { photoIds: [ph1, ph1] }),
      BusinessRuleError,
      "PLACE_DUPLICATE_PHOTO",
    );
    await expectUnchanged(k, p1, mark);
  });

  it("updatePlaceProfile#20 利用者 A は店舗 p1 の店舗管理者。ph8 は存在しない PhotoId / A が、ph8 を加えて更新する", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const mark = await k.mark();
    await expectCode(
      update(k, A, p1, { photoIds: [k.absentPhotoId()] }),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_AVAILABLE",
    );
    await expectUnchanged(k, p1, mark);
  });

  it("updatePlaceProfile#21 利用者 A は店舗 p1 の店舗管理者。A が登録した写真 ph5 は、すでに別の店舗が持ち主 / A が、ph5 を加えて更新する", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const p2 = await k.place({ name: "別の店" });
    await k.appoint(k.placeRef(p2), A);
    const ph5 = await k.photo(A);
    await update(k, A, p2, { name: "別の店", photoIds: [ph5] });
    const mark = await k.mark();
    await expectCode(
      update(k, A, p1, { photoIds: [ph5] }),
      BusinessRuleError,
      "MEDIA_PHOTO_ALREADY_OWNED",
    );
    await expectUnchanged(k, p1, mark);
    expect(await k.ownerOf(ph5)).toEqual({ kind: "place", id: p2.id });
  });

  it("a claim buffered before the place save conflicts leaves the photo unowned", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const ph3 = await k.photo(A);
    const racing = commitAfter(k.container, () =>
      update(k, A, p1, { name: "先に保存された名前" }),
    );
    await expectCode(
      update(k, A, p1, { photoIds: [ph3] }, { container: racing }),
      ConflictError,
    );
    expect(await k.ownerOf(ph3)).toBeNull();
    const stored = await k.getPlace(p1.id);
    expect(stored.profile.name).toBe("先に保存された名前");
    expect(photoIdsOf(stored)).toEqual([]);
  });

  it("a photo a previous save dropped cannot be added back before the release consumer deletes it", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const [ph1, ph2] = [await k.photo(A), await k.photo(A)];
    const withBoth = await update(k, A, p1, { photoIds: [ph1, ph2] });
    const dropped = await update(k, A, withBoth, { photoIds: [ph1] });
    const mark = await k.mark();
    await expectCode(
      update(k, A, dropped, { photoIds: [ph1, ph2] }),
      BusinessRuleError,
      "MEDIA_PHOTO_ALREADY_OWNED",
    );
    await expectUnchanged(k, dropped, mark);
  });
});
