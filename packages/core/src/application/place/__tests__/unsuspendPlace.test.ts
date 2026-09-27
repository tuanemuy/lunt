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
import { changeOperatingStatus } from "../changeOperatingStatus";
import { matchPlaces } from "../matchPlaces";
import { unsuspendPlace } from "../unsuspendPlace";
import { updatePlaceProfile } from "../updatePlaceProfile";
import { type PlaceKit, placeKit, profileFields } from "./kit";

const unsuspend = (
  k: PlaceKit,
  who: Person,
  place: Pick<Place, "id">,
  container: RequestContainer = k.container,
) =>
  unsuspendPlace({ container, actor: who.actor, input: { placeId: place.id } });

async function suspendedPlace() {
  const k = placeKit();
  const O = await k.setupOperator();
  const registered = await k.place();
  const p1 = await k.suspend(registered.id);
  return { k, O, p1 };
}

describe("unsuspendPlace", () => {
  it("unsuspendPlace#1 店舗 p1 は非公開。操作する人はサービス運営者 O / O が p1 の非公開を解除する", async () => {
    const { k, O, p1 } = await suspendedPlace();
    const mark = await k.mark();
    const lifted = await unsuspend(k, O, p1);
    const stored = await k.getPlace(p1.id);
    expect(stored).toEqual(lifted);
    expect(stored.suspension).toEqual({ suspended: false });
    expect(stored.version).toBe(p1.version + 1);
    expect(await k.since(mark)).toMatchObject([
      {
        type: "place.unsuspended",
        aggregateId: p1.id,
        payload: { placeId: p1.id },
      },
    ]);
    const found = await matchPlaces({
      container: k.container,
      input: {
        name: "山田珈琲店",
        address: null,
        pagination: { page: 1, limit: 10 },
      },
    });
    expect(found.items.map((item) => item.placeId)).toEqual([p1.id]);
  });

  it("unsuspendPlace#2 店舗 p1 は非公開。非公開の間に、店舗管理者 A が名称を変え、営業状況を休業にした。操作する人はサービス運営者 O / O が p1 の非公開を解除する", async () => {
    const { k, O, p1 } = await suspendedPlace();
    const A = await k.person("steward");
    await k.appoint(k.placeRef(p1), A);
    const renamed = await updatePlaceProfile({
      container: k.container,
      actor: A.actor,
      input: {
        placeId: p1.id,
        version: Version.create(p1.version),
        profile: profileFields({ name: "非公開の間の名前" }),
      },
    });
    await changeOperatingStatus({
      container: k.container,
      actor: A.actor,
      input: {
        placeId: p1.id,
        version: renamed.version,
        status: "temporarilyClosed",
      },
    });
    await unsuspend(k, O, p1);
    const stored = await k.getPlace(p1.id);
    expect(stored.suspension).toEqual({ suspended: false });
    expect(stored.profile.name).toBe("非公開の間の名前");
    expect(stored.operatingStatus).toBe("temporarilyClosed");
  });

  it("unsuspendPlace#3 店舗 p1 は非公開でない（別のサービス運営者が先に解除した）。操作する人はサービス運営者 O / O が p1 の非公開を解除する", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    const p1 = await k.place();
    const mark = await k.mark();
    await expectCode(
      unsuspend(k, O, p1),
      BusinessRuleError,
      "PLACE_NOT_SUSPENDED",
    );
    expect(await k.getPlace(p1.id)).toEqual(p1);
    expect(await k.since(mark)).toEqual([]);
  });

  it("unsuspendPlace#4 店舗 p1 は非公開。利用者 A は p1 の店舗管理者で、サービス運営者の役割を持たない / A が p1 の非公開を解除する", async () => {
    const { k, p1 } = await suspendedPlace();
    const A = await k.person("steward");
    await k.appoint(k.placeRef(p1), A);
    await expectCode(unsuspend(k, A, p1), ForbiddenError);
    expect((await k.getPlace(p1.id)).suspension).toEqual({ suspended: true });
  });

  it("unsuspendPlace#5 操作する人はサービス運営者 O。ID が p9 の店舗はない / O が p9 の非公開を解除する", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    await expectCode(unsuspend(k, O, { id: k.absentPlaceId() }), NotFoundError);
  });

  it("unsuspendPlace#6 店舗 p1 は非公開。サービス運営者 O が解除する操作と、店舗管理者 A の p1 の店舗情報の更新が同時に確定する / O が p1 の非公開を解除する", async () => {
    const { k, O, p1 } = await suspendedPlace();
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
          version: Version.create(p1.version),
          profile: profileFields({ name: "同時に直した名前" }),
        },
      });
    });
    await expectCode(unsuspend(k, O, p1, racing), ConflictError);
    const stored = await k.getPlace(p1.id);
    expect(stored).toEqual(byA);
    expect(stored.suspension).toEqual({ suspended: true });
    expect(await k.since(mark)).toEqual([]);
  });
});
