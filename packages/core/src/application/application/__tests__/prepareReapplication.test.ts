import type { ApplicationId, PhotoId } from "@repo/core/domain/common/ids";
import { ApplicationId as ApplicationIds } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { Place } from "@repo/core/domain/place/place";
import { PlaceProfile } from "@repo/core/domain/place/profile";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import {
  prepareReapplication,
  type Reapplication,
} from "../prepareReapplication";
import { type AppKit, applicationKit, profileFields } from "./kit";

const prepare = (k: AppKit, who: Person, applicationId: ApplicationId) =>
  prepareReapplication({
    container: k.container,
    actor: who.actor,
    input: { applicationId },
  });

/** The counter of a `FakeIdGenerator` id. */
const serial = (id: string): number => Number.parseInt(id.slice(-12), 16);

/** Runs `act` and expects it minted no id — no photo was duplicated. */
async function expectNoDuplicate(k: AppKit, act: Promise<unknown>) {
  const before = serial(k.t.idGenerator.next());
  await act.catch(() => undefined);
  expect(serial(k.t.idGenerator.next())).toBe(before + 1);
}

async function photoAsset(k: AppKit, id: PhotoId) {
  const found = await k.run(({ photoAssetRepository }) =>
    photoAssetRepository.findById(id),
  );
  if (found === null) throw new Error(`no photo ${id}`);
  return found.entity;
}

const listingPhotos = (r: Reapplication) => {
  if (r.content.kind !== "listing") throw new Error(r.content.kind);
  return r.content.content.photos.items;
};

