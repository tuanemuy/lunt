import type { RegionId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import type { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  type Person,
} from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { publishRegion } from "../publishRegion";
import { unsuspendRegion } from "../unsuspendRegion";
import { updateRegionContent } from "../updateRegionContent";
import { contentFields, type RegionKit, regionKit } from "./kit";

const unsuspend = (
  k: RegionKit,
  who: Person,
  regionId: RegionId,
  container: RequestContainer = k.container,
) => unsuspendRegion({ container, actor: who.actor, input: { regionId } });

describe("unsuspendRegion", () => {
  it("unsuspendRegion#1 操作する人がサービス運営者。地域は published で運営による非公開 / 解除する", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published", { suspended: true });
    const mark = await k.mark();
    const lifted = await unsuspend(k, O, r.id);
    const stored = await k.getRegion(r.id);
    expect(stored).toEqual(lifted);
    expect(stored.suspension).toEqual({ suspended: false });
    expect(stored.publication).toEqual(r.publication);
    expect(stored.version).toBe(r.version + 1);
    expect(await k.since(mark)).toMatchObject([
      {
        type: "region.unsuspended",
        aggregateId: r.id,
        payload: { regionId: r.id },
      },
    ]);
  });

  it("unsuspendRegion#2 操作する人がサービス運営者。地域は unpublished（byManager）で運営による非公開 / 解除する", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "unpublished", { suspended: true });
    await unsuspend(k, O, r.id);
    const stored = await k.getRegion(r.id);
    expect(stored.suspension).toEqual({ suspended: false });
    expect(stored.publication).toEqual(r.publication);
    expect(stored.publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
  });

  it("unsuspendRegion#3 操作する人がサービス運営者。地域は運営による非公開の間に最後の写真が削除され、unpublished（photoTakedown）になっている / 解除する", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "photoTakedown", { suspended: true });
    expect(r.suspension).toEqual({ suspended: true });
    await unsuspend(k, O, r.id);
    const stored = await k.getRegion(r.id);
    expect(stored.suspension).toEqual({ suspended: false });
    expect(stored.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
  });

  it("unsuspendRegion#4 運営による非公開を解除した地域。操作する人が地域運営者。地域は unpublished で公開条件を満たす / 地域を公開する（publishRegion）", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "unpublished", { suspended: true });
    await unsuspend(k, O, r.id);
    const R = await k.steward(r.id);
    await publishRegion({
      container: k.container,
      actor: R.actor,
      input: { regionId: r.id },
    });
    expect((await k.getRegion(r.id)).publication.status).toBe("published");
  });

  it("unsuspendRegion#5 操作する人がサービス運営者。地域は別のサービス運営者の操作ですでに解除されている / 解除する", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published");
    const mark = await k.mark();
    await expectCode(
      unsuspend(k, O, r.id),
      BusinessRuleError,
      "REGION_NOT_SUSPENDED",
    );
    expect(await k.getRegion(r.id)).toEqual(r);
    expect(await k.since(mark)).toEqual([]);
  });

  it("unsuspendRegion#6 操作する人が地域運営者で、サービス運営者でない。地域は運営による非公開 / 解除する", async () => {
    const k = regionKit();
    const r = await k.region({}, "published", { suspended: true });
    const R = await k.steward(r.id);
    await expectCode(unsuspend(k, R, r.id), ForbiddenError);
    expect((await k.getRegion(r.id)).suspension).toEqual({ suspended: true });
  });

  it("unsuspendRegion#7 指定した ID の地域がない / 解除する", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    await expectCode(unsuspend(k, O, k.absentRegionId()), NotFoundError);
  });

  it("unsuspendRegion#8 操作する人がサービス運営者。地域は運営による非公開。解除と、地域運営者の地域情報の保存が同時に確定する / 解除する", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published", { suspended: true });
    const R = await k.steward(r.id);
    const mark = await k.mark();
    let byR: Region | null = null;
    const racing = commitAfter(k.container, async () => {
      byR = (
        await updateRegionContent({
          container: k.container,
          actor: R.actor,
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
    await expectCode(unsuspend(k, O, r.id, racing), ConflictError);
    const stored = await k.getRegion(r.id);
    expect(stored).toEqual(byR);
    expect(stored.suspension).toEqual({ suspended: true });
    expect(await k.since(mark)).toEqual([]);
  });
});
