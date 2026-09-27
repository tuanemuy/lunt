import { PlaceId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import type { GeneratedId } from "../../ports/idGenerator";
import { matchPlaces } from "../matchPlaces";
import type { PlaceProfileFields } from "../profileInput";
import { registerPlaceByProxy } from "../registerPlaceByProxy";
import { type PlaceKit, placeKit, profileFields, Towns } from "./kit";

async function operatorKit() {
  const k = placeKit();
  const O = await k.person("operator");
  await k.operators(O);
  return { k, O };
}

const register = (
  k: PlaceKit,
  who: Person,
  placeId: GeneratedId,
  profile: Partial<PlaceProfileFields> = {},
) =>
  registerPlaceByProxy({
    container: k.container,
    actor: who.actor,
    input: { placeId, profile: profileFields(profile) },
  });

describe("registerPlaceByProxy", () => {
  it("registerPlaceByProxy#1 操作する人はサービス運営者 O。ID が p1 の店舗はない / O が、ID p1、名称「山田珈琲店」、町域「大手町」（1000004）と続く住所「1-1」、位置を指定し、写真・紹介・営業時間・連絡先なしで代理登録する", async () => {
    const { k, O } = await operatorKit();
    const p1 = k.newPlaceId();
    const mark = await k.mark();
    const now = k.clock.now();
    const place = await register(k, O, p1);
    const stored = await k.getPlace(PlaceId.create(p1));
    expect(stored).toEqual(place);
    expect(stored).toMatchObject({
      id: p1,
      operatingStatus: "open",
      suspension: { suspended: false },
      version: 0,
      registeredAt: now,
      updatedAt: now,
    });
    expect(stored.profile.address).toEqual({
      areaCode: "1000004",
      prefecture: "東京都",
      municipality: "千代田区",
      town: "大手町",
      rest: "1-1",
    });
    expect(stored.profile.photos.items).toEqual([]);
    expect(stored.profile.description).toBeNull();
    expect(stored.profile.visitInfo).toEqual({
      businessHours: null,
      contact: null,
    });
    expect(await k.since(mark)).toEqual([]);
    expect(await k.findStewardship(k.placeRef(stored))).toBeNull();
    const found = await matchPlaces({
      container: k.container,
      input: {
        name: "山田珈琲店",
        address: null,
        pagination: { page: 1, limit: 10 },
      },
    });
    expect(found.items).toMatchObject([{ placeId: p1, cover: null }]);
  });

  it("registerPlaceByProxy#2 操作する人はサービス運営者 O。O が登録した、持ち主のない写真 ph1、ph2 がある / O が、写真を ph2、ph1 の順に添えて代理登録する", async () => {
    const { k, O } = await operatorKit();
    const [ph1, ph2] = [await k.photo(O), await k.photo(O)];
    const place = await register(k, O, k.newPlaceId(), {
      photoIds: [ph2, ph1],
    });
    expect(
      (await k.getPlace(place.id)).profile.photos.items.map((p) => p.photoId),
    ).toEqual([ph2, ph1]);
    expect(await k.ownerOf(ph1)).toEqual({ kind: "place", id: place.id });
    expect(await k.ownerOf(ph2)).toEqual({ kind: "place", id: place.id });
  });

  it("registerPlaceByProxy#3 操作する人はサービス運営者 O / O が、店舗に属さない景色の場所「白浜展望台」を、名称・所在地・位置を指定して代理登録する", async () => {
    const { k, O } = await operatorKit();
    const place = await register(k, O, k.newPlaceId(), {
      name: "白浜展望台",
      town: Towns.chiyoda,
      addressRest: "",
      location: { latitude: 33.68, longitude: 135.34 },
    });
    const stored = await k.getPlace(place.id);
    expect(stored).toMatchObject({
      operatingStatus: "open",
      suspension: { suspended: false },
    });
    expect(stored.profile.name).toBe("白浜展望台");
    expect(Object.keys(stored).sort()).toEqual(
      [
        "id",
        "operatingStatus",
        "profile",
        "registeredAt",
        "suspension",
        "updatedAt",
        "version",
      ].sort(),
    );
    expect(await k.findStewardship(k.placeRef(stored))).toBeNull();
  });

  it("registerPlaceByProxy#4 同じ名称「山田珈琲店」・同じ所在地の店舗 p1 がすでにある。操作する人はサービス運営者 O / O が、ID p2、同じ名称・同じ所在地で代理登録する", async () => {
    const { k, O } = await operatorKit();
    const p1 = await register(k, O, k.newPlaceId());
    const p2 = await register(k, O, k.newPlaceId());
    expect(p2.id).not.toBe(p1.id);
    expect(await k.getPlace(p2.id)).toEqual(p2);
    expect(await k.getPlace(p1.id)).toEqual(p1);
  });

  it("registerPlaceByProxy#5 サービス運営者 O が、ID p1 で代理登録を済ませている / O が、同じ ID p1・同じ内容（PlaceProfile.equals で等しい店舗情報）で代理登録を送り直す", async () => {
    const { k, O } = await operatorKit();
    const ph1 = await k.photo(O);
    const p1 = k.newPlaceId();
    const first = await register(k, O, p1, { photoIds: [ph1] });
    const photoBefore = await k.findPhoto(ph1);
    k.clock.advance(60_000);
    const mark = await k.mark();
    const again = await register(k, O, p1, {
      photoIds: [ph1],
      name: " 山田珈琲店 ",
    });
    expect(again).toEqual(first);
    expect(await k.getPlace(first.id)).toEqual(first);
    expect(await k.findPhoto(ph1)).toEqual(photoBefore);
    expect(await k.since(mark)).toEqual([]);
  });

  it("registerPlaceByProxy#6 サービス運営者 O が、ID p1 で代理登録を済ませている / O が、同じ ID p1 で、名称の違う内容で代理登録する", async () => {
    const { k, O } = await operatorKit();
    const p1 = k.newPlaceId();
    const first = await register(k, O, p1);
    await expectCode(register(k, O, p1, { name: "川辺食堂" }), ConflictError);
    expect(await k.getPlace(first.id)).toEqual(first);
  });

  it("registerPlaceByProxy#7 利用者 U は、サービス運営者の役割を持たない（店舗管理者である場合を含む） / U が代理登録する", async () => {
    const { k } = await operatorKit();
    const U = await k.person();
    const other = await k.place();
    await k.appoint(k.placeRef(other), U);
    const p1 = k.newPlaceId();
    await expectCode(register(k, U, p1), ForbiddenError);
    expect(await k.findPlace(PlaceId.create(p1))).toBeNull();
  });

  it("registerPlaceByProxy#8 操作する人はサービス運営者 O / O が、名称を空白だけにして代理登録する", async () => {
    const { k, O } = await operatorKit();
    const p1 = k.newPlaceId();
    await expectCode(
      register(k, O, p1, { name: " 　 " }),
      BusinessRuleError,
      "PLACE_INVALID_NAME",
    );
    expect(await k.findPlace(PlaceId.create(p1))).toBeNull();
  });

  it("registerPlaceByProxy#9 操作する人はサービス運営者 O / O が、マスターにない町域（TownRef を解決できない）を指定して代理登録する", async () => {
    const { k, O } = await operatorKit();
    const p1 = k.newPlaceId();
    await expectCode(
      register(k, O, p1, { town: Towns.missing }),
      BusinessRuleError,
      "AREA_TOWN_NOT_FOUND",
    );
    expect(await k.findPlace(PlaceId.create(p1))).toBeNull();
  });

  it("registerPlaceByProxy#10 操作する人はサービス運営者 O。写真 ph3 は別の利用者が登録した、持ち主のない写真 / O が、ph3 を添えて代理登録する", async () => {
    const { k, O } = await operatorKit();
    const ph3 = await k.photo(await k.person());
    const p1 = k.newPlaceId();
    await expectCode(
      register(k, O, p1, { photoIds: [ph3] }),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_REGISTRANT",
    );
    expect(await k.findPlace(PlaceId.create(p1))).toBeNull();
    expect(await k.ownerOf(ph3)).toBeNull();
  });

  it("registerPlaceByProxy#11 操作する人はサービス運営者 O。O が登録した写真 ph1 は、すでに別の店舗が持ち主 / O が、ph1 を添えて代理登録する", async () => {
    const { k, O } = await operatorKit();
    const ph1 = await k.photo(O);
    const other = await register(k, O, k.newPlaceId(), { photoIds: [ph1] });
    const p1 = k.newPlaceId();
    await expectCode(
      register(k, O, p1, { photoIds: [ph1] }),
      BusinessRuleError,
      "MEDIA_PHOTO_ALREADY_OWNED",
    );
    expect(await k.findPlace(PlaceId.create(p1))).toBeNull();
    expect(await k.ownerOf(ph1)).toEqual({ kind: "place", id: other.id });
  });

  it("registerPlaceByProxy#12 操作する人はサービス運営者 O。O が登録した、持ち主のない写真 ph1 / O が、写真を ph1・ph1 の順にして代理登録する", async () => {
    const { k, O } = await operatorKit();
    const ph1 = await k.photo(O);
    const p1 = k.newPlaceId();
    await expectCode(
      register(k, O, p1, { photoIds: [ph1, ph1] }),
      BusinessRuleError,
      "PLACE_DUPLICATE_PHOTO",
    );
    expect(await k.findPlace(PlaceId.create(p1))).toBeNull();
    expect(await k.ownerOf(ph1)).toBeNull();
  });

  it("registerPlaceByProxy#13 操作する人はサービス運営者 O。ph8 は存在しない PhotoId。O が登録した、持ち主のない写真 ph1 / O が、ph1 と ph8 を添えて代理登録する", async () => {
    const { k, O } = await operatorKit();
    const ph1 = await k.photo(O);
    const ph8 = k.absentPhotoId();
    const p1 = k.newPlaceId();
    await expectCode(
      register(k, O, p1, { photoIds: [ph1, ph8] }),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_AVAILABLE",
    );
    expect(await k.findPlace(PlaceId.create(p1))).toBeNull();
    expect(await k.ownerOf(ph1)).toBeNull();
  });
});