describe("prepareReapplication", () => {
  it("prepareReapplication#1 利用者 A の掲載の申請 a1（店舗 p1、写真 ph1・ph2、名称、カテゴリー c1）が否認になっている / A が a1 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const c1 = await k.category("食べる");
    const [ph1, ph2] = await k.photos(A, 2);
    if (ph1 === undefined || ph2 === undefined) throw new Error("photos");
    const framing = { x: 0, y: 0, width: 0.5, height: 0.5 };
    const a1 = await k.newListing(A, p1, {
      photos: [{ photoId: ph1, framing }, ph2],
      name: "季節のパフェ",
      categoryId: c1,
    });
    const rejected = await k.reject(a1.id);
    const mark = await k.mark();
    const r = await prepare(k, A, a1.id);
    expect(r.target).toEqual(a1.target);
    if (r.content.kind !== "listing") throw new Error("kind");
    expect(r.content.content).toMatchObject({
      name: "季節のパフェ",
      categoryId: c1,
    });
    const [d1, d2] = listingPhotos(r);
    if (d1 === undefined || d2 === undefined) throw new Error("duplicates");
    expect([d1.framing, d2.framing]).toEqual([framing, null]);
    expect([d1.photoId, d2.photoId]).not.toContain(ph1);
    expect([d1.photoId, d2.photoId]).not.toContain(ph2);
    expect(r.photos.map((p) => p.photoId)).toEqual([d1.photoId, d2.photoId]);
    expect(r.photos.every((p) => p.displayRef !== undefined)).toBe(true);
    for (const [source, duplicate] of [
      [ph1, d1.photoId],
      [ph2, d2.photoId],
    ] as const) {
      const copy = await photoAsset(k, duplicate);
      expect(copy.registeredBy).toBe(A.accountId);
      expect(copy.consentedAt).toEqual(
        (await photoAsset(k, source)).consentedAt,
      );
      expect(copy.stage).toBe("stored");
      expect(await k.photoOwner(duplicate)).toBeNull();
      expect(await k.photoOwner(source)).toEqual(k.applicationOwner(a1.id));
    }
    expect(await k.app(a1.id)).toEqual(rejected);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("prepareReapplication#2 A の登録申請 r1（写真 ph1）が取り下げになっている / A が r1 から再申請の内容を用意し、返った内容で、別の ID r2 で登録を申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const ph1 = await k.photo(A);
    const { registration: r1 } = await k.register(A, {
      profile: { photoIds: [ph1] },
    });
    await k.withdrawRaw(r1.id);
    const r = await prepare(k, A, r1.id);
    if (r.content.kind !== "registration") throw new Error("kind");
    const photoIds = PhotoSet.photoIds(r.content.profile.photos);
    const { registration: r2 } = await k.register(A, {
      profile: profileFields({ name: r.content.profile.name, photoIds }),
    });
    expect(r2.status.kind).toBe("underReview");
    const [copy] = photoIds;
    if (copy === undefined) throw new Error("no duplicate");
    expect(copy).not.toBe(ph1);
    expect(await k.photoOwner(copy)).toEqual(k.applicationOwner(r2.id));
    expect(await k.photoOwner(ph1)).toEqual(k.applicationOwner(r1.id));
  });

  it("prepareReapplication#3 A の情報修正の申請 a2（店舗 p1、名称の項目と、p1 の写真 ph0 に a2 が持ち主の ph3 を加える写真の項目）が失効している。その後、p1 の紹介が変わった / A が a2 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const {
      placeId: p1,
      photoIds: [ph0],
    } = await k.placeWithPhotos("喫茶ルント", 1);
    if (ph0 === undefined) throw new Error("no photo");
    const ph3 = await k.photo(A);
    const a2 = await k.revise(A, p1, {
      profile: { name: "喫茶ルント本店", photoIds: [ph0, ph3] },
    });
    await k.manager(p1);
    await k.lapse(a2.id);
    await k.changePlace(
      p1,
      (place, now) =>
        Place.updateProfile(
          place,
          PlaceProfile.create({
            name: place.profile.name,
            photoIds: PhotoSet.photoIds(place.profile.photos),
            description: "変わった紹介",
            address: place.profile.address,
            location: place.profile.location,
            businessHours: null,
            contact: null,
          }),
          now,
        ).entity,
    );
    const r = await prepare(k, A, a2.id);
    if (r.content.kind !== "revision") throw new Error("kind");
    const { profile } = r.content.desired;
    expect(profile.name).toBe("喫茶ルント本店");
    expect(profile.description).toBe("変わった紹介");
    const [first, copy] = PhotoSet.photoIds(profile.photos);
    expect(first).toBe(ph0);
    expect(copy).not.toBe(ph3);
    if (copy === undefined) throw new Error("no duplicate");
    expect((await photoAsset(k, copy)).registeredBy).toBe(A.accountId);
    expect(await k.photoOwner(ph0)).toEqual({ kind: "place", id: p1 });
  });

  it("prepareReapplication#4 A の管理権限の申請 a3 が否認になっている / A が a3 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const a3 = await k.claim(A, { placeId: await k.place() });
    await k.reject(a3.id);
    const before = serial(k.t.idGenerator.next());
    const r = await prepare(k, A, a3.id);
    expect(serial(k.t.idGenerator.next())).toBe(before + 1);
    expect(r.content).toEqual({ kind: "stewardship", claim: a3.content });
    expect(r.photos).toEqual([]);
  });

  it.todo(
    "prepareReapplication#5 店舗 p1 について店舗管理者として行った参加の申請 a4 が取り下げになっている。S は p1 の店舗管理者 / S が a4 から再申請の内容を用意する",
  ); // S3B: the participation kind

  it.todo(
    "prepareReapplication#6 店舗 p1 の参加の申請 a4（イベント e1、掲載 l1・l2・l3、参加日 d1・d2）が否認になっている。その後、l2 は一時非公開になり、l3 は削除され、e1 の開催期間が短くなって d2 が期間外になった / S が a4 から再申請の内容を用意する",
  ); // S3B: the participation kind

  it("prepareReapplication#7 A の登録申請 r1 は確認中。r1 に併せた管理権限の申請 s1 が取り下げになっている / A が s1 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.withdrawRaw(s1.id);
    const r = await prepare(k, A, s1.id);
    expect(r.target).toEqual({
      kind: "stewardship",
      applicant: { kind: "individual", accountId: A.accountId },
      placeId: r1.reservedPlaceId,
      registrationId: r1.id,
    });
  });

  it("prepareReapplication#8 A の登録申請 r1 は承認されて店舗 p1 が作られている。r1 に併せた管理権限の申請 s1 は否認になっている / A が s1 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    const p1 = await k.registrationApproved(r1.id);
    const rejected = await k.reject(s1.id);
    const r = await prepare(k, A, s1.id);
    expect(r.target).toEqual({
      kind: "stewardship",
      applicant: { kind: "individual", accountId: A.accountId },
      placeId: p1,
      registrationId: null,
    });
    expect(await k.app(s1.id)).toEqual(rejected);
  });

  it("prepareReapplication#9 A の掲載の申請 a1 の内容のカテゴリー c1 は、否認の後に廃止され、移行先は c2 / A が a1 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const c1 = await k.addCategory("季節もの");
    const c2 = await k.category("食べる");
    const a1 = await k.newListing(A, p1, { categoryId: c1 });
    await k.reject(a1.id);
    await k.retireCategory(c1, c2);
    const r = await prepare(k, A, a1.id);
    if (r.content.kind !== "listing") throw new Error("kind");
    expect(r.content.content.categoryId).toBe(c2);
    const stored = await k.app(a1.id);
    if (stored.target.kind !== "listing") throw new Error("kind");
    expect((stored.content as { categoryId: unknown }).categoryId).toBe(c1);
  });

  it("prepareReapplication#10 A の掲載の申請 a1 が否認になっている / A が、a1 から再申請の内容を2回用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const a1 = await k.newListing(A, await k.place());
    await k.reject(a1.id);
    const first = listingPhotos(await prepare(k, A, a1.id));
    const second = listingPhotos(await prepare(k, A, a1.id));
    const [f] = first;
    const [s] = second;
    if (f === undefined || s === undefined) throw new Error("duplicates");
    expect(f.photoId).not.toBe(s.photoId);
    expect(await k.photoOwner(f.photoId)).toBeNull();
    expect(await k.photoOwner(s.photoId)).toBeNull();
  });

  it("prepareReapplication#11 A の掲載の修正の申請 a5（掲載 l1）が、l1 の削除で失効している / A が a5 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    const a5 = await k.reviseListing(A, l1, { photos: [await k.photo(A)] });
    await k.remove(await k.setupOperator(), l1);
    await k.lapse(a5.id);
    const attempt = prepare(k, A, a5.id);
    await expectCode(attempt, Error, "APPLICATION_LISTING_NOT_FOUND");
    await expectNoDuplicate(k, prepare(k, A, a5.id));
  });

  it("prepareReapplication#12 A の申請 a6 が確認中 / A が a6 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const a6 = await k.newListing(A, await k.place());
    await expectCode(prepare(k, A, a6.id), Error, "APPLICATION_UNDER_REVIEW");
  });

  it("prepareReapplication#13 A の申請 a8 が差し戻しになっている / A が a8 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const a8 = await k.newListing(A, await k.place());
    await k.sendBack(a8.id);
    await expectCode(prepare(k, A, a8.id), Error, "APPLICATION_RETURNED");
    await expectNoDuplicate(k, prepare(k, A, a8.id));
  });

  it("prepareReapplication#14 A の申請 a7 が承認されている / A が a7 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const a7 = await k.newListing(A, await k.place());
    await k.approveStatus(a7.id);
    await expectCode(
      prepare(k, A, a7.id),
      Error,
      "APPLICATION_ALREADY_APPROVED",
    );
  });

  it("prepareReapplication#15 A の申請 a1 が否認になっている。利用者 B は申請者でない / B が a1 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const a1 = await k.newListing(A, await k.place());
    await k.reject(a1.id);
    await expectCode(prepare(k, B, a1.id), ForbiddenError);
    await expectNoDuplicate(k, prepare(k, B, a1.id));
  });

  it("prepareReapplication#16 ID が a9 の申請はない / A が a9 から再申請の内容を用意する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    await expectCode(
      prepare(k, A, ApplicationIds.create(k.newId())),
      NotFoundError,
    );
  });
});
