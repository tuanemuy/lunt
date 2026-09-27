import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError } from "@repo/core/domain/error";
import type { Place } from "@repo/core/domain/place/place";
import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  type Person,
} from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { matchPlaces } from "../matchPlaces";
import { matchPlacesForOperation } from "../matchPlacesForOperation";
import { suspendPlace } from "../suspendPlace";
import { updatePlaceProfile } from "../updatePlaceProfile";
import { type PlaceKit, placeKit, profileFields } from "./kit";

const suspend = (
  k: PlaceKit,
  who: Person,
  place: Pick<Place, "id">,
  container: RequestContainer = k.container,
) =>
  suspendPlace({ container, actor: who.actor, input: { placeId: place.id } });

async function operatorAndPlace() {
  const k = placeKit();
  const O = await k.setupOperator();
  const p1 = await k.place();
  return { k, O, p1 };
}

describe("suspendPlace", () => {
  it("suspendPlace#1 店舗 p1（営業中、店舗管理者 A がいる、公開中の掲載がある）がある。操作する人は、p1 の店舗管理者でないサービス運営者 O / O が p1 を非公開にする", async () => {
    const { k, O, p1 } = await operatorAndPlace();
    const A = await k.person("steward");
    await k.appoint(k.placeRef(p1), A);
    const listing = await k.listing(p1.id, "published", await k.photo(O));
    const stewardship = await k.findStewardship(k.placeRef(p1));
    const mark = await k.mark();
    const suspended = await suspend(k, O, p1);
    const stored = await k.getPlace(p1.id);
    expect(stored).toEqual(suspended);
    expect(stored.suspension).toEqual({ suspended: true });
    expect(stored.version).toBe(p1.version + 1);
    expect(stored.profile).toEqual(p1.profile);
    expect(stored.operatingStatus).toBe("open");
    expect(await k.since(mark)).toMatchObject([
      {
        type: "place.suspended",
        aggregateId: p1.id,
        payload: { placeId: p1.id },
      },
    ]);
    expect(await k.findStewardship(k.placeRef(p1))).toEqual(stewardship);
    expect(await k.findListing(listing.id)).toEqual(listing);
    expect(
      await matchPlaces({
        container: k.container,
        input: {
          name: "山田珈琲店",
          address: null,
          pagination: { page: 1, limit: 10 },
        },
      }),
    ).toEqual({ items: [], count: 0 });
  });

  it("suspendPlace#2 店舗 p1 に店舗管理者がいない。操作する人はサービス運営者 O / O が p1 を非公開にする", async () => {
    const { k, O, p1 } = await operatorAndPlace();
    await suspend(k, O, p1);
    expect((await k.getPlace(p1.id)).suspension).toEqual({ suspended: true });
  });

  it("suspendPlace#3 店舗 p1（版 0）がある。サービス運営者 O が p1 を開いた後、店舗管理者 A が店舗情報を更新して、版が 1 になった / O が p1 を非公開にする", async () => {
    const { k, O, p1 } = await operatorAndPlace();
    const A = await k.person("steward");
    await k.appoint(k.placeRef(p1), A);
    expect(p1.version).toBe(0);
    const byA = await updatePlaceProfile({
      container: k.container,
      actor: A.actor,
      input: {
        placeId: p1.id,
        version: Version.initial(),
        profile: profileFields({ name: "A が直した名前" }),
      },
    });
    expect(byA.version).toBe(1);
    await suspend(k, O, p1);
    const stored = await k.getPlace(p1.id);
    expect(stored.suspension).toEqual({ suspended: true });
    expect(stored.profile).toEqual(byA.profile);
  });

  it("suspendPlace#4 店舗 p1 は閉店している。操作する人はサービス運営者 O / O が p1 を非公開にする", async () => {
    const { k, O, p1 } = await operatorAndPlace();
    await k.setStatus(p1.id, "permanentlyClosed");
    await suspend(k, O, p1);
    expect(await k.getPlace(p1.id)).toMatchObject({
      operatingStatus: "permanentlyClosed",
      suspension: { suspended: true },
    });
  });

  it("suspendPlace#5 同じ店舗が p1 と p2 に重複して登録されている。p2 に公開中の掲載がある。操作する人はサービス運営者 O / O が、残す店舗を p1 と決めて、p2 を非公開にする", async () => {
    const { k, O, p1 } = await operatorAndPlace();
    const p2 = await k.place();
    const listing = await k.listing(p2.id, "published", await k.photo(O));
    await suspend(k, O, p2);
    expect(await k.getPlace(p1.id)).toEqual(p1);
    expect(await k.findListing(listing.id)).toEqual(listing);
    expect(listing.placeId).toBe(p2.id);
    expect((await k.getPlace(p2.id)).suspension).toEqual({ suspended: true });
    const found = await matchPlacesForOperation({
      container: k.container,
      actor: O.actor,
      input: {
        name: "山田珈琲店",
        address: null,
        pagination: { page: 1, limit: 10 },
      },
    });
    expect(found.items).toMatchObject([
      { placeId: p1.id, suspended: false },
      { placeId: p2.id, suspended: true },
    ]);
  });

  it("suspendPlace#6 店舗 p1 はすでに非公開（別のサービス運営者が先に非公開にした）。操作する人はサービス運営者 O / O が p1 を非公開にする", async () => {
    const { k, O, p1 } = await operatorAndPlace();
    const suspended = await k.suspend(p1.id);
    const mark = await k.mark();
    await expectCode(
      suspend(k, O, p1),
      BusinessRuleError,
      "PLACE_ALREADY_SUSPENDED",
    );
    expect(await k.getPlace(p1.id)).toEqual(suspended);
    expect(await k.since(mark)).toEqual([]);
  });

  it("suspendPlace#7 利用者 A は店舗 p1 の店舗管理者で、サービス運営者の役割を持たない / A が p1 を非公開にする", async () => {
    const { k, p1 } = await operatorAndPlace();
    const A = await k.person("steward");
    await k.appoint(k.placeRef(p1), A);
    await expectCode(suspend(k, A, p1), ForbiddenError);
    expect((await k.getPlace(p1.id)).suspension).toEqual({ suspended: false });
  });

  it("suspendPlace#8 操作する人はサービス運営者 O。ID が p9 の店舗はない / O が p9 を非公開にする", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    await expectCode(suspend(k, O, { id: k.absentPlaceId() }), NotFoundError);
  });

  it("suspendPlace#9 店舗 p1 がある。サービス運営者 O が非公開にする操作と、店舗管理者 A の p1 の店舗情報の更新が同時に確定する / O が p1 を非公開にする", async () => {
    const { k, O, p1 } = await operatorAndPlace();
    const A = await k.person("steward");
    await k.appoint(k.placeRef(p1), A);
    const mark = await k.mark();
    let byA: Place | null = null;
    const racing = commitAfter(k.container, async () => {
      byA = await updatePlaceProfile({
        container: k.container,
        actor: A.actor,
        input: {
          placeId: p1.id,
          version: Version.initial(),
          profile: profileFields({ name: "同時に直した名前" }),
        },
      });
    });
    await expectCode(suspend(k, O, p1, racing), ConflictError);
    expect(await k.getPlace(p1.id)).toEqual(byA);
    expect((await k.since(mark)).map((event) => event.type)).toEqual([]);
  });
});
