import { RegionId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { Towns } from "../../place/__tests__/kit";
import type { GeneratedId } from "../../ports/idGenerator";
import type { RegionContentFields } from "../regions";
import { registerRegion } from "../registerRegion";
import { contentFields, type RegionKit, regionKit } from "./kit";

const register = (
  k: RegionKit,
  who: Person,
  regionId: GeneratedId,
  content: Partial<RegionContentFields> = {},
) =>
  registerRegion({
    container: k.container,
    actor: who.actor,
    input: { regionId, content: contentFields(content) },
  });

async function operatorKit() {
  const k = regionKit();
  const O = await k.setupOperator();
  return { k, O };
}

describe("registerRegion", () => {
  it("registerRegion#1 操作する人がサービス運営者。操作する人が登録した、持ち主のない写真が2枚ある / 名称・所在地・位置・写真2枚・紹介・キャッチコピーを入力して登録する", async () => {
    const { k, O } = await operatorKit();
    const [ph1, ph2] = [await k.photo(O), await k.photo(O)];
    const id = k.newPlaceId();
    const mark = await k.mark();
    const now = k.clock.now();
    const result = await register(k, O, id, { photoIds: [ph2, ph1] });
    const stored = await k.getRegion(RegionId.create(id));
    expect(stored).toEqual(result.region);
    expect(stored).toMatchObject({
      id,
      publication: { status: "draft" },
      suspension: { suspended: false },
      version: 0,
      updatedAt: now,
    });
    expect(stored.content).toMatchObject({
      name: "谷中",
      address: {
        areaCode: "1000004",
        prefecture: "東京都",
        municipality: "千代田区",
        town: "大手町",
        rest: "1-1",
      },
      location: { latitude: 35.7266, longitude: 139.7669 },
      description: "下町の路地",
      tagline: "路地を歩く",
    });
    expect(stored.content.photos.items.map((p) => p.photoId)).toEqual([
      ph2,
      ph1,
    ]);
    const owner = { kind: "region", id };
    expect(await k.ownerOf(ph1)).toEqual(owner);
    expect(await k.ownerOf(ph2)).toEqual(owner);
    expect(result.missingRequirements).toEqual([]);
    expect(await k.since(mark)).toEqual([]);
    expect(await k.findStewardship(k.regionRef(stored.id))).toBeNull();
  });

  it("registerRegion#2 操作する人がサービス運営者 / 名称だけを入力し、所在地・位置・写真を未入力で登録する", async () => {
    const { k, O } = await operatorKit();
    const id = k.newPlaceId();
    const result = await register(k, O, id, {
      address: null,
      location: null,
      photoIds: [],
      description: null,
      tagline: null,
    });
    const stored = await k.getRegion(RegionId.create(id));
    expect(stored).toEqual(result.region);
    expect(stored.publication).toEqual({ status: "draft" });
    expect(stored.content.name).toBe("谷中");
    expect(result.missingRequirements).toEqual([
      "address",
      "location",
      "photos",
    ]);
  });

  it("registerRegion#3 操作する人がサービス運営者。同じ ID、同じ地域情報の地域が登録済み / 同じ ID と同じ地域情報で、もう一度登録する", async () => {
    const { k, O } = await operatorKit();
    const ph1 = await k.photo(O);
    const id = k.newPlaceId();
    const first = await register(k, O, id, { photoIds: [ph1] });
    const photo = await k.findPhoto(ph1);
    const mark = await k.mark();
    k.clock.advance(60_000);
    const again = await register(k, O, id, { photoIds: [ph1] });
    expect(again.region).toEqual(first.region);
    const stored = await k.getRegion(RegionId.create(id));
    expect(stored).toEqual(first.region);
    expect(stored.version).toBe(0);
    expect(await k.findPhoto(ph1)).toEqual(photo);
    expect(await k.since(mark)).toEqual([]);
  });

  it("registerRegion#4 操作する人がサービス運営者。同じ ID の地域が登録済み / 同じ ID と、名称の違う地域情報で登録する", async () => {
    const { k, O } = await operatorKit();
    const id = k.newPlaceId();
    const first = await register(k, O, id);
    await expectCode(register(k, O, id, { name: "根津" }), ConflictError);
    expect(await k.getRegion(RegionId.create(id))).toEqual(first.region);
  });

  it("registerRegion#5 操作する人がサービス運営者でない（地域運営者、店舗管理者、編集担当者のいずれか） / 地域情報を入力して登録する", async () => {
    const k = regionKit();
    const other = await k.region();
    const regionSteward = await k.steward(other.id, "region-steward");
    const place = await k.place();
    const placeSteward = await k.person("place-steward");
    await k.appoint(k.placeRef(place), placeSteward);
    const editor = await k.person("editor");
    await k.editors(editor);
    for (const who of [regionSteward, placeSteward, editor]) {
      const id = k.newPlaceId();
      await expectCode(register(k, who, id), ForbiddenError);
      expect(await k.findRegion(RegionId.create(id))).toBeNull();
    }
  });

  it("registerRegion#6 操作する人がサービス運営者。写真のうち1枚は、別の人が登録した写真 / その写真を含む地域情報で登録する", async () => {
    const { k, O } = await operatorKit();
    const B = await k.person("other");
    const own = await k.photo(O);
    const foreign = await k.photo(B);
    const id = k.newPlaceId();
    await expectCode(
      register(k, O, id, { photoIds: [own, foreign] }),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_REGISTRANT",
    );
    expect(await k.findRegion(RegionId.create(id))).toBeNull();
    expect(await k.ownerOf(own)).toBeNull();
    expect(await k.ownerOf(foreign)).toBeNull();
  });

  it("registerRegion#7 操作する人がサービス運営者。選んだ町域が AreaCatalog にない / その町域を所在地にして登録する", async () => {
    const { k, O } = await operatorKit();
    const id = k.newPlaceId();
    await expectCode(
      register(k, O, id, { address: { town: Towns.missing, rest: "1-1" } }),
      BusinessRuleError,
      "AREA_TOWN_NOT_FOUND",
    );
    expect(await k.findRegion(RegionId.create(id))).toBeNull();
  });

  it("registerRegion#8 操作する人がサービス運営者。写真のうち1枚は、存在しない PhotoId / その写真を含む地域情報で登録する", async () => {
    const { k, O } = await operatorKit();
    const own = await k.photo(O);
    const id = k.newPlaceId();
    await expectCode(
      register(k, O, id, { photoIds: [own, k.absentPhotoId()] }),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_AVAILABLE",
    );
    expect(await k.findRegion(RegionId.create(id))).toBeNull();
    expect(await k.ownerOf(own)).toBeNull();
  });

  it("registerRegion#9 操作する人がサービス運営者。自分が登録した写真のうち1枚は、すでに別の地域が持ち主 / その写真を含む地域情報で登録する", async () => {
    const { k, O } = await operatorKit();
    const [own, owned] = [await k.photo(O), await k.photo(O)];
    const existing = await k.region({ photoIds: [owned] });
    const id = k.newPlaceId();
    await expectCode(
      register(k, O, id, { photoIds: [own, owned] }),
      BusinessRuleError,
      "MEDIA_PHOTO_ALREADY_OWNED",
    );
    expect(await k.findRegion(RegionId.create(id))).toBeNull();
    expect(await k.ownerOf(own)).toBeNull();
    expect(await k.ownerOf(owned)).toEqual(k.regionRef(existing.id));
  });
});
