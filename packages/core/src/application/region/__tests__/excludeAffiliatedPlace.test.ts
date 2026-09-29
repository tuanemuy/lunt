import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  type Person,
} from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError, ForbiddenError } from "../../errors";
import { chooseRepresentativeRegion } from "../chooseRepresentativeRegion";
import { excludeAffiliatedPlace } from "../excludeAffiliatedPlace";
import { getPlaceAffiliationStatus } from "../getPlaceAffiliationStatus";
import { listAffiliatedPlaces } from "../listAffiliatedPlaces";
import { type RegionKit, regionKit } from "./kit";

const exclude = (
  k: RegionKit,
  who: Person,
  regionId: RegionId,
  placeId: PlaceId,
  container: RequestContainer = k.container,
) =>
  excludeAffiliatedPlace({
    container,
    actor: who.actor,
    input: { regionId, placeId },
  });

async function storedAffiliations(k: RegionKit, placeId: PlaceId) {
  return (await k.findAffiliations(placeId))?.entity ?? null;
}

/** Region X with steward R, a place p, and regions Y, Z. */
async function world() {
  const k = regionKit();
  const X = await k.region({ name: "X" }, "published");
  const Y = await k.region({ name: "Y" }, "published");
  const Z = await k.region({ name: "Z" }, "published");
  const R = await k.steward(X.id);
  const p = await k.place();
  return { k, X, Y, Z, R, p };
}

