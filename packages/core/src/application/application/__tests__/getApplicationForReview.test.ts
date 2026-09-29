import type {
  ApplicationId,
  OccasionId,
  PhotoId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { approveNewListing } from "../approveNewListing";
import { approvePlaceRegistration } from "../approvePlaceRegistration";
import { approvePlaceRevision } from "../approvePlaceRevision";
import type { ApplicationContentView } from "../detail";
import { getApplicationForReview } from "../getApplicationForReview";
import { absentApplicationId } from "./kit";
import { reviewKit } from "./reviewKit";
import { oct, type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

const placeRef = (id: PlaceId) => ({ kind: "place", id }) as const;
const regionRef = (id: RegionId) => ({ kind: "region", id }) as const;
const occasionRef = (id: OccasionId) => ({ kind: "occasion", id }) as const;

/** `who` reads the application on the testcases' 7-day review period. */
const reviewOnWeek = (k: StewardSeatKit, who: Person, id: ApplicationId) =>
  getApplicationForReview({
    container: k.week,
    actor: who.actor,
    input: { applicationId: id },
  });

/**
 * Place p1 (steward S) applies to region `regionName` (steward R unless
 * `stewarded` is false) for affiliation: b1, under review `days` days.
 */
async function affiliationSetUp(
  spec: Readonly<{ regionName: string; stewarded: boolean; days: number }>,
) {
  const k = await stewardSeatKit();
  const region = await k.addRegion({ name: spec.regionName });
  const R = spec.stewarded ? await k.regionSteward(region, "R") : null;
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  const b1 = await k.affiliateAsPlace(S, { placeId: p1, regionId: region });
  k.passDays(spec.days);
  return { k, region, R, p1, S, b1 };
}

/** Occasion e1 (steward V); place p1 (steward S) applies to it with `listings` and 10/2. */
async function participationSetUp(listingCount: number) {
  const k = await stewardSeatKit();
  const e1 = await k.addOccasion({ name: "秋祭り" });
  const V = await k.organizer(e1, "V");
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  const listings = [];
  for (let i = 0; i < listingCount; i += 1) {
    listings.push((await k.published(S, p1, { name: `メニュー${i + 1}` })).id);
  }
  const b2 = await k.participationApp(S, {
    placeId: p1,
    occasionId: e1,
    listingIds: listings,
    dates: [oct(2)],
  });
  return { k, e1, V, p1, S, listings, b2 };
}

const shown = (photoId: PhotoId) => ({
  photoId,
  display: expect.objectContaining({ url: expect.stringContaining(photoId) }),
});

function contentOf<K extends ApplicationContentView["kind"]>(
  content: ApplicationContentView,
  kind: K,
): Extract<ApplicationContentView, { kind: K }> {
  if (content.kind !== kind) throw new Error(`not a ${kind}: ${content.kind}`);
  return content as Extract<ApplicationContentView, { kind: K }>;
}

async function listingSetUp() {
  const k = await reviewKit();
  const A = await k.person("A");
  const setup = await k.setupOperator();
  const p1 = await k.place("山田珈琲店");
  const [ph1, ph2] = await k.photos(setup, 2);
  if (ph1 === undefined || ph2 === undefined) throw new Error("photos");
  const l1 = await k.listing(p1, {
    name: "ブレンド",
    description: "定番の味",
    photos: [ph1, ph2],
  });
  return { k, A, setup, p1, l1, ph1, ph2 };
}

describe("getApplicationForReview", () => {
  it("getApplicationForReview#1 登録申請 r1 が確認中で、管理権限の申請 s1 を併せている。r1 の名称・所在地に近い公開中の店舗 p1 と、サービス運営者が非公開にしている店舗 p2 がある。操作する人はサービス運営者 O / O が r1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    const { placeId: p2 } = await k.placeWithPhotos("山田珈琲 本店", 0);
    await k.suspendPlace(p2);
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      profile: { name: "山田珈琲店" },
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");

    const view = await k.forReview(k.O, r1.id);

    expect(view).toMatchObject({
      id: r1.id,
      kind: "registration",
      version: r1.version,
      applicant: { kind: "individual", accountId: A.accountId },
      status: { kind: "underReview", answering: null },
      permission: { allowed: true, reviewAs: "approver" },
      companion: { id: s1.id, status: "underReview" },
      registrationId: null,
      reflected: null,
    });
    expect(contentOf(view.content, "registration").profile.name).toBe(
      "山田珈琲店",
    );
    expect(view.subjects).toEqual([
      {
        ref: placeRef(r1.reservedPlaceId),
        name: "山田珈琲店",
        notYet: true,
        viewability: "notYet",
      },
    ]);
    if (view.facts.kind !== "registration") throw new Error("facts");
    expect(
      view.facts.similarPlaces.map((p) => [p.placeId, p.suspended]),
    ).toEqual(
      expect.arrayContaining([
        [p1, false],
        [p2, true],
      ]),
    );
  });

  it("an individual applicant comes with their account's email address, or null once they have withdrawn", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const { claim: a1 } = await k.claimOnPlace(A);
    const { claim: b1 } = await k.claimOnPlace(B);
    await k.deleteAccount(B);

    expect((await k.forReview(k.O, a1.id)).applicant).toEqual({
      kind: "individual",
      accountId: A.accountId,
      email: A.email,
    });
    expect((await k.forReview(k.O, b1.id)).applicant).toEqual({
      kind: "individual",
      accountId: B.accountId,
      email: null,
    });
  });

  it("getApplicationForReview#2 併せた管理権限の申請 s1 が確認中。登録申請 r1 も確認中 / O が s1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      profile: { name: "新しい店" },
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");

    const view = await k.forReview(k.O, s1.id);

    expect(view.permission).toEqual({
      allowed: false,
      reason: "registrationPending",
    });
    expect(view.registrationId).toBe(r1.id);
    expect(view.subjects).toEqual([
      {
        ref: placeRef(r1.reservedPlaceId),
        name: "新しい店",
        notYet: true,
        viewability: "notYet",
      },
    ]);
  });

  it("getApplicationForReview#3 登録申請 r1 は承認されている。s1 は確認中 / O が s1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.approveAs(approvePlaceRegistration, k.O, r1.id);

    const view = await k.forReview(k.O, s1.id);

    expect(view.permission).toEqual({ allowed: true, reviewAs: "approver" });
    expect(view.subjects).toMatchObject([
      {
        ref: placeRef(r1.reservedPlaceId),
        notYet: false,
        viewability: "viewable",
      },
    ]);
  });

  it("getApplicationForReview#4 登録申請 r2 は承認されて店舗 p3 が作られ、その後 p3 はサービス運営者が非公開にした / O が r2 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r2 } = await k.register(A);
    await k.approveAs(approvePlaceRegistration, k.O, r2.id);
    await k.suspendPlace(r2.reservedPlaceId);

    const view = await k.forReview(k.O, r2.id);

    expect(view.status).toEqual({ kind: "approved" });
    expect(view.reflected).toEqual(placeRef(r2.reservedPlaceId));
    expect(view.subjects).toMatchObject([
      { notYet: false, viewability: "notViewable" },
    ]);
  });

  it("getApplicationForReview#5 登録申請 r1 に併せた s1 が取り下げになり、その後に r1 を参照する再申請 s2 が確認中 / O が r1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.withdrawAs(A, s1.id);
    const s2 = await k.claim(A, { registrationId: r1.id });

    const view = await k.forReview(k.O, r1.id);

    expect(view.companion).toEqual({ id: s2.id, status: "underReview" });
  });

  it("getApplicationForReview#6 利用者 A の、店舗 p1 への管理権限の申請 a1 が確認中。p1 に店舗管理者 S がいる / O が a1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const S = await k.person("S");
    const p1 = await k.place("山田珈琲店");
    await k.appoint(placeRef(p1), S);
    const a1 = await k.claim(
      A,
      {
        placeId: p1,
      },
      { relationship: "店主の家族です", evidence: "店の電話 03-1111-2222" },
    );

    const view = await k.forReview(k.O, a1.id);

    expect(view.content).toEqual({
      kind: "stewardship",
      placeId: p1,
      relationship: "店主の家族です",
      evidence: "店の電話 03-1111-2222",
    });
    expect(view.facts).toEqual({ kind: "stewardship", placeHasSteward: true });
    expect(view.subjects).toEqual([
      {
        ref: placeRef(p1),
        name: "山田珈琲店",
        notYet: false,
        viewability: "viewable",
      },
    ]);
  });

  it("getApplicationForReview#7 A の管理権限の申請 a1 は、追加で必要な確認 q で差し戻された後、回答 w を添えて再提出されて確認中 / O が a1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);
    await k.sendBackAs(k.O, a1.id, "登記簿の写しを添えてください");
    await k.resubmitClaim(
      A,
      a1.id,
      "店主です（登記簿あり）",
      "写しを添えました",
    );

    const view = await k.forReview(k.O, a1.id);

    expect(view.status).toMatchObject({
      kind: "underReview",
      answering: {
        request: "登記簿の写しを添えてください",
        reply: "写しを添えました",
      },
    });
    expect(contentOf(view.content, "stewardship").relationship).toBe(
      "店主です（登記簿あり）",
    );
  });

  it("getApplicationForReview#8 店舗 p1 への情報修正の申請 a2（名称の項目）が確認中。a2 の提出の後に、別の承認で p1 の名称が変わった / O が a2 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    const a2 = await k.revise(A, p1, { profile: { name: "山田珈琲 本店" } });
    const other = await k.revise(B, p1, { profile: { name: "山田コーヒー" } });
    await k.approveAs(approvePlaceRevision, k.O, other.id);
    const current = (await k.getPlace(p1)).entity;

    const view = await k.forReview(k.O, a2.id);

    const content = contentOf(view.content, "revision");
    expect(content.changes).toEqual([
      { field: "name", current: "山田コーヒー", proposed: "山田珈琲 本店" },
    ]);
    expect(content.preview.profile.name).toBe("山田珈琲 本店");
    expect(content.preview.profile.address).toEqual(current.profile.address);
    expect(content.preview.operatingStatus).toBe(current.operatingStatus);
  });

  it("getApplicationForReview#9 掲載 l1 への修正の申請 a3（説明と写真の項目）が確認中 / O が a3 を確かめる", async () => {
    const { k, A, l1, ph1, ph2 } = await listingSetUp();
    const ph3 = await k.photo(A);
    const a3 = await k.reviseListing(A, l1, {
      description: "深煎りの定番",
      photos: [ph3, ph1],
    });

    const view = await k.forReview(k.O, a3.id);

    const { revision } = contentOf(view.content, "listingRevision");
    if (revision.listing !== "present") throw new Error("listing gone");
    expect(revision.changes).toEqual([
      {
        field: "description",
        current: "定番の味",
        proposed: "深煎りの定番",
      },
      {
        field: "photos",
        current: [
          { ...shown(ph1), framing: null },
          { ...shown(ph2), framing: null },
        ],
        proposed: [
          { ...shown(ph3), framing: null, origin: "added" },
          { ...shown(ph1), framing: null, origin: "current" },
        ],
      },
    ]);
    expect(revision.preview.description).toBe("深煎りの定番");
    expect(revision.preview.photos.map((p) => p.photoId)).toEqual([ph3, ph1]);
  });

  it("getApplicationForReview#10 l1 の写真は ph1、ph2。掲載の修正の申請 a5 の写真の項目は ph3、ph1（ph3 は a5 が持ち主）。a5 の提出の後に、ph1 は申立てで l1 から削除された / O が a5 を確かめる", async () => {
    const { k, A, l1, ph1 } = await listingSetUp();
    const ph3 = await k.photo(A);
    const a5 = await k.reviseListing(A, l1, { photos: [ph3, ph1] });
    await k.takeDown(l1, [ph1]);

    const view = await k.forReview(k.O, a5.id);

    const { revision } = contentOf(view.content, "listingRevision");
    if (revision.listing !== "present") throw new Error("listing gone");
    const photos = revision.changes.find((c) => c.field === "photos");
    expect(photos?.proposed).toEqual([
      { ...shown(ph3), framing: null, origin: "added" },
      { ...shown(ph1), framing: null, origin: "current" },
    ]);
    expect(revision.preview.photos.map((p) => p.photoId)).toEqual([ph3]);
  });

  it("getApplicationForReview#11 公開中の掲載 l1 への修正の申請 a7 が確認中の間に、l1 が紐づく店舗 p1 がサービス運営者によって非公開になった / O が a7 を確かめる", async () => {
    const { k, A, p1, l1 } = await listingSetUp();
    const a7 = await k.reviseListing(A, l1, { name: "夏のブレンド" });
    await k.suspendPlace(p1);

    const view = await k.forReview(k.O, a7.id);

    expect(view.status.kind).toBe("underReview");
    const { revision } = contentOf(view.content, "listingRevision");
    expect(revision.listing).toBe("present");
    expect(view.subjects.map((s) => [s.ref, s.viewability])).toEqual([
      [placeRef(p1), "notViewable"],
      [{ kind: "listing", id: l1 }, "notViewable"],
    ]);
  });

  it("getApplicationForReview#12 掲載 l1 への修正の申請 a6（名称の項目）が、l1 の削除で失効している / O が a6 を確かめる", async () => {
    const { k, A, setup, l1 } = await listingSetUp();
    const a6 = await k.reviseListing(A, l1, { name: "夏のブレンド" });
    await k.remove(setup, l1);
    await k.lapse(a6.id);

    const view = await k.forReview(k.O, a6.id);

    expect(view.status).toEqual({
      kind: "lapsed",
      brokenPremises: ["listingExists"],
    });
    expect(contentOf(view.content, "listingRevision").revision).toEqual({
      listing: "deleted",
      proposals: [{ field: "name", proposed: "夏のブレンド" }],
    });
    expect(
      view.subjects.find((s) => s.ref.kind === "listing")?.viewability,
    ).toBe("missing");
  });

  it("getApplicationForReview#13 掲載の申請 a4 の内容のカテゴリー c1 は廃止され、移行先は c2 / O が a4 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p1 = await k.place();
    const c1 = await k.addCategory("甘味");
    const a4 = await k.newListing(A, p1, { categoryId: c1 });
    const c2 = await k.addCategory("菓子");
    await k.retireCategory(c1, c2);

    const view = await k.forReview(k.O, a4.id);

    expect(contentOf(view.content, "listing").content.category).toEqual({
      id: c2,
      name: "菓子",
    });
  });

  it("getApplicationForReview#14 情報修正の申請 a2 の対象の店舗 p1 が、確認中の間にサービス運営者によって非公開になった / O が a2 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    const a2 = await k.revise(A, p1);
    await k.suspendPlace(p1);

    const view = await k.forReview(k.O, a2.id);

    expect(view.status.kind).toBe("underReview");
    expect(view.permission).toEqual({ allowed: true, reviewAs: "approver" });
    expect(view.subjects).toMatchObject([
      { ref: placeRef(p1), viewability: "notViewable" },
    ]);
  });

  it("getApplicationForReview#15 利用者 R は地域 X の運営者。X への所属の申請 b1 が確認中 / R が b1 を確かめる", async () => {
    const { k, region, R, p1, b1 } = await affiliationSetUp({
      regionName: "X",
      stewarded: true,
      days: 1,
    });
    if (R === null) throw new Error("R");

    const view = await reviewOnWeek(k, R, b1.id);

    expect(view.kind).toBe("affiliation");
    expect(view.subjects).toMatchObject([
      { ref: placeRef(p1), name: "山田珈琲店", viewability: "viewable" },
      { ref: regionRef(region), name: "X", viewability: "viewable" },
    ]);
    expect(view.applicant).toEqual({
      kind: "place",
      placeId: p1,
      name: "山田珈琲店",
    });
    expect(view.content).toEqual({
      kind: "affiliation",
      placeId: p1,
      regionId: region,
    });
    expect(view.permission).toEqual({ allowed: true, reviewAs: "approver" });
  });

  it("getApplicationForReview#16 利用者 V はイベント e1 の運営者。e1 への参加の申請 b2 が、掲載 l1 と参加日を添えて確認中 / V が b2 を確かめる", async () => {
    const { k, e1, V, p1, listings, b2 } = await participationSetUp(1);
    const [l1] = listings;

    const view = await reviewOnWeek(k, V, b2.id);

    expect(view.subjects).toMatchObject([
      { ref: placeRef(p1), name: "山田珈琲店" },
      { ref: occasionRef(e1), name: "秋祭り" },
    ]);
    expect(view.content).toEqual({
      kind: "participation",
      placeId: p1,
      occasionId: e1,
      listings: [
        expect.objectContaining({
          id: l1,
          deleted: false,
          name: "メニュー1",
          publication: expect.objectContaining({ status: "published" }),
          suspended: false,
          viewable: true,
        }),
      ],
      dates: [oct(2)],
    });
    expect(view.permission).toEqual({ allowed: true, reviewAs: "approver" });
  });

  it("getApplicationForReview#17 b2 に添えた掲載は l1・l2・l3。確認中に、l1 は一時非公開、l2 は運営による非公開になり、l3 は削除された / V が b2 を確かめる", async () => {
    const { k, V, S, listings, b2 } = await participationSetUp(3);
    const [l1, l2, l3] = listings;
    if (l1 === undefined || l2 === undefined || l3 === undefined) {
      throw new Error("listings");
    }
    await k.unpublish(S, l1);
    await k.suspend(k.O, l2);
    await k.remove(S, l3);

    const view = await reviewOnWeek(k, V, b2.id);

    if (view.content.kind !== "participation") throw new Error("kind");
    expect(view.content.listings).toEqual([
      expect.objectContaining({
        id: l1,
        deleted: false,
        publication: expect.objectContaining({ status: "unpublished" }),
        suspended: false,
        viewable: false,
      }),
      expect.objectContaining({
        id: l2,
        deleted: false,
        publication: expect.objectContaining({ status: "published" }),
        suspended: true,
        viewable: false,
      }),
      { id: l3, deleted: true },
    ]);
  });

  it("getApplicationForReview#18 地域 X に運営者がいる。b1 は3日前から確認中。O は X の運営者でない / O が b1 を確かめる", async () => {
    const { k, b1 } = await affiliationSetUp({
      regionName: "X",
      stewarded: true,
      days: 3,
    });

    const view = await reviewOnWeek(k, k.O, b1.id);

    expect(view.permission).toEqual({
      allowed: false,
      reason: "awaitingStewards",
    });
    expect(view.status.kind).toBe("underReview");
  });

  it("getApplicationForReview#19 地域 X に運営者がいる。b1 は10日前から確認中 / O が b1 を確かめる", async () => {
    const { k, b1 } = await affiliationSetUp({
      regionName: "X",
      stewarded: true,
      days: 10,
    });

    const view = await reviewOnWeek(k, k.O, b1.id);

    expect(view.permission).toEqual({
      allowed: true,
      reviewAs: "overdue_proxy",
    });
  });

  it("getApplicationForReview#20 地域 Y に運営者がいない。Y への所属の申請 b3 が、1日前から確認中 / O が b3 を確かめる", async () => {
    const { k, b1: b3 } = await affiliationSetUp({
      regionName: "Y",
      stewarded: false,
      days: 1,
    });

    const view = await reviewOnWeek(k, k.O, b3.id);

    expect(view.permission).toEqual({ allowed: true, reviewAs: "approver" });
  });

  it("getApplicationForReview#21 b1 は、サービス運営者の期間超過の代行で否認されている / R が b1 を確かめる", async () => {
    const { k, R, b1 } = await affiliationSetUp({
      regionName: "X",
      stewarded: true,
      days: 10,
    });
    if (R === null) throw new Error("R");
    await k.rejectAs(k.O, b1.id, "期間内に確認されませんでした", {
      container: k.week,
    });

    const view = await reviewOnWeek(k, R, b1.id);

    expect(view.status).toEqual({
      kind: "rejected",
      reason: "期間内に確認されませんでした",
      reviewAs: "overdue_proxy",
    });
  });

  it("getApplicationForReview#22 A の申請 a1 は、判断の前に取り下げられた / O が a1 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { claim: a1 } = await k.claimOnPlace(A);
    await k.withdrawAs(A, a1.id);

    const view = await k.forReview(k.O, a1.id);

    expect(view.status).toEqual({ kind: "withdrawn" });
  });

  it("getApplicationForReview#23 写真 ph1 を内容に持つ登録申請 r3 は否認されている / O が r3 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const ph1 = await k.photo(A);
    const { registration: r3 } = await k.register(A, {
      profile: { photoIds: [ph1] },
    });
    await k.rejectAs(k.O, r3.id, "重複しています");

    const view = await k.forReview(k.O, r3.id);

    expect(view.status).toEqual({ kind: "rejected", reason: "重複しています" });
    expect(contentOf(view.content, "registration").profile.photos).toEqual([
      shown(ph1),
    ]);
  });

  it("getApplicationForReview#24 利用者 U は、地域 X の運営者でも、サービス運営者でもない / U が b1 を確かめる", async () => {
    const { k, b1 } = await affiliationSetUp({
      regionName: "X",
      stewarded: true,
      days: 1,
    });
    const U = await k.person("U");

    await expectCode(reviewOnWeek(k, U, b1.id), ForbiddenError);
  });

  it("getApplicationForReview#25 R は地域 X の運営者で、サービス運営者でない / R が、情報修正の申請 a2 を確かめる", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const R = await k.person("R");
    await k.appoint(k.region("X"), R);
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    const a2 = await k.revise(A, p1);

    await expectCode(k.forReview(R, a2.id), ForbiddenError);
  });

  it("getApplicationForReview#26 ID が a9 の申請はない / O が a9 を確かめる", async () => {
    const k = await reviewKit();

    await expectCode(k.forReview(k.O, absentApplicationId(k)), NotFoundError);
  });

  describe("why a subject is hidden (CM-01)", () => {
    const OTHER = { suspended: false, placeSuspended: false } as const;

    it("tells a listing suspended by the operators from its place", async () => {
      const { k, A, setup, p1, l1 } = await listingSetUp();
      const a7 = await k.reviseListing(A, l1, { name: "夏のブレンド" });
      await k.suspend(setup, l1);

      const view = await k.forReview(k.O, a7.id);

      expect(view.subjects).toMatchObject([
        { ref: placeRef(p1), viewability: "viewable" },
        {
          ref: { kind: "listing", id: l1 },
          viewability: "notViewable",
          hiddenBy: { suspended: true, placeSuspended: false },
        },
      ]);
    });

    it("tells a listing hidden with its suspended place", async () => {
      const { k, A, p1, l1 } = await listingSetUp();
      const a7 = await k.reviseListing(A, l1, { name: "夏のブレンド" });
      await k.suspendPlace(p1);

      const view = await k.forReview(k.O, a7.id);

      expect(view.subjects).toMatchObject([
        {
          ref: placeRef(p1),
          viewability: "notViewable",
          hiddenBy: { suspended: true, placeSuspended: false },
        },
        {
          ref: { kind: "listing", id: l1 },
          viewability: "notViewable",
          hiddenBy: { suspended: false, placeSuspended: true },
        },
      ]);
    });

    it("gives another reason for a listing its stewards unpublished", async () => {
      const { k, A, setup, l1 } = await listingSetUp();
      const a7 = await k.reviseListing(A, l1, { name: "夏のブレンド" });
      await k.unpublish(setup, l1);

      const view = await k.forReview(k.O, a7.id);

      expect(view.subjects[1]).toMatchObject({
        ref: { kind: "listing", id: l1 },
        viewability: "notViewable",
        hiddenBy: OTHER,
      });
    });

    it("reads a place the content does not read (a stewardship claim's)", async () => {
      const k = await reviewKit();
      const A = await k.person("A");
      const { placeId, claim } = await k.claimOnPlace(A);
      await k.suspendPlace(placeId);

      const view = await k.forReview(k.O, claim.id);

      expect(view.subjects).toMatchObject([
        {
          ref: placeRef(placeId),
          viewability: "notViewable",
          hiddenBy: { suspended: true, placeSuspended: false },
        },
      ]);
    });

    it("reads the listing an approved listing application created", async () => {
      const k = await reviewKit();
      const A = await k.person("A");
      const setup = await k.setupOperator();
      const p1 = await k.place();
      const a4 = await k.newListing(A, p1, { name: "季節のパフェ" });
      await k.approveAs(approveNewListing, k.O, a4.id);
      const { reflected } = await k.forReview(k.O, a4.id);
      if (reflected?.kind !== "listing") throw new Error("not reflected");
      await k.suspend(setup, reflected.id);

      const view = await k.forReview(k.O, a4.id);

      expect(view.subjects.find((s) => s.ref.kind === "listing")).toMatchObject(
        {
          viewability: "notViewable",
          hiddenBy: { suspended: true, placeSuspended: false },
        },
      );
    });
  });
});
