import { regionContent } from "@repo/core/adapters/do/__conformance__/regionFixtures";
import type { PhotoId, PlaceId } from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { Place } from "@repo/core/domain/place/place";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { getManagedPlace } from "../getManagedPlace";
import { updatePlaceProfile } from "../updatePlaceProfile";
import { type PlaceKit, placeKit, profileFields } from "./kit";

const read = (k: PlaceKit, who: Person, placeId: PlaceId) =>
  getManagedPlace({
    container: k.container,
    actor: who.actor,
    input: { placeId },
  });

async function stewardedPlace(photos = 0) {
  const k = placeKit();
  const O = await k.setupOperator();
  const photoIds: PhotoId[] = [];
  for (let i = 0; i < photos; i += 1) photoIds.push(await k.photo(O));
  const p1 = await k.place({
    photoIds,
    description: "紹介",
    businessHours: "10:00-18:00",
    contact: "03-0000-0000",
  });
  const A = await k.person("steward");
  await k.appoint(k.placeRef(p1), A);
  return { k, O, A, p1, photoIds };
}

/** p1 with photos ph1, ph2 of which ph1 was taken down on a claim. */
async function takenDown() {
  const s = await stewardedPlace(2);
  const [ph1, ph2] = s.photoIds as [PhotoId, PhotoId];
  const p1 = await s.k.writePlace(
    s.p1.id,
    (place) => Place.takeDownPhotos(place, [ph1], s.k.tick()).entity,
  );
  return { ...s, p1, ph1, ph2 };
}

const saveProfile = (
  k: PlaceKit,
  who: Person,
  place: Place,
  overrides: Parameters<typeof profileFields>[0],
) =>
  updatePlaceProfile({
    container: k.container,
    actor: who.actor,
    input: {
      placeId: place.id,
      version: Version.create(place.version),
      profile: profileFields({
        description: "紹介",
        businessHours: "10:00-18:00",
        contact: "03-0000-0000",
        ...overrides,
      }),
    },
  });

