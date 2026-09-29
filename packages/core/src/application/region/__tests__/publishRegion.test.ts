import type { RegionId } from "@repo/core/domain/common/ids";
import type { PublishConditionUnmetError } from "@repo/core/domain/common/publication";
import { BusinessRuleError } from "@repo/core/domain/error";
import type { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  type Person,
  rejection,
} from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { publishRegion } from "../publishRegion";
import { updateRegionContent } from "../updateRegionContent";
import { contentFields, type RegionKit, regionKit } from "./kit";

const publish = (
  k: RegionKit,
  who: Person,
  regionId: RegionId,
  container: RequestContainer = k.container,
) => publishRegion({ container, actor: who.actor, input: { regionId } });

/** A draft meeting the publish requirements (one photo) and its steward R. */
async function publishableDraft() {
  const k = regionKit();
  const O = await k.setupOperator();
  const r = await k.region({ photoIds: [await k.photo(O)] }, "draft");
  const R = await k.steward(r.id);
  return { k, O, R, r };
}

async function expectRefused(
  k: RegionKit,
  who: Person,
  region: Region,
  code: string,
) {
  const mark = await k.mark();
  await expectCode(publish(k, who, region.id), BusinessRuleError, code);
  expect(await k.getRegion(region.id)).toEqual(region);
  expect(await k.since(mark)).toEqual([]);
}

