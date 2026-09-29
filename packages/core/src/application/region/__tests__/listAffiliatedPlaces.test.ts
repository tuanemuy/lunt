import type { RegionId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { listAffiliatedPlaces } from "../listAffiliatedPlaces";
import { type RegionKit, regionKit } from "./kit";

const list = (k: RegionKit, who: Person, regionId: RegionId) =>
  listAffiliatedPlaces({
    container: k.container,
    actor: who.actor,
    input: { regionId, pagination: { page: 1, limit: 10 } },
  });

/** Region X with its steward R. */
async function stewardedRegion() {
  const k = regionKit();
  const X = await k.region({ name: "X" }, "published");
  const R = await k.steward(X.id);
  return { k, X, R };
}

describe("listAffiliatedPlaces", () => {
  it("listAffiliatedPlaces#1 操作する人が地域運営者。店舗 P（先に所属）と店舗 Q（後に所属）が所属中 / 所属店舗を確かめる", async () => {
    const { k, X, R } = await stewardedRegion();
    const P = await k.place({ name: "店舗P" });
    const Q = await k.place({ name: "店舗Q" });
    await k.affiliate(P.id, X.id);
    await k.affiliate(Q.id, X.id);
    expect(await list(k, R, X.id)).toEqual({
      items: [
        {
          placeId: Q.id,
          name: "店舗Q",
          cover: null,
          operatingStatus: "open",
          suspended: false,
        },
        {
          placeId: P.id,
          name: "店舗P",
          cover: null,
          operatingStatus: "open",
          suspended: false,
        },
      ],
      count: 2,
    });
  });

  it("listAffiliatedPlaces#2 操作する人が地域運営者。所属中の店舗に、閉店した店舗と、非公開の店舗がある / 所属店舗を確かめる", async () => {
    const { k, X, R } = await stewardedRegion();
    const closed = await k.place({ name: "閉店した店" });
    const hidden = await k.place({ name: "非公開の店" });
    await k.setStatus(closed.id, "permanentlyClosed");
    await k.suspend(hidden.id);
    await k.affiliate(closed.id, X.id);
    await k.affiliate(hidden.id, X.id);
    const result = await list(k, R, X.id);
    expect(result.items).toEqual([
      {
        placeId: hidden.id,
        name: "非公開の店",
        cover: null,
        operatingStatus: "open",
        suspended: true,
      },
      {
        placeId: closed.id,
        name: "閉店した店",
        cover: null,
        operatingStatus: "permanentlyClosed",
        suspended: false,
      },
    ]);
  });

  it("listAffiliatedPlaces#3 操作する人が地域運営者。店舗 P は別の地域にも所属中。別の地域にだけ所属する店舗 R がある / 所属店舗を確かめる", async () => {
    const { k, X, R } = await stewardedRegion();
    const other = await k.region({ name: "別の地域" }, "published");
    const P = await k.place({ name: "店舗P" });
    const onlyOther = await k.place({ name: "店舗R" });
    await k.affiliate(P.id, other.id, X.id);
    await k.affiliate(onlyOther.id, other.id);
    const result = await list(k, R, X.id);
    expect(result.items.map((item) => item.placeId)).toEqual([P.id]);
    expect(result.count).toBe(1);
  });

  it("listAffiliatedPlaces#4 操作する人が地域運営者。店舗 P が除外された / 所属店舗を確かめる", async () => {
    const { k, X, R } = await stewardedRegion();
    const P = await k.place({ name: "店舗P" });
    const Q = await k.place({ name: "店舗Q" });
    await k.affiliate(P.id, X.id);
    await k.affiliate(Q.id, X.id);
    await k.exclude(P.id, X.id);
    const result = await list(k, R, X.id);
    expect(result.items.map((item) => item.placeId)).toEqual([Q.id]);
    expect(result.count).toBe(1);
  });

  it("listAffiliatedPlaces#5 操作する人が地域運営者。地域に所属店舗がない / 所属店舗を確かめる", async () => {
    const { k, X, R } = await stewardedRegion();
    expect(await list(k, R, X.id)).toEqual({ items: [], count: 0 });
  });

  it("listAffiliatedPlaces#6 地域に地域運営者がいない。操作する人がサービス運営者 / 所属店舗を確かめる", async () => {
    const k = regionKit();
    const O = await k.setupOperator();
    const X = await k.region({ name: "X" }, "published");
    const P = await k.place({ name: "店舗P" });
    await k.affiliate(P.id, X.id);
    const result = await list(k, O, X.id);
    expect(result.items.map((item) => item.placeId)).toEqual([P.id]);
    expect(result.count).toBe(1);
  });

  it("listAffiliatedPlaces#7 地域に地域運営者がいる。操作する人は、その地域の管理権限を持たないサービス運営者 / 所属店舗を確かめる", async () => {
    const { k, X } = await stewardedRegion();
    const O = await k.setupOperator();
    await expectCode(list(k, O, X.id), ForbiddenError);
  });

  it("listAffiliatedPlaces#8 操作する人が、この地域の管理権限も役割も持たない（所属店舗の店舗管理者を含む） / 所属店舗を確かめる", async () => {
    const { k, X } = await stewardedRegion();
    const P = await k.place({ name: "店舗P" });
    await k.affiliate(P.id, X.id);
    const S = await k.person("place-steward");
    await k.appoint(k.placeRef(P), S);
    const nobody = await k.person("nobody");
    await expectCode(list(k, S, X.id), ForbiddenError);
    await expectCode(list(k, nobody, X.id), ForbiddenError);
  });

  it("authorizes before it checks the pagination: an outsider with an out-of-bounds page is refused as such", async () => {
    const { k, X, R } = await stewardedRegion();
    const nobody = await k.person("nobody");
    const read = (who: Person) =>
      listAffiliatedPlaces({
        container: k.container,
        actor: who.actor,
        input: { regionId: X.id, pagination: { page: 0, limit: 10 } },
      });
    await expectCode(read(nobody), ForbiddenError);
    await expect(read(R)).rejects.toMatchObject({
      code: "COMMON_INVALID_INPUT",
    });
  });
});
