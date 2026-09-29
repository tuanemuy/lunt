import type { PhotoId, RegionId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { getManagedRegion } from "../getManagedRegion";
import { updateRegionContent } from "../updateRegionContent";
import { contentFields, type RegionKit, regionKit } from "./kit";

const read = (k: RegionKit, who: Person, regionId: RegionId) =>
  getManagedRegion({
    container: k.container,
    actor: who.actor,
    input: { regionId },
  });

/** A published region with photos A, B, C and its steward R. */
async function stewardedRegion(photos = 1) {
  const k = regionKit();
  const O = await k.setupOperator();
  const photoIds: PhotoId[] = [];
  for (let i = 0; i < photos; i += 1) photoIds.push(await k.photo(O));
  const r = await k.region({ photoIds }, "published");
  const R = await k.steward(r.id);
  return { k, O, R, r, photoIds };
}

describe("getManagedRegion", () => {
  it("getManagedRegion#1 操作する人が地域運営者。地域は published で、公開条件を満たす / 地域を確かめる", async () => {
    const { k, R, r, photoIds } = await stewardedRegion(3);
    const view = await read(k, R, r.id);
    expect(view.region).toEqual(r);
    expect(view.region.content).toMatchObject({
      name: "谷中",
      description: "下町の路地",
      tagline: "路地を歩く",
    });
    expect(view.photos.map((photo) => photo.photoId)).toEqual(photoIds);
    expect(view.photos.every((photo) => photo.displayRef.url.length > 0)).toBe(
      true,
    );
    expect(view.region.publication.status).toBe("published");
    expect(view).toMatchObject({
      suspended: false,
      viewable: true,
      missingRequirements: [],
      photosTakenDown: false,
      hasSteward: true,
      management: { allowed: true, basis: "steward" },
    });
  });

  it("getManagedRegion#2 操作する人が地域運営者。地域は draft で、所在地と写真がない / 地域を確かめる", async () => {
    const k = regionKit();
    const r = await k.region({ address: null, photoIds: [] }, "draft");
    const R = await k.steward(r.id);
    const view = await read(k, R, r.id);
    expect(view.region.publication).toEqual({ status: "draft" });
    expect(view.missingRequirements).toEqual(["address", "photos"]);
    expect(view.viewable).toBe(false);
  });

  it("getManagedRegion#3 操作する人が地域運営者。地域は published で運営による非公開 / 地域を確かめる", async () => {
    const k = regionKit();
    const r = await k.region({}, "published", { suspended: true });
    const R = await k.steward(r.id);
    const view = await read(k, R, r.id);
    expect(view.region.publication.status).toBe("published");
    expect(view.suspended).toBe(true);
    expect(view.viewable).toBe(false);
  });

  it("getManagedRegion#4 操作する人が地域運営者。地域は申立てによる写真の削除で unpublished / 地域を確かめる", async () => {
    const k = regionKit();
    const r = await k.region({}, "photoTakedown");
    const R = await k.steward(r.id);
    const view = await read(k, R, r.id);
    expect(view.region.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    expect(view.missingRequirements).toEqual(["photos"]);
    expect(view.photosTakenDown).toBe(true);
    expect(view.photos).toEqual([]);
  });

  it("getManagedRegion#5 操作する人が地域運営者。地域は published で、申立てによって写真 A・B・C から A が削除された / 地域を確かめる", async () => {
    const { k, R, r, photoIds } = await stewardedRegion(3);
    const [A, B, C] = photoIds as [PhotoId, PhotoId, PhotoId];
    await k.takeDown(r.id, [A]);
    const view = await read(k, R, r.id);
    expect(view.region.publication.status).toBe("published");
    expect(view.photosTakenDown).toBe(true);
    expect(view.photos.map((photo) => photo.photoId)).toEqual([B, C]);
  });

  it("getManagedRegion#6 上の地域で、地域運営者が写真を B・C・D の並びにして保存した / 地域を確かめる", async () => {
    const { k, R, r, photoIds } = await stewardedRegion(3);
    const [A, B, C] = photoIds as [PhotoId, PhotoId, PhotoId];
    const takenDown = await k.takeDown(r.id, [A]);
    const D = await k.photo(R);
    await updateRegionContent({
      container: k.container,
      actor: R.actor,
      input: {
        regionId: r.id,
        version: takenDown.version,
        content: contentFields({ photoIds: [B, C, D] }),
      },
    });
    const view = await read(k, R, r.id);
    expect(view.photosTakenDown).toBe(false);
    expect(view.photos.map((photo) => photo.photoId)).toEqual([B, C, D]);
  });

  it("getManagedRegion#7 操作する人が地域運営者。地域は運営者の操作で unpublished / 地域を確かめる", async () => {
    const k = regionKit();
    const r = await k.region({}, "unpublished");
    const R = await k.steward(r.id);
    const view = await read(k, R, r.id);
    expect(view.region.publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
    expect(view.photosTakenDown).toBe(false);
  });

  it("getManagedRegion#8 地域に地域運営者がいない。操作する人がサービス運営者 / 地域を確かめる", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published");
    const view = await read(k, O, r.id);
    expect(view.region).toEqual(r);
    expect(view.hasSteward).toBe(false);
    expect(view.management).toEqual({
      allowed: true,
      basis: "absence_proxy",
    });
  });

  it("getManagedRegion#9 地域に地域運営者がいる。操作する人は、その地域の管理権限を持たないサービス運営者。地域は published で運営による非公開 / 地域を確かめる", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published", { suspended: true });
    await k.steward(r.id);
    const view = await read(k, O, r.id);
    expect(view.region).toEqual(r);
    expect(view.region.publication.status).toBe("published");
    expect(view).toMatchObject({
      suspended: true,
      hasSteward: true,
      management: { allowed: false },
    });
  });

  it("getManagedRegion#10 操作する人が、この地域の管理権限も、サービス運営者の役割も持たない（管理権限を解除された人、編集担当者を含む） / 地域を確かめる", async () => {
    const k = regionKit();
    const r = await k.region({}, "published");
    const R = await k.steward(r.id);
    const removed = await k.person("removed");
    await k.appoint(k.regionRef(r.id), removed);
    await k.removeSteward(k.regionRef(r.id), removed);
    const editor = await k.person("editor");
    await k.editors(editor);
    const stranger = await k.person("stranger");
    for (const who of [removed, editor, stranger]) {
      await expectCode(read(k, who, r.id), ForbiddenError);
    }
    expect((await read(k, R, r.id)).region).toEqual(r);
  });

  it("getManagedRegion#11 指定した ID の地域がない / 地域を確かめる", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    await expectCode(read(k, O, k.absentRegionId()), NotFoundError);
  });
});
