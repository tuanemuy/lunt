import type { PlaceId } from "@repo/core/domain/common/ids";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { getPlaceAffiliationStatus } from "../getPlaceAffiliationStatus";
import { type RegionKit, regionKit } from "./kit";

const status = (k: RegionKit, who: Person, placeId: PlaceId) =>
  getPlaceAffiliationStatus({
    container: k.container,
    actor: who.actor,
    input: { placeId },
  });

/** The region's first photo as the read shows it. */
async function coverOf(k: RegionKit, region: Region) {
  const [first] = region.content.photos.items;
  if (first === undefined) throw new Error("no photo");
  const refs = await k.container.photoStorage.displayRefs([first.photoId]);
  return { photoId: first.photoId, displayRef: refs.get(first.photoId) };
}

/** A place p stewarded by S. */
async function stewardedPlace() {
  const k = regionKit();
  const S = await k.person("place-steward");
  const p = await k.place();
  await k.appoint(k.placeRef(p), S);
  return { k, S, p };
}

describe("getPlaceAffiliationStatus", () => {
  it("getPlaceAffiliationStatus#1 操作する人が店舗管理者。店舗は published の地域 X（先に所属）と Y（後に所属）に所属中で、代表地域を選んでいない / 所属地域の状況を確かめる", async () => {
    const { k, S, p } = await stewardedPlace();
    const X = await k.region({ name: "X" }, "published");
    const Y = await k.region({ name: "Y" }, "published");
    const a = await k.affiliate(p.id, X.id, Y.id);
    const result = await status(k, S, p.id);
    expect(result).toEqual({
      regions: [
        {
          regionId: X.id,
          affiliatedAt: a.affiliations[0]?.affiliatedAt,
          name: "X",
          cover: await coverOf(k, X),
          publication: X.publication,
          suspended: false,
          viewable: true,
        },
        {
          regionId: Y.id,
          affiliatedAt: a.affiliations[1]?.affiliatedAt,
          name: "Y",
          cover: await coverOf(k, Y),
          publication: Y.publication,
          suspended: false,
          viewable: true,
        },
      ],
      representative: { regionId: X.id, chosen: false },
      displayedRegionId: X.id,
    });
  });

  it("getPlaceAffiliationStatus#2 操作する人が店舗管理者。店舗は published の X・Y に所属中で、Y を代表地域に選んでいる / 所属地域の状況を確かめる", async () => {
    const { k, S, p } = await stewardedPlace();
    const X = await k.region({ name: "X" }, "published");
    const Y = await k.region({ name: "Y" }, "published");
    await k.affiliate(p.id, X.id, Y.id);
    await k.choose(p.id, Y.id);
    const result = await status(k, S, p.id);
    expect(result.representative).toEqual({ regionId: Y.id, chosen: true });
    expect(result.displayedRegionId).toBe(Y.id);
  });

  async function threeRegions() {
    const { k, S, p } = await stewardedPlace();
    const X = await k.region({ name: "X" }, "published", { suspended: true });
    const Y = await k.region({ name: "Y" }, "unpublished");
    const Z = await k.region({ name: "Z" }, "published");
    await k.affiliate(p.id, X.id, Y.id, Z.id);
    await k.choose(p.id, Y.id);
    return { k, S, p, X, Y, Z };
  }

  it("getPlaceAffiliationStatus#3 操作する人が店舗管理者。店舗は X・Y・Z（この順に所属）に所属中で、Y を選んでいる。Y は unpublished、X は運営による非公開、Z は published / 所属地域の状況を確かめる", async () => {
    const { k, S, p, X, Y, Z } = await threeRegions();
    const result = await status(k, S, p.id);
    expect(result.regions).toMatchObject([
      {
        regionId: X.id,
        publication: { status: "published" },
        suspended: true,
        viewable: false,
      },
      {
        regionId: Y.id,
        publication: { status: "unpublished", reason: "byManager" },
        suspended: false,
        viewable: false,
      },
      {
        regionId: Z.id,
        publication: { status: "published" },
        suspended: false,
        viewable: true,
      },
    ]);
    expect(result.representative).toEqual({ regionId: Y.id, chosen: true });
    expect(result.displayedRegionId).toBe(Z.id);
  });

  it("getPlaceAffiliationStatus#4 上の状態から、Y が再び published になった / 所属地域の状況を確かめる", async () => {
    const { k, S, p, Y } = await threeRegions();
    await k.writeRegion(Y.id, (r) => Region.publish(r, k.tick()).entity);
    expect((await status(k, S, p.id)).displayedRegionId).toBe(Y.id);
  });

  it("getPlaceAffiliationStatus#5 操作する人が店舗管理者。店舗は unpublished の地域 X だけに所属中 / 所属地域の状況を確かめる", async () => {
    const { k, S, p } = await stewardedPlace();
    const X = await k.region({ name: "X" }, "unpublished");
    await k.affiliate(p.id, X.id);
    const result = await status(k, S, p.id);
    expect(result.regions).toMatchObject([
      { regionId: X.id, publication: { status: "unpublished" } },
    ]);
    expect(result.representative).toEqual({ regionId: X.id, chosen: false });
    expect(result.displayedRegionId).toBeNull();
  });

  it("getPlaceAffiliationStatus#6 操作する人が店舗管理者。店舗は、店舗管理者のいなかった時期に成立した X との所属を持つ / 所属地域の状況を確かめる", async () => {
    const k = regionKit();
    const p = await k.place();
    const X = await k.region({ name: "X" }, "published");
    await k.affiliate(p.id, X.id);
    const S = await k.person("place-steward");
    await k.appoint(k.placeRef(p), S);
    const result = await status(k, S, p.id);
    expect(result.regions.map((r) => r.regionId)).toEqual([X.id]);
  });

  it("getPlaceAffiliationStatus#7 操作する人が店舗管理者。店舗は X・Y に所属中で、Y を選んでいた。Y との所属が除外で解除された / 所属地域の状況を確かめる", async () => {
    const { k, S, p } = await stewardedPlace();
    const X = await k.region({ name: "X" }, "published");
    const Y = await k.region({ name: "Y" }, "published");
    await k.affiliate(p.id, X.id, Y.id);
    await k.choose(p.id, Y.id);
    await k.exclude(p.id, Y.id);
    const result = await status(k, S, p.id);
    expect(result.regions.map((r) => r.regionId)).toEqual([X.id]);
    expect(result.representative).toEqual({ regionId: X.id, chosen: false });
  });

  it("getPlaceAffiliationStatus#8 操作する人が店舗管理者。店舗に所属の記録がない / 所属地域の状況を確かめる", async () => {
    const { k, S, p } = await stewardedPlace();
    expect(await status(k, S, p.id)).toEqual({
      regions: [],
      representative: null,
      displayedRegionId: null,
    });
  });

  it("getPlaceAffiliationStatus#9 店舗に店舗管理者がいない。操作する人がサービス運営者。店舗は X に所属中 / 所属地域の状況を確かめる", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const p = await k.place();
    const X = await k.region({ name: "X" }, "published");
    await k.affiliate(p.id, X.id);
    await expectCode(status(k, O, p.id), ForbiddenError);
  });

  it("getPlaceAffiliationStatus#10 店舗に店舗管理者がいる。操作する人は、店舗の管理権限を持たないサービス運営者 / 所属地域の状況を確かめる", async () => {
    const { k, p } = await stewardedPlace();
    const O = await k.setupOperator();
    await expectCode(status(k, O, p.id), ForbiddenError);
  });

  it("getPlaceAffiliationStatus#11 操作する人は、店舗の店舗管理者を辞任した / 所属地域の状況を確かめる", async () => {
    const { k, S, p } = await stewardedPlace();
    const other = await k.person("other-steward");
    await k.appoint(k.placeRef(p), other);
    await k.removeSteward(k.placeRef(p), S);
    await expectCode(status(k, S, p.id), ForbiddenError);
  });

  it("getPlaceAffiliationStatus#12 操作する人は、店舗が所属中の地域 X の地域運営者で、店舗の管理権限を持たない。店舗に店舗管理者がいる / 所属地域の状況を確かめる", async () => {
    const { k, p } = await stewardedPlace();
    const X = await k.region({ name: "X" }, "published");
    const R = await k.steward(X.id);
    await k.affiliate(p.id, X.id);
    await expectCode(status(k, R, p.id), ForbiddenError);
  });
});
