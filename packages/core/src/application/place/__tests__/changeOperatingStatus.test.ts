import { Version } from "@repo/core/domain/common/version";
import { Participation } from "@repo/core/domain/occasion/participation";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import type { Place } from "@repo/core/domain/place/place";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  type Person,
} from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { changeOperatingStatus } from "../changeOperatingStatus";
import { type PlaceKit, placeKit } from "./kit";

const change = (
  k: PlaceKit,
  who: Person,
  place: Place,
  status: OperatingStatus,
  options: Readonly<{ version?: number; container?: RequestContainer }> = {},
) =>
  changeOperatingStatus({
    container: options.container ?? k.container,
    actor: who.actor,
    input: {
      placeId: place.id,
      version: Version.create(options.version ?? place.version),
      status,
    },
  });

/** A place in `status`, stewarded by a fresh person A. */
async function stewardedPlace(
  status: OperatingStatus = "open",
): Promise<Readonly<{ k: PlaceKit; A: Person; p1: Place }>> {
  const k = placeKit();
  const A = await k.person("steward");
  const registered = await k.place();
  const p1 =
    status === "open" ? registered : await k.setStatus(registered.id, status);
  await k.appoint(k.placeRef(p1), A);
  return { k, A, p1 };
}

async function expectUnchanged(k: PlaceKit, place: Place, mark: number) {
  expect(await k.getPlace(place.id)).toEqual(place);
  expect(await k.since(mark)).toEqual([]);
}

const statusChanged = (
  place: Place,
  from: OperatingStatus,
  to: OperatingStatus,
) => ({
  type: "place.operating_status_changed",
  aggregateId: place.id,
  payload: { placeId: place.id, from, to },
});

