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
import { type RegionKit, regionKit } from "./kit";

const choose = (
  k: RegionKit,
  who: Person,
  placeId: PlaceId,
  regionId: RegionId,
  container: RequestContainer = k.container,
) =>
  chooseRepresentativeRegion({
    container,
    actor: who.actor,
    input: { placeId, regionId },
  });

/** A place stewarded by S and two draft regions X, Y (not yet affiliated). */
async function stewardedPlace() {
  const k = regionKit();
  const S = await k.person("place-steward");
  const p = await k.place();
  await k.appoint(k.placeRef(p), S);
  const X = await k.region({ name: "X" });
  const Y = await k.region({ name: "Y" });
  return { k, S, p, X, Y };
}

async function storedAffiliations(k: RegionKit, placeId: PlaceId) {
  return (await k.findAffiliations(placeId))?.entity ?? null;
}

describe("chooseRepresentativeRegion", () => {
  it("chooseRepresentativeRegion#1 操作する人が店舗管理者。店舗は地域 X（先に所属）と地域 Y（後に所属）に所属中で、代表地域を選んでいない / Y を代表地域に選ぶ", async () => {
    const { k, S, p, X, Y } = await stewardedPlace();
    const before = await k.affiliate(p.id, X.id, Y.id);
    const mark = await k.mark();
    expect(await choose(k, S, p.id, Y.id)).toBe(Y.id);
    const stored = await storedAffiliations(k, p.id);
    expect(stored?.chosenRepresentative).toBe(Y.id);
    expect(stored?.affiliations).toEqual(before.affiliations);
    expect(stored && PlaceAffiliations.representative(stored)).toBe(Y.id);
    expect(await k.since(mark)).toEqual([]);
  });

  it("chooseRepresentativeRegion#2 操作する人が店舗管理者。店舗は X・Y に所属中で、Y を選んでいる / X を代表地域に選ぶ", async () => {
    const { k, S, p, X, Y } = await stewardedPlace();
    await k.affiliate(p.id, X.id, Y.id);
    await k.choose(p.id, Y.id);
    expect(await choose(k, S, p.id, X.id)).toBe(X.id);
    expect((await storedAffiliations(k, p.id))?.chosenRepresentative).toBe(
      X.id,
    );
  });

  it("chooseRepresentativeRegion#3 操作する人が店舗管理者。店舗は X（先に所属）・Y に所属中で、代表地域を選んでいない / X を代表地域に選ぶ", async () => {
    const { k, S, p, X, Y } = await stewardedPlace();
    const before = await k.affiliate(p.id, X.id, Y.id);
    await expectCode(
      choose(k, S, p.id, X.id),
      BusinessRuleError,
      "REGION_REPRESENTATIVE_ALREADY_CHOSEN",
    );
    const stored = await storedAffiliations(k, p.id);
    expect(stored).toEqual(before);
    expect(stored?.chosenRepresentative).toBeNull();
  });

  it("chooseRepresentativeRegion#4 操作する人が店舗管理者。店舗は X・Y に所属中で、Y を選んでいる（別の画面で先に選んだ） / Y を代表地域に選ぶ", async () => {
    const { k, S, p, X, Y } = await stewardedPlace();
    await k.affiliate(p.id, X.id, Y.id);
    const before = await k.choose(p.id, Y.id);
    await expectCode(
      choose(k, S, p.id, Y.id),
      BusinessRuleError,
      "REGION_REPRESENTATIVE_ALREADY_CHOSEN",
    );
    expect(await storedAffiliations(k, p.id)).toEqual(before);
  });

  it("chooseRepresentativeRegion#5 操作する人が店舗管理者。店舗は X・Y に所属中。Y は unpublished / Y を代表地域に選ぶ", async () => {
    const k = regionKit();
    const S = await k.person("place-steward");
    const p = await k.place();
    await k.appoint(k.placeRef(p), S);
    const X = await k.region({ name: "X" }, "published");
    const Y = await k.region({ name: "Y" }, "unpublished");
    await k.affiliate(p.id, X.id, Y.id);
    await choose(k, S, p.id, Y.id);
    expect((await storedAffiliations(k, p.id))?.chosenRepresentative).toBe(
      Y.id,
    );
  });

  it("chooseRepresentativeRegion#6 操作する人が店舗管理者。店舗は X・Y に所属中。Y は運営による非公開 / Y を代表地域に選ぶ", async () => {
    const k = regionKit();
    const S = await k.person("place-steward");
    const p = await k.place();
    await k.appoint(k.placeRef(p), S);
    const X = await k.region({ name: "X" }, "published");
    const Y = await k.region({ name: "Y" }, "published", { suspended: true });
    await k.affiliate(p.id, X.id, Y.id);
    await choose(k, S, p.id, Y.id);
    expect((await storedAffiliations(k, p.id))?.chosenRepresentative).toBe(
      Y.id,
    );
  });

  it("chooseRepresentativeRegion#7 操作する人が店舗管理者。店舗は X に所属中。Y との所属は、選ぶまでの間に除外で解除された / Y を代表地域に選ぶ", async () => {
    const { k, S, p, X, Y } = await stewardedPlace();
    await k.affiliate(p.id, X.id, Y.id);
    const before = await k.exclude(p.id, Y.id);
    await expectCode(
      choose(k, S, p.id, Y.id),
      BusinessRuleError,
      "REGION_NOT_AFFILIATED",
    );
    expect(await storedAffiliations(k, p.id)).toEqual(before);
  });

  it("chooseRepresentativeRegion#8 操作する人が店舗管理者。店舗に所属の記録がない / X を代表地域に選ぶ", async () => {
    const { k, S, p, X } = await stewardedPlace();
    await expectCode(
      choose(k, S, p.id, X.id),
      BusinessRuleError,
      "REGION_NOT_AFFILIATED",
    );
    expect(await k.findAffiliations(p.id)).toBeNull();
  });

  it("chooseRepresentativeRegion#9 店舗に店舗管理者がいない。操作する人がサービス運営者。店舗は X・Y に所属中 / Y を代表地域に選ぶ", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const p = await k.place();
    const X = await k.region({ name: "X" });
    const Y = await k.region({ name: "Y" });
    const before = await k.affiliate(p.id, X.id, Y.id);
    await expectCode(choose(k, O, p.id, Y.id), ForbiddenError);
    expect(await storedAffiliations(k, p.id)).toEqual(before);
  });

  it("chooseRepresentativeRegion#10 店舗に店舗管理者がいる。操作する人は、店舗の管理権限を持たないサービス運営者 / Y を代表地域に選ぶ", async () => {
    const { k, p, X, Y } = await stewardedPlace();
    const O = await k.setupOperator();
    const before = await k.affiliate(p.id, X.id, Y.id);
    await expectCode(choose(k, O, p.id, Y.id), ForbiddenError);
    expect(await storedAffiliations(k, p.id)).toEqual(before);
  });

  it("chooseRepresentativeRegion#11 操作する人は、店舗が所属中の地域 X の運営者で、店舗の管理権限を持たない。店舗に店舗管理者がいる / X を代表地域に選ぶ", async () => {
    const { k, p, X, Y } = await stewardedPlace();
    const R = await k.steward(X.id);
    const before = await k.affiliate(p.id, Y.id, X.id);
    await expectCode(choose(k, R, p.id, X.id), ForbiddenError);
    expect(await storedAffiliations(k, p.id)).toEqual(before);
  });

  it("chooseRepresentativeRegion#12 操作する人が店舗管理者。代表地域を選ぶ操作と、同じ店舗の別の地域からの除外が同時に確定する / Y を代表地域に選ぶ", async () => {
    const { k, S, p, X, Y } = await stewardedPlace();
    const R = await k.steward(X.id);
    await k.affiliate(p.id, X.id, Y.id);
    const racing = commitAfter(k.container, () =>
      excludeAffiliatedPlace({
        container: k.container,
        actor: R.actor,
        input: { regionId: X.id, placeId: p.id },
      }),
    );
    await expectCode(choose(k, S, p.id, Y.id, racing), ConflictError);
    const stored = await storedAffiliations(k, p.id);
    expect(stored?.affiliations.map((a) => a.regionId)).toEqual([Y.id]);
    expect(stored?.chosenRepresentative).toBeNull();
  });
});
