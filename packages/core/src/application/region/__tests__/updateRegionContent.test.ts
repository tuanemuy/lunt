import type { PhotoId } from "@repo/core/domain/common/ids";
import type { PublishConditionUnmetError } from "@repo/core/domain/common/publication";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError } from "@repo/core/domain/error";
import type { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import {
  expectCode,
  type Person,
  rejection,
} from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { Towns } from "../../place/__tests__/kit";
import { getManagedRegion } from "../getManagedRegion";
import type { RegionContentFields } from "../regions";
import { updateRegionContent } from "../updateRegionContent";
import {
  contentFields,
  emptyContentFields,
  type RegionKit,
  regionKit,
} from "./kit";

const photoIdsOf = (region: Region): readonly PhotoId[] =>
  region.content.photos.items.map((photo) => photo.photoId);

/** Saves the whole content: the region's current photos unless overridden. */
const update = (
  k: RegionKit,
  who: Person,
  region: Region,
  content: Partial<RegionContentFields> = {},
  options: Readonly<{ version?: number; container?: RequestContainer }> = {},
) =>
  updateRegionContent({
    container: options.container ?? k.container,
    actor: who.actor,
    input: {
      regionId: region.id,
      version: Version.create(options.version ?? region.version),
      content: contentFields({ photoIds: photoIdsOf(region), ...content }),
    },
  });

/** A published region with photos A, B (the setup operator's) and its steward R. */
async function stewardedPublished(photos = 2) {
  const k = regionKit();
  const O = await k.setupOperator();
  const ids: PhotoId[] = [];
  for (let i = 0; i < photos; i += 1) ids.push(await k.photo(O));
  const r = await k.region({ photoIds: ids }, "published");
  const R = await k.steward(r.id);
  return { k, O, R, r, ids };
}

async function expectUnchanged(k: RegionKit, region: Region, mark: number) {
  expect(await k.getRegion(region.id)).toEqual(region);
  expect(await k.since(mark)).toEqual([]);
}

describe("updateRegionContent", () => {
  it("updateRegionContent#1 操作する人が地域運営者。地域は published で、写真 A・B を持つ。操作する人が登録した、持ち主のない写真 C がある / 名称と紹介を変え、写真を C・A の順にして保存する（B を外す）", async () => {
    const { k, R, r, ids } = await stewardedPublished();
    const [A, B] = ids as [PhotoId, PhotoId];
    const C = await k.photo(R);
    k.clock.advance(60_000);
    const now = k.clock.now();
    const mark = await k.mark();
    const result = await update(k, R, r, {
      name: "谷中銀座",
      description: "商店街の路地",
      photoIds: [C, A],
    });
    const stored = await k.getRegion(r.id);
    expect(stored).toEqual(result.region);
    expect(stored.content.name).toBe("谷中銀座");
    expect(stored.content.description).toBe("商店街の路地");
    expect(photoIdsOf(stored)).toEqual([C, A]);
    expect(stored.version).toBe(r.version + 1);
    expect(stored.updatedAt).toEqual(now);
    expect(stored.publication).toEqual(r.publication);
    expect(await k.ownerOf(C)).toEqual(k.regionRef(r.id));
    expect(await k.since(mark)).toMatchObject([
      {
        type: "photos.released",
        aggregateId: r.id,
        payload: { photoIds: [B] },
      },
    ]);
  });

  it("updateRegionContent#2 操作する人が地域運営者。地域は published / 写真をすべて外した内容で保存する", async () => {
    const { k, R, r } = await stewardedPublished();
    const mark = await k.mark();
    const error = await rejection(update(k, R, r, { photoIds: [] }));
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect((error as PublishConditionUnmetError).code).toBe(
      "REGION_PUBLISH_CONDITION_UNMET",
    );
    expect((error as PublishConditionUnmetError).missing).toEqual(["photos"]);
    await expectUnchanged(k, r, mark);
  });

  it("updateRegionContent#3 操作する人が地域運営者。地域は draft / 名称・所在地・位置・写真をすべて未入力にして保存する", async () => {
    const k = regionKit();
    const r = await k.region({}, "draft");
    const R = await k.steward(r.id);
    const result = await updateRegionContent({
      container: k.container,
      actor: R.actor,
      input: {
        regionId: r.id,
        version: r.version,
        content: emptyContentFields(),
      },
    });
    const stored = await k.getRegion(r.id);
    expect(stored).toEqual(result.region);
    expect(stored.publication).toEqual({ status: "draft" });
    expect(stored.content).toMatchObject({
      name: null,
      address: null,
      location: null,
    });
    expect(result.missingRequirements).toEqual([
      "name",
      "address",
      "location",
      "photos",
    ]);
  });

  it("updateRegionContent#4 操作する人が地域運営者。地域は published で運営による非公開 / 紹介を変えて保存する", async () => {
    const k = regionKit();
    const r = await k.region({}, "published", { suspended: true });
    const R = await k.steward(r.id);
    await update(k, R, r, { description: "紹介を直した" });
    const stored = await k.getRegion(r.id);
    expect(stored.content.description).toBe("紹介を直した");
    expect(stored.publication).toEqual(r.publication);
    expect(stored.suspension).toEqual({ suspended: true });
  });

  it("updateRegionContent#5 操作する人が地域運営者。地域は申立てによる写真の削除で unpublished（photoTakedown）。操作する人が登録した、持ち主のない写真がある / その写真を加えて保存する", async () => {
    const k = regionKit();
    const r = await k.region({}, "photoTakedown");
    expect(r.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    const R = await k.steward(r.id);
    const ph = await k.photo(R);
    await update(k, R, r, { photoIds: [ph] });
    const stored = await k.getRegion(r.id);
    expect(photoIdsOf(stored)).toEqual([ph]);
    expect(await k.ownerOf(ph)).toEqual(k.regionRef(r.id));
    expect(stored.publication).toEqual(r.publication);
  });

  it("updateRegionContent#6 操作する人が地域運営者。地域は、申立てによって写真 A・B・C から A が削除され、写真は B・C / 写真の並びを B・C のまま、紹介だけを変えて保存する", async () => {
    const { k, R, r, ids } = await stewardedPublished(3);
    const [A, B, C] = ids as [PhotoId, PhotoId, PhotoId];
    const takenDown = await k.takeDown(r.id, [A]);
    expect(photoIdsOf(takenDown)).toEqual([B, C]);
    await update(k, R, takenDown, { description: "紹介だけ直した" });
    const stored = await k.getRegion(r.id);
    expect(stored.content.description).toBe("紹介だけ直した");
    expect(stored.content.photos.takenDown).toBe(true);
    const view = await getManagedRegion({
      container: k.container,
      actor: R.actor,
      input: { regionId: r.id },
    });
    expect(view.photosTakenDown).toBe(true);
  });

  it("updateRegionContent#7 地域に地域運営者がいない。操作する人がサービス運営者 / 地域情報を変えて保存する", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published");
    const result = await update(k, O, r, { name: "代行で直した地域" });
    expect(await k.getRegion(r.id)).toEqual(result.region);
    expect(result.region.content.name).toBe("代行で直した地域");
  });

  it("updateRegionContent#8 地域に地域運営者がいる。操作する人は、その地域の管理権限を持たないサービス運営者 / 地域情報を変えて保存する", async () => {
    const { k, O, r } = await stewardedPublished();
    const mark = await k.mark();
    await expectCode(update(k, O, r, { name: "直せない" }), ForbiddenError);
    await expectUnchanged(k, r, mark);
  });

  it("updateRegionContent#9 操作する人が、この地域の管理権限も役割も持たない（別の地域運営者、所属店舗の店舗管理者を含む） / 地域情報を変えて保存する", async () => {
    const { k, r } = await stewardedPublished();
    const other = await k.region({ name: "根津" });
    const otherSteward = await k.steward(other.id, "other-region-steward");
    const place = await k.place();
    await k.affiliate(place.id, r.id);
    const placeSteward = await k.person("place-steward");
    await k.appoint(k.placeRef(place), placeSteward);
    const nobody = await k.person("nobody");
    const mark = await k.mark();
    for (const who of [otherSteward, placeSteward, nobody]) {
      await expectCode(update(k, who, r, { name: "直せない" }), ForbiddenError);
    }
    await expectUnchanged(k, r, mark);
  });

  it("updateRegionContent#10 操作する人は、編集を始めた後に地域の管理権限を解除された / 地域情報を変えて保存する", async () => {
    const { k, R, r } = await stewardedPublished();
    const other = await k.person("remaining-steward");
    await k.appoint(k.regionRef(r.id), other);
    const read = await k.getRegion(r.id);
    await k.removeSteward(k.regionRef(r.id), R);
    await expectCode(update(k, R, read, { name: "直せない" }), ForbiddenError);
    expect(await k.getRegion(r.id)).toEqual(read);
  });

  it("updateRegionContent#11 操作する人が地域運営者。編集を始めた後に、別の運営者が地域情報を保存した / 編集を始めたときの版で保存する", async () => {
    const { k, R, r } = await stewardedPublished();
    const S = await k.person("second-steward");
    await k.appoint(k.regionRef(r.id), S);
    const started = await k.getRegion(r.id);
    const byS = await update(k, S, started, { name: "別の運営者の名称" });
    await expectCode(
      update(k, R, started, { name: "古い版からの名称" }),
      ConflictError,
    );
    expect(await k.getRegion(r.id)).toEqual(byS.region);
  });

  it("updateRegionContent#12 操作する人が地域運営者。加える写真は、別の人が登録した写真 / その写真を加えて、名称も変えて保存する", async () => {
    const { k, R, r } = await stewardedPublished();
    const B = await k.person("other");
    const foreign = await k.photo(B);
    const mark = await k.mark();
    await expectCode(
      update(k, R, r, {
        name: "名称も変える",
        photoIds: [...photoIdsOf(r), foreign],
      }),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_REGISTRANT",
    );
    await expectUnchanged(k, r, mark);
    expect(await k.ownerOf(foreign)).toBeNull();
  });

  it("updateRegionContent#13 指定した ID の地域がない / 地域情報を保存する", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    await expectCode(
      updateRegionContent({
        container: k.container,
        actor: O.actor,
        input: {
          regionId: k.absentRegionId(),
          version: Version.initial(),
          content: contentFields(),
        },
      }),
      NotFoundError,
    );
  });

  it("updateRegionContent#14 操作する人が地域運営者。選んだ町域が AreaCatalog にない / その町域を所在地にして保存する", async () => {
    const { k, R, r } = await stewardedPublished();
    await expectCode(
      update(k, R, r, { address: { town: Towns.missing, rest: "1-1" } }),
      BusinessRuleError,
      "AREA_TOWN_NOT_FOUND",
    );
    expect(await k.getRegion(r.id)).toEqual(r);
  });

  it("updateRegionContent#15 操作する人が地域運営者。新しく加える写真の1枚は、存在しない PhotoId / その写真を加えて保存する", async () => {
    const { k, R, r } = await stewardedPublished();
    await expectCode(
      update(k, R, r, { photoIds: [...photoIdsOf(r), k.absentPhotoId()] }),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_AVAILABLE",
    );
    expect(await k.getRegion(r.id)).toEqual(r);
  });

  it("updateRegionContent#16 操作する人が地域運営者。自分が登録した写真 F は、すでに別の地域が持ち主 / 写真 F を加えて保存する", async () => {
    const { k, R, r } = await stewardedPublished();
    const F = await k.photo(R);
    const other = await k.region({ name: "根津" });
    await k.appoint(k.regionRef(other.id), R);
    await update(k, R, other, { name: "根津", photoIds: [F] });
    expect(await k.ownerOf(F)).toEqual(k.regionRef(other.id));
    await expectCode(
      update(k, R, r, { photoIds: [...photoIdsOf(r), F] }),
      BusinessRuleError,
      "MEDIA_PHOTO_ALREADY_OWNED",
    );
    expect(await k.getRegion(r.id)).toEqual(r);
    expect(await k.ownerOf(F)).toEqual(k.regionRef(other.id));
  });

  it("judges an invalid input value before a stale version", async () => {
    const { k, R, r } = await stewardedPublished();
    const S = await k.person("second-steward");
    await k.appoint(k.regionRef(r.id), S);
    const started = await k.getRegion(r.id);
    const byS = await update(k, S, started, { name: "別の運営者の名称" });
    await expectCode(
      update(k, R, started, { name: "改行\nを含む名称" }),
      BusinessRuleError,
      "REGION_INVALID_NAME",
    );
    expect(await k.getRegion(r.id)).toEqual(byS.region);
  });
});