describe("changeOperatingStatus", () => {
  it("changeOperatingStatus#1 利用者 A は店舗 p1（営業中、版 0）の店舗管理者。p1 に公開中の掲載がある / A が、版 0 を添えて、営業状況を閉店にする", async () => {
    const { k, A, p1 } = await stewardedPlace();
    expect(p1.version).toBe(0);
    const listing = await k.listing(
      p1.id,
      "published",
      await k.photo(await k.setupOperator()),
    );
    const mark = await k.mark();
    const changed = await change(k, A, p1, "permanentlyClosed", { version: 0 });
    const stored = await k.getPlace(p1.id);
    expect(stored).toEqual(changed);
    expect(stored).toMatchObject({
      operatingStatus: "permanentlyClosed",
      version: 1,
      suspension: { suspended: false },
    });
    expect(await k.since(mark)).toMatchObject([
      statusChanged(p1, "open", "permanentlyClosed"),
    ]);
    expect(await k.findListing(listing.id)).toEqual(listing);
  });

  it("changeOperatingStatus#2 利用者 A は店舗 p1（営業中）の店舗管理者 / A が、営業状況を休業にする", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const mark = await k.mark();
    await change(k, A, p1, "temporarilyClosed");
    expect((await k.getPlace(p1.id)).operatingStatus).toBe("temporarilyClosed");
    expect(await k.since(mark)).toMatchObject([
      statusChanged(p1, "open", "temporarilyClosed"),
    ]);
  });

  it("changeOperatingStatus#3 利用者 A は店舗 p1（閉店）の店舗管理者 / A が、営業状況を営業中にする", async () => {
    const { k, A, p1 } = await stewardedPlace("permanentlyClosed");
    const mark = await k.mark();
    await change(k, A, p1, "open");
    expect((await k.getPlace(p1.id)).operatingStatus).toBe("open");
    expect(await k.since(mark)).toMatchObject([
      statusChanged(p1, "permanentlyClosed", "open"),
    ]);
  });

  it("changeOperatingStatus#4 利用者 A は店舗 p1（休業）の店舗管理者 / A が、営業状況を閉店にする", async () => {
    const { k, A, p1 } = await stewardedPlace("temporarilyClosed");
    await change(k, A, p1, "permanentlyClosed");
    expect((await k.getPlace(p1.id)).operatingStatus).toBe("permanentlyClosed");
  });

  it("changeOperatingStatus#5 利用者 A は店舗 p1（休業）の店舗管理者 / A が、営業状況を休業にする（現在と同じ値）", async () => {
    const { k, A, p1 } = await stewardedPlace("temporarilyClosed");
    const mark = await k.mark();
    expect(await change(k, A, p1, "temporarilyClosed")).toEqual(p1);
    await expectUnchanged(k, p1, mark);
  });

  it("changeOperatingStatus#6 店舗 p1（営業中）に店舗管理者がいない。操作する人はサービス運営者 O / O が、営業状況を閉店にする", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    const p1 = await k.place();
    const mark = await k.mark();
    await change(k, O, p1, "permanentlyClosed");
    expect((await k.getPlace(p1.id)).operatingStatus).toBe("permanentlyClosed");
    expect(await k.since(mark)).toMatchObject([
      statusChanged(p1, "open", "permanentlyClosed"),
    ]);
  });

  it("changeOperatingStatus#7 利用者 A は店舗 p1 の店舗管理者。サービス運営者が p1 を非公開にしている / A が、営業状況を休業にする", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const suspended = await k.suspend(p1.id);
    await change(k, A, suspended, "temporarilyClosed");
    expect(await k.getPlace(p1.id)).toMatchObject({
      operatingStatus: "temporarilyClosed",
      suspension: { suspended: true },
    });
  });

  it("changeOperatingStatus#8 店舗 p1 に店舗管理者 A がいる。操作する人は、p1 の店舗管理者でないサービス運営者 O / O が、p1 の営業状況を閉店にする", async () => {
    const { k, p1 } = await stewardedPlace();
    const O = await k.setupOperator();
    const mark = await k.mark();
    await expectCode(change(k, O, p1, "permanentlyClosed"), ForbiddenError);
    await expectUnchanged(k, p1, mark);
  });

  it("changeOperatingStatus#9 店舗 p1 に店舗管理者がいない間にサービス運営者 O が p1 を開き、変更の前に利用者 B が p1 の店舗管理者に就いた / O が、p1 の営業状況を閉店にする", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    const p1 = await k.place();
    const B = await k.person("claimant");
    const mark = await k.mark();
    const racing = commitAfter(k.container, () => k.appoint(k.placeRef(p1), B));
    await expectCode(
      change(k, O, p1, "permanentlyClosed", { container: racing }),
      ForbiddenError,
    );
    await expectUnchanged(k, p1, mark);
  });

  it("changeOperatingStatus#10 利用者 U は、店舗 p1 の店舗管理者でもサービス運営者でもない / U が、p1 の営業状況を閉店にする", async () => {
    const { k, p1 } = await stewardedPlace();
    const U = await k.person();
    const mark = await k.mark();
    await expectCode(change(k, U, p1, "permanentlyClosed"), ForbiddenError);
    await expectUnchanged(k, p1, mark);
  });

  it("changeOperatingStatus#11 店舗 p1 は地域 X に所属している。利用者 R は X の地域運営者で、店舗の管理権限を持たない / R が、p1 の営業状況を休業にする", async () => {
    const { k, p1 } = await stewardedPlace();
    const X = k.region("地域 X");
    await k.container.unitOfWorkProvider.run(
      ({ placeAffiliationsRepository }) =>
        placeAffiliationsRepository.insert(
          PlaceAffiliations.affiliate(
            PlaceAffiliations.empty(p1.id, k.tick()),
            X.id,
            k.tick(),
          ).entity,
        ),
    );
    const R = await k.person("region");
    await k.appoint(X, R);
    const mark = await k.mark();
    await expectCode(change(k, R, p1, "temporarilyClosed"), ForbiddenError);
    await expectUnchanged(k, p1, mark);
  });
  it("changeOperatingStatus#12 店舗 p1 はイベント E に参加している。利用者 V は E のイベント運営者で、店舗の管理権限を持たない / V が、p1 の営業状況を休業にする", async () => {
    const { k, p1 } = await stewardedPlace();
    const E = k.occasion("イベント E");
    await k.container.unitOfWorkProvider.run(({ participationRepository }) =>
      participationRepository.insert(
        Participation.establish(
          {
            key: { occasionId: E.id, placeId: p1.id },
            details: { listingIds: [], dates: [] },
          },
          k.tick(),
        ).entity,
      ),
    );
    const V = await k.person("occasion");
    await k.appoint(E, V);
    const mark = await k.mark();
    await expectCode(change(k, V, p1, "temporarilyClosed"), ForbiddenError);
    await expectUnchanged(k, p1, mark);
  });

  it("a steward of a region or an occasion cannot change a place's status (stage-2 stand-in for #11, #12)", async () => {
    const { k, p1 } = await stewardedPlace();
    const [R, V] = [await k.person("region"), await k.person("occasion")];
    await k.appoint(k.region("地域 X"), R);
    await k.appoint(k.occasion("イベント E"), V);
    const mark = await k.mark();
    await expectCode(change(k, R, p1, "temporarilyClosed"), ForbiddenError);
    await expectCode(change(k, V, p1, "temporarilyClosed"), ForbiddenError);
    await expectUnchanged(k, p1, mark);
  });

  it("changeOperatingStatus#13 利用者 A と B は店舗 p1（営業中、版 0）の店舗管理者。B が先に営業状況を休業にして、版が 1 になった / A が、版 0 を添えて、営業状況を閉店にする", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const B = await k.person("steward-b");
    await k.appoint(k.placeRef(p1), B);
    const byB = await change(k, B, p1, "temporarilyClosed");
    expect(byB.version).toBe(1);
    await expectCode(
      change(k, A, p1, "permanentlyClosed", { version: 0 }),
      ConflictError,
    );
    expect((await k.getPlace(p1.id)).operatingStatus).toBe("temporarilyClosed");
  });

  it("changeOperatingStatus#14 操作する人はサービス運営者 O。ID が p9 の店舗はない / O が、p9 の営業状況を閉店にする", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    await expectCode(
      changeOperatingStatus({
        container: k.container,
        actor: O.actor,
        input: {
          placeId: k.absentPlaceId(),
          version: Version.initial(),
          status: "permanentlyClosed",
        },
      }),
      NotFoundError,
    );
  });

  it("refuses a status outside the list", async () => {
    const { k, A, p1 } = await stewardedPlace();
    await expectCode(
      changeOperatingStatus({
        container: k.container,
        actor: A.actor,
        input: { placeId: p1.id, version: Version.initial(), status: "closed" },
      }),
      Error,
      "PLACE_INVALID_OPERATING_STATUS",
    );
  });
});