describe("publishRegion", () => {
  it("publishRegion#1 操作する人が地域運営者。地域は draft で、名称・所在地・位置・写真がそろっている / 公開する", async () => {
    const { k, R, r } = await publishableDraft();
    k.clock.advance(60_000);
    const now = k.clock.now();
    const mark = await k.mark();
    const published = await publish(k, R, r.id);
    const stored = await k.getRegion(r.id);
    expect(stored).toEqual(published);
    expect(stored.publication).toEqual({
      status: "published",
      firstPublishedAt: now,
    });
    expect(stored.version).toBe(r.version + 1);
    expect(await k.since(mark)).toEqual([]);
  });

  it("publishRegion#2 操作する人が地域運営者。地域は unpublished（byManager）で、公開条件を満たす / 公開する", async () => {
    const k = regionKit();
    const r = await k.region({}, "unpublished");
    expect(r.publication).toMatchObject({ reason: "byManager" });
    const R = await k.steward(r.id);
    k.clock.advance(60_000);
    await publish(k, R, r.id);
    const stored = await k.getRegion(r.id);
    expect(stored.publication).toEqual({
      status: "published",
      firstPublishedAt:
        r.publication.status === "unpublished"
          ? r.publication.firstPublishedAt
          : null,
    });
  });

  it("publishRegion#3 地域に地域運営者がいない。操作する人がサービス運営者。地域は draft で、公開条件を満たす / 公開する", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({ photoIds: [await k.photo(O)] }, "draft");
    await publish(k, O, r.id);
    expect((await k.getRegion(r.id)).publication.status).toBe("published");
    expect(await k.findStewardship(k.regionRef(r.id))).toBeNull();
  });

  it("publishRegion#4 操作する人が地域運営者。地域は draft で、写真と位置がない / 公開する", async () => {
    const k = regionKit();
    const r = await k.region({ location: null, photoIds: [] }, "draft");
    const R = await k.steward(r.id);
    const mark = await k.mark();
    const error = await rejection(publish(k, R, r.id));
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect((error as PublishConditionUnmetError).code).toBe(
      "REGION_PUBLISH_CONDITION_UNMET",
    );
    expect((error as PublishConditionUnmetError).missing).toEqual([
      "location",
      "photos",
    ]);
    expect(await k.getRegion(r.id)).toEqual(r);
    expect(await k.since(mark)).toEqual([]);
  });

  it("publishRegion#5 操作する人が地域運営者。地域は unpublished（photoTakedown）で、写真がない / 公開する", async () => {
    const k = regionKit();
    const r = await k.region({}, "photoTakedown");
    const R = await k.steward(r.id);
    await expectRefused(k, R, r, "REGION_PUBLISH_CONDITION_UNMET");
  });

  it("publishRegion#6 操作する人が地域運営者。地域は unpublished（photoTakedown）で、写真を加えて保存済み / 公開する", async () => {
    const k = regionKit();
    const r = await k.region({}, "photoTakedown");
    const R = await k.steward(r.id);
    const ph = await k.photo(R);
    const saved = await updateRegionContent({
      container: k.container,
      actor: R.actor,
      input: {
        regionId: r.id,
        version: r.version,
        content: contentFields({ photoIds: [ph] }),
      },
    });
    expect(saved.region.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
    await publish(k, R, r.id);
    expect((await k.getRegion(r.id)).publication.status).toBe("published");
  });

  it("publishRegion#7 操作する人が地域運営者。地域は unpublished で運営による非公開。公開条件を満たす / 公開する", async () => {
    const k = regionKit();
    const r = await k.region({}, "unpublished", { suspended: true });
    const R = await k.steward(r.id);
    await expectRefused(k, R, r, "REGION_SUSPENDED");
  });

  it("publishRegion#8 操作する人が地域運営者。地域は別の運営者の操作ですでに published / 公開する", async () => {
    const k = regionKit();
    const r = await k.region({}, "published");
    const R = await k.steward(r.id);
    await expectRefused(k, R, r, "COMMON_PUBLICATION_INVALID_TRANSITION");
  });

  it("publishRegion#9 地域に地域運営者がいる。操作する人は、その地域の管理権限を持たないサービス運営者 / 公開する", async () => {
    const { k, O, r } = await publishableDraft();
    await expectCode(publish(k, O, r.id), ForbiddenError);
    expect(await k.getRegion(r.id)).toEqual(r);
  });

  it("publishRegion#10 操作する人が、この地域の管理権限も役割も持たない / 公開する", async () => {
    const { k, r } = await publishableDraft();
    const U = await k.person("nobody");
    await expectCode(publish(k, U, r.id), ForbiddenError);
    expect(await k.getRegion(r.id)).toEqual(r);
  });

  it("publishRegion#11 指定した ID の地域がない / 公開する", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    await expectCode(publish(k, O, k.absentRegionId()), NotFoundError);
  });

  it("publishRegion#12 操作する人が地域運営者。地域は published で運営による非公開 / 公開する", async () => {
    const k = regionKit();
    const r = await k.region({}, "published", { suspended: true });
    const R = await k.steward(r.id);
    await expectRefused(k, R, r, "REGION_SUSPENDED");
  });

  it("publishRegion#13 操作する人が地域運営者。地域は draft で運営による非公開。写真がない / 公開する", async () => {
    const k = regionKit();
    const r = await k.region({ photoIds: [] }, "draft", { suspended: true });
    const R = await k.steward(r.id);
    await expectRefused(k, R, r, "REGION_SUSPENDED");
  });

  it("publishRegion#14 操作する人が地域運営者。地域は draft で公開条件を満たす。公開と、別の運営者の地域情報の保存が同時に確定する / 公開する", async () => {
    const { k, R, r } = await publishableDraft();
    const S = await k.person("second-steward");
    await k.appoint(k.regionRef(r.id), S);
    let byS: Region | null = null;
    const racing = commitAfter(k.container, async () => {
      byS = (
        await updateRegionContent({
          container: k.container,
          actor: S.actor,
          input: {
            regionId: r.id,
            version: r.version,
            content: contentFields({
              description: "同時に直した紹介",
              photoIds: r.content.photos.items.map((p) => p.photoId),
            }),
          },
        })
      ).region;
    });
    await expectCode(publish(k, R, r.id, racing), ConflictError);
    const stored = await k.getRegion(r.id);
    expect(stored).toEqual(byS);
    expect(stored.publication).toEqual({ status: "draft" });
  });
});
