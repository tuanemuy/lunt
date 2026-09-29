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
import { unpublishRegion } from "../unpublishRegion";
import { updateRegionContent } from "../updateRegionContent";
import { contentFields, type RegionKit, regionKit } from "./kit";

const unpublish = (
  k: RegionKit,
  who: Person,
  regionId: RegionId,
  container: RequestContainer = k.container,
) => unpublishRegion({ container, actor: who.actor, input: { regionId } });

async function expectRefused(
  k: RegionKit,
  who: Person,
  region: Region,
  code: string,
) {
  const mark = await k.mark();
  await expectCode(unpublish(k, who, region.id), BusinessRuleError, code);
  expect(await k.getRegion(region.id)).toEqual(region);
  expect(await k.since(mark)).toEqual([]);
}

describe("unpublishRegion", () => {
  it("unpublishRegion#1 操作する人が地域運営者。地域は published。店舗が所属中で、その店舗はこの地域を選んだ代表地域にしている。イベント O がこの地域を関連づけている / 公開を取り下げる", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published");
    const R = await k.steward(r.id);
    const first = await k.region({ name: "根津" }, "published");
    const p = await k.place();
    await k.affiliate(p.id, first.id, r.id);
    const affiliations = await k.choose(p.id, r.id);
    const listing = await k.listing(p.id, "published", await k.photo(O));
    const place = await k.getPlace(p.id);
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
    const mark = await k.mark();
    const unpublished = await unpublish(k, R, r.id);
    const stored = await k.getRegion(r.id);
    expect(stored).toEqual(unpublished);
    expect(stored.publication).toEqual({
      status: "unpublished",
      reason: "byManager",
      firstPublishedAt:
        r.publication.status === "published"
          ? r.publication.firstPublishedAt
          : null,
    });
    expect(await k.since(mark)).toMatchObject([
      {
        type: "region.unpublished",
        aggregateId: r.id,
        payload: { regionId: r.id, reason: "byManager" },
      },
    ]);
    expect((await k.findAffiliations(p.id))?.entity).toEqual(affiliations);
    expect(affiliations.chosenRepresentative).toBe(r.id);
    expect(
      (
        await k.container.unitOfWorkProvider.run(({ regionLinkRepository }) =>
          regionLinkRepository.findById(key),
        )
      )?.entity,
    ).toEqual(link);
    expect(await k.getPlace(p.id)).toEqual(place);
    expect(await k.findListing(listing.id)).toEqual(listing);
  });

  it("unpublishRegion#2 地域に地域運営者がいない。操作する人がサービス運営者。地域は published / 公開を取り下げる", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published");
    await unpublish(k, O, r.id);
    expect((await k.getRegion(r.id)).publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
  });

  it("unpublishRegion#3 操作する人が地域運営者。地域は published で運営による非公開 / 公開を取り下げる", async () => {
    const k = regionKit();
    const r = await k.region({}, "published", { suspended: true });
    const R = await k.steward(r.id);
    await expectRefused(k, R, r, "REGION_SUSPENDED");
  });

  it("unpublishRegion#4 操作する人が地域運営者。地域は別の運営者の操作ですでに unpublished / 公開を取り下げる", async () => {
    const k = regionKit();
    const r = await k.region({}, "unpublished");
    const R = await k.steward(r.id);
    await expectRefused(k, R, r, "COMMON_PUBLICATION_INVALID_TRANSITION");
  });

  it("unpublishRegion#5 操作する人が地域運営者。地域は draft / 公開を取り下げる", async () => {
    const k = regionKit();
    const r = await k.region({}, "draft");
    const R = await k.steward(r.id);
    await expectRefused(k, R, r, "COMMON_PUBLICATION_INVALID_TRANSITION");
  });

  it("unpublishRegion#6 地域に地域運営者がいる。操作する人は、その地域の管理権限を持たないサービス運営者 / 公開を取り下げる", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const r = await k.region({}, "published");
    await k.steward(r.id);
    await expectCode(unpublish(k, O, r.id), ForbiddenError);
    expect(await k.getRegion(r.id)).toEqual(r);
  });

  it("unpublishRegion#7 操作する人が、この地域の管理権限も役割も持たない / 公開を取り下げる", async () => {
    const k = regionKit();
    const r = await k.region({}, "published");
    await k.steward(r.id);
    const U = await k.person("nobody");
    await expectCode(unpublish(k, U, r.id), ForbiddenError);
    expect(await k.getRegion(r.id)).toEqual(r);
  });

  it("unpublishRegion#8 指定した ID の地域がない / 公開を取り下げる", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    await expectCode(unpublish(k, O, k.absentRegionId()), NotFoundError);
  });

  it("unpublishRegion#9 操作する人が地域運営者。地域は unpublished で運営による非公開 / 公開を取り下げる", async () => {
    const k = regionKit();
    const r = await k.region({}, "unpublished", { suspended: true });
    const R = await k.steward(r.id);
    await expectRefused(k, R, r, "REGION_SUSPENDED");
  });

  it("unpublishRegion#10 操作する人が地域運営者。地域は published。公開の取り下げと、別の運営者の地域情報の保存が同時に確定する / 公開を取り下げる", async () => {
    const k = regionKit();
    const r = await k.region({}, "published");
    const R = await k.steward(r.id);
    const S = await k.steward(r.id, "second-steward");
    const mark = await k.mark();
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
    await expectCode(unpublish(k, R, r.id, racing), ConflictError);
    const stored = await k.getRegion(r.id);
    expect(stored).toEqual(byS);
    expect(stored.publication.status).toBe("published");
    expect(await k.since(mark)).toEqual([]);
  });
});
