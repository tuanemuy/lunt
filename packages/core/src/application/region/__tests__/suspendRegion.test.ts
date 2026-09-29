import { OccasionId, type RegionId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { RegionLink } from "@repo/core/domain/occasion/regionLink";
import type { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  type Person,
} from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { suspendRegion } from "../suspendRegion";
import { updateRegionContent } from "../updateRegionContent";
import { contentFields, type RegionKit, regionKit } from "./kit";

const suspend = (
  k: RegionKit,
  who: Person,
  regionId: RegionId,
  container: RequestContainer = k.container,
) => suspendRegion({ container, actor: who.actor, input: { regionId } });

describe("suspendRegion", () => {
  it("suspendRegion#1 操作する人がサービス運営者。地域は published で、地域運営者がいる / 運営による非公開にする", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published");
    await k.steward(r.id);
    const mark = await k.mark();
    const suspended = await suspend(k, O, r.id);
    const stored = await k.getRegion(r.id);
    expect(stored).toEqual(suspended);
    expect(stored.suspension).toEqual({ suspended: true });
    expect(stored.publication).toEqual(r.publication);
    expect(stored.version).toBe(r.version + 1);
    expect(await k.since(mark)).toMatchObject([
      {
        type: "region.suspended",
        aggregateId: r.id,
        payload: { regionId: r.id },
      },
    ]);
  });

  it("suspendRegion#2 操作する人がサービス運営者。地域は draft で、地域運営者がいない / 運営による非公開にする", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "draft");
    const mark = await k.mark();
    await suspend(k, O, r.id);
    const stored = await k.getRegion(r.id);
    expect(stored.suspension).toEqual({ suspended: true });
    expect(stored.publication).toEqual({ status: "draft" });
    expect((await k.since(mark)).map((e) => e.type)).toEqual([
      "region.suspended",
    ]);
  });

  it("suspendRegion#3 操作する人がサービス運営者。地域は published。店舗が所属中。イベント O がこの地域を関連づけている / 運営による非公開にする", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published");
    const p = await k.place();
    const other = await k.region({ name: "根津" }, "published");
    await k.affiliate(p.id, other.id, r.id);
    const chosen = await k.choose(p.id, r.id);
    const place = await k.getPlace(p.id);
    const listing = await k.listing(p.id, "published", await k.photo(O));
    const key = {
      occasionId: OccasionId.create(k.newPlaceId()),
      regionId: r.id,
    };
    const link = RegionLink.link(
      null,
      key,
      { regionViewable: true },
      k.tick(),
    ).entity;
    await k.container.unitOfWorkProvider.run(({ regionLinkRepository }) =>
      regionLinkRepository.insert(link),
    );
    await suspend(k, O, r.id);
    expect((await k.findAffiliations(p.id))?.entity).toEqual(chosen);
    expect(await k.getPlace(p.id)).toEqual(place);
    expect(await k.findListing(listing.id)).toEqual(listing);
    const storedLink = await k.container.unitOfWorkProvider.run(
      ({ regionLinkRepository }) => regionLinkRepository.findById(key),
    );
    expect(storedLink?.entity).toEqual(link);
  });

  it("suspendRegion#4 操作する人がサービス運営者。地域は別のサービス運営者の操作ですでに運営による非公開 / 運営による非公開にする", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published", { suspended: true });
    const mark = await k.mark();
    await expectCode(
      suspend(k, O, r.id),
      BusinessRuleError,
      "REGION_ALREADY_SUSPENDED",
    );
    expect(await k.getRegion(r.id)).toEqual(r);
    expect(await k.since(mark)).toEqual([]);
  });

  it("suspendRegion#5 操作する人が地域運営者で、サービス運営者でない / 運営による非公開にする", async () => {
    const k = regionKit();
    const r = await k.region({}, "published");
    const R = await k.steward(r.id);
    await expectCode(suspend(k, R, r.id), ForbiddenError);
    expect(await k.getRegion(r.id)).toEqual(r);
  });

  it("suspendRegion#6 指定した ID の地域がない / 運営による非公開にする", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    await expectCode(suspend(k, O, k.absentRegionId()), NotFoundError);
  });

  it("suspendRegion#7 操作する人がサービス運営者。運営による非公開と、地域運営者の地域情報の保存が同時に確定する / 運営による非公開にする", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published");
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
    await expectCode(suspend(k, O, r.id, racing), ConflictError);
    expect(await k.getRegion(r.id)).toEqual(byR);
    expect(await k.since(mark)).toEqual([]);
  });
});