describe("excludeAffiliatedPlace", () => {
  it("excludeAffiliatedPlace#1 操作する人が地域 X の運営者。店舗は X だけに所属中 / 店舗を X から除外する", async () => {
    const { k, X, R, p } = await world();
    const S = await k.person("place-steward");
    await k.appoint(k.placeRef(p), S);
    await k.affiliate(p.id, X.id);
    const mark = await k.mark();
    await exclude(k, R, X.id, p.id);
    const stored = await storedAffiliations(k, p.id);
    expect(stored?.affiliations).toEqual([]);
    expect(
      await listAffiliatedPlaces({
        container: k.container,
        actor: R.actor,
        input: { regionId: X.id, pagination: { page: 1, limit: 10 } },
      }),
    ).toEqual({ items: [], count: 0 });
    const status = await getPlaceAffiliationStatus({
      container: k.container,
      actor: S.actor,
      input: { placeId: p.id },
    });
    expect(status.regions).toEqual([]);
    expect(await k.since(mark)).toMatchObject([
      {
        type: "region.affiliation_dissolved",
        aggregateId: p.id,
        payload: { placeId: p.id, regionId: X.id, cause: "excluded" },
      },
    ]);
  });

  it("excludeAffiliatedPlace#2 操作する人が地域 X の運営者。店舗は X と Y に所属中 / 店舗を X から除外する", async () => {
    const { k, X, Y, R, p } = await world();
    const before = await k.affiliate(p.id, X.id, Y.id);
    await exclude(k, R, X.id, p.id);
    const stored = await storedAffiliations(k, p.id);
    expect(stored?.affiliations).toEqual(
      before.affiliations.filter((a) => a.regionId === Y.id),
    );
  });

  it("excludeAffiliatedPlace#3 操作する人が地域 Y の運営者。店舗は X（先に所属）・Y・Z に所属中で、Y を代表地域に選んでいる / 店舗を Y から除外する", async () => {
    const { k, X, Y, Z, p } = await world();
    const RY = await k.steward(Y.id, "steward-of-y");
    await k.affiliate(p.id, X.id, Y.id, Z.id);
    await k.choose(p.id, Y.id);
    await exclude(k, RY, Y.id, p.id);
    const stored = await storedAffiliations(k, p.id);
    expect(stored?.chosenRepresentative).toBeNull();
    expect(stored && PlaceAffiliations.representative(stored)).toBe(X.id);
  });

  it("excludeAffiliatedPlace#4 操作する人が地域 X の運営者。店舗は X と Y に所属中で、Y を代表地域に選んでいる / 店舗を X から除外する", async () => {
    const { k, X, Y, R, p } = await world();
    await k.affiliate(p.id, X.id, Y.id);
    await k.choose(p.id, Y.id);
    await exclude(k, R, X.id, p.id);
    expect((await storedAffiliations(k, p.id))?.chosenRepresentative).toBe(
      Y.id,
    );
  });

  it("excludeAffiliatedPlace#5 操作する人が地域 X の運営者。店舗は X に所属中で、公開中の掲載を持つ / 店舗を X から除外する", async () => {
    const { k, X, R, p } = await world();
    const O = await k.setupOperator();
    const listing = await k.listing(p.id, "published", await k.photo(O));
    await k.affiliate(p.id, X.id);
    const place = await k.getPlace(p.id);
    await exclude(k, R, X.id, p.id);
    expect(await k.getPlace(p.id)).toEqual(place);
    expect(await k.findListing(listing.id)).toEqual(listing);
  });

  it("excludeAffiliatedPlace#6 操作する人が地域 X の運営者。X は unpublished で運営による非公開。店舗は X に所属中 / 店舗を X から除外する", async () => {
    const k = regionKit();
    const X = await k.region({ name: "X" }, "unpublished", {
      suspended: true,
    });
    const R = await k.steward(X.id);
    const p = await k.place();
    await k.affiliate(p.id, X.id);
    await exclude(k, R, X.id, p.id);
    expect((await storedAffiliations(k, p.id))?.affiliations).toEqual([]);
  });

  it("excludeAffiliatedPlace#7 地域 X に地域運営者がいない。操作する人がサービス運営者。店舗は X に所属中 / 店舗を X から除外する", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const X = await k.region({ name: "X" }, "published");
    const p = await k.place();
    await k.affiliate(p.id, X.id);
    const mark = await k.mark();
    await exclude(k, O, X.id, p.id);
    expect((await storedAffiliations(k, p.id))?.affiliations).toEqual([]);
    expect(await k.since(mark)).toMatchObject([
      {
        type: "region.affiliation_dissolved",
        payload: { placeId: p.id, regionId: X.id, cause: "excluded" },
      },
    ]);
  });

  it("excludeAffiliatedPlace#8 操作する人が地域 X の運営者。店舗の X との所属は、別の運営者の除外ですでに解除されている / 店舗を X から除外する", async () => {
    const { k, X, Y, R, p } = await world();
    await k.affiliate(p.id, X.id, Y.id);
    const before = await k.exclude(p.id, X.id);
    const mark = await k.mark();
    await expectCode(
      exclude(k, R, X.id, p.id),
      BusinessRuleError,
      "REGION_NOT_AFFILIATED",
    );
    expect(await storedAffiliations(k, p.id)).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("excludeAffiliatedPlace#9 地域 X に地域運営者がいる。操作する人は、X の管理権限を持たないサービス運営者 / 店舗を X から除外する", async () => {
    const { k, X, p } = await world();
    const O = await k.setupOperator();
    const before = await k.affiliate(p.id, X.id);
    await expectCode(exclude(k, O, X.id, p.id), ForbiddenError);
    expect(await storedAffiliations(k, p.id)).toEqual(before);
  });

  it("excludeAffiliatedPlace#10 操作する人は、所属中の店舗の店舗管理者で、X の管理権限を持たない / 店舗を X から除外する", async () => {
    const { k, X, p } = await world();
    const S = await k.person("place-steward");
    await k.appoint(k.placeRef(p), S);
    const before = await k.affiliate(p.id, X.id);
    await expectCode(exclude(k, S, X.id, p.id), ForbiddenError);
    expect(await storedAffiliations(k, p.id)).toEqual(before);
  });

  it("excludeAffiliatedPlace#11 操作する人が地域 X の運営者。除外と、同じ店舗の代表地域の選択が同時に確定する / 店舗を X から除外する", async () => {
    const { k, X, Y, R, p } = await world();
    const S = await k.person("place-steward");
    await k.appoint(k.placeRef(p), S);
    await k.affiliate(p.id, X.id, Y.id);
    const mark = await k.mark();
    const racing = commitAfter(k.container, () =>
      chooseRepresentativeRegion({
        container: k.container,
        actor: S.actor,
        input: { placeId: p.id, regionId: Y.id },
      }),
    );
    await expectCode(exclude(k, R, X.id, p.id, racing), ConflictError);
    const stored = await storedAffiliations(k, p.id);
    expect(stored?.affiliations.map((a) => a.regionId)).toEqual([X.id, Y.id]);
    expect(stored?.chosenRepresentative).toBe(Y.id);
    expect(await k.since(mark)).toEqual([]);
  });
});