describe("getManagedPlace", () => {
  it("getManagedPlace#1 利用者 A は店舗 p1 の店舗管理者。p1 は写真2枚、営業中、非公開でない / A が p1 を読む", async () => {
    const { k, A, p1, photoIds } = await stewardedPlace(2);
    const view = await read(k, A, p1.id);
    expect(view.place).toEqual(p1);
    expect(view.place.profile).toMatchObject({
      name: "山田珈琲店",
      description: "紹介",
      visitInfo: { businessHours: "10:00-18:00", contact: "03-0000-0000" },
    });
    expect(view.photos.map((photo) => photo.photoId)).toEqual(photoIds);
    expect(view.photos.every((photo) => photo.displayRef.url.length > 0)).toBe(
      true,
    );
    expect(view).toMatchObject({
      suspended: false,
      photosTakenDown: false,
      hasSteward: true,
      management: { allowed: true, basis: "steward" },
      regions: [],
    });
    expect(view.place.operatingStatus).toBe("open");
  });

  it("getManagedPlace#2 利用者 A は店舗 p1 の店舗管理者。p1 は地域 X に、次に地域 Y に所属している / A が、掲載の作成を始めるために p1 を読む", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const [X, Y] = ["谷中", "根津"].map(
      (name) =>
        Region.register(
          { id: k.region(name).id, content: regionContent({ name }) },
          k.tick(),
        ).entity,
    );
    if (X === undefined || Y === undefined) throw new Error("two regions");
    await k.container.unitOfWorkProvider.run(
      async ({ regionRepository, placeAffiliationsRepository }) => {
        await regionRepository.insert(Y);
        await regionRepository.insert(X);
        const intoX = PlaceAffiliations.affiliate(
          PlaceAffiliations.empty(p1.id, k.tick()),
          X.id,
          k.tick(),
        ).entity;
        await placeAffiliationsRepository.insert(
          PlaceAffiliations.affiliate(intoX, Y.id, k.tick()).entity,
        );
      },
    );
    const view = await read(k, A, p1.id);
    expect(view.place.profile.address).toEqual(p1.profile.address);
    expect(view.regions).toEqual([
      { id: X.id, name: "谷中" },
      { id: Y.id, name: "根津" },
    ]);
  });

  it("getManagedPlace#3 利用者 A は店舗 p1 の店舗管理者。p1 はどの地域にも所属していない / A が p1 を読む", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const view = await read(k, A, p1.id);
    expect(view.regions).toEqual([]);
    expect(view.place.profile.address).toEqual(p1.profile.address);
  });

  it("getManagedPlace#4 利用者 A は店舗 p1 の店舗管理者。サービス運営者が p1 を非公開にしている / A が p1 を読む", async () => {
    const { k, A, p1 } = await stewardedPlace();
    const suspended = await k.suspend(p1.id);
    const view = await read(k, A, p1.id);
    expect(view.place).toEqual(suspended);
    expect(view.suspended).toBe(true);
    expect(view.management).toEqual({ allowed: true, basis: "steward" });
  });

  it("getManagedPlace#5 店舗 p1 に店舗管理者がいない。操作する人はサービス運営者 O / O が p1 を読む", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    const p1 = await k.place();
    const view = await read(k, O, p1.id);
    expect(view.place).toEqual(p1);
    expect(view.hasSteward).toBe(false);
    expect(view.management).toEqual({ allowed: true, basis: "absence_proxy" });
  });

  it("getManagedPlace#6 店舗 p1 に店舗管理者 A がいる。操作する人は、p1 の店舗管理者でないサービス運営者 O / O が p1 を読む", async () => {
    const { k, O, p1 } = await stewardedPlace();
    const view = await read(k, O, p1.id);
    expect(view.place).toEqual(p1);
    expect(view.suspended).toBe(false);
    expect(view.hasSteward).toBe(true);
    expect(view.management).toEqual({ allowed: false });
  });

  it("getManagedPlace#7 店舗 p1 は非公開で、店舗管理者 A がいる。操作する人は、p1 の店舗管理者でないサービス運営者 O / O が p1 を読む", async () => {
    const { k, O, p1 } = await stewardedPlace();
    await k.suspend(p1.id);
    const view = await read(k, O, p1.id);
    expect(view.suspended).toBe(true);
    expect(view.hasSteward).toBe(true);
  });

  it("getManagedPlace#8 店舗 p1 に店舗管理者 A がいる。利用者 U は、p1 の店舗管理者でもサービス運営者でもない / U が p1 を読む", async () => {
    const { k, p1 } = await stewardedPlace();
    const U = await k.person();
    await expectCode(read(k, U, p1.id), ForbiddenError);
  });

  it("getManagedPlace#9 利用者 A は店舗 p1 の店舗管理者だったが、サービス運営者に権限を解除された / A が p1 を読む", async () => {
    const { k, A, p1 } = await stewardedPlace();
    await k.removeSteward(k.placeRef(p1), A);
    await expectCode(read(k, A, p1.id), ForbiddenError);
  });

  it("getManagedPlace#10 利用者 A は店舗 p1 の店舗管理者。店舗 p2 の店舗管理者ではない（p2 には別の店舗管理者がいる） / A が p2 を読む", async () => {
    const { k, A } = await stewardedPlace();
    const p2 = await k.place({ name: "別の店" });
    await k.appoint(k.placeRef(p2), await k.person("other"));
    await expectCode(read(k, A, p2.id), ForbiddenError);
  });

  it("getManagedPlace#11 利用者 A は店舗 p1 の店舗管理者。p1 の写真 ph1、ph2 のうち ph1 が申立てで削除された / A が p1 を読む", async () => {
    const { k, A, p1, ph2 } = await takenDown();
    const view = await read(k, A, p1.id);
    expect(view.photosTakenDown).toBe(true);
    expect(view.photos.map((photo) => photo.photoId)).toEqual([ph2]);
  });

  it("getManagedPlace#12 上の p1 で、A が写真を変えずに紹介だけを保存した / A が p1 を読む", async () => {
    const { k, A, p1, ph2 } = await takenDown();
    await saveProfile(k, A, p1, {
      photoIds: [ph2],
      description: "紹介だけ直した",
    });
    const view = await read(k, A, p1.id);
    expect(view.place.profile.description).toBe("紹介だけ直した");
    expect(view.photosTakenDown).toBe(true);
  });

  it("getManagedPlace#13 上の p1 で、A が写真の並びを変えて保存した / A が p1 を読む", async () => {
    const { k, A, p1, ph2 } = await takenDown();
    const ph3 = await k.photo(A);
    await saveProfile(k, A, p1, { photoIds: [ph3, ph2] });
    const view = await read(k, A, p1.id);
    expect(view.photosTakenDown).toBe(false);
    expect(view.photos.map((photo) => photo.photoId)).toEqual([ph3, ph2]);
  });

  it("getManagedPlace#14 操作する人はサービス運営者 O。ID が p9 の店舗はない / O が p9 を読む", async () => {
    const k = placeKit();
    const O = await k.setupOperator();
    await expectCode(read(k, O, k.absentPlaceId()), NotFoundError);
  });
});
