import { ApplicationEvents } from "@repo/core/domain/application/events";
import { AuthorityEvents } from "@repo/core/domain/authority/events";
import type { Actor } from "@repo/core/domain/common/actor";
import { EventId } from "@repo/core/domain/common/event";
import { GeoPoint } from "@repo/core/domain/common/geo";
import { ApplicationId, PhotoId, RegionId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { ListingEvents } from "@repo/core/domain/listing/events";
import { ModerationEvents } from "@repo/core/domain/moderation/events";
import { OccasionEvents } from "@repo/core/domain/occasion/events";
import { PlaceEvents } from "@repo/core/domain/place/events";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { RegionContent } from "@repo/core/domain/region/content";
import { RegionEvents } from "@repo/core/domain/region/events";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { reassessApplicationPremises } from "../../application/reassessApplicationPremises";
import { submitAffiliationChange } from "../../application/submitAffiliationChange";
import { UnauthorizedError } from "../../errors";
import { listNotifications } from "../listNotifications";
import { applicationFixtures } from "./applicationFixtures";
import { type Kit, notificationKit, type Person } from "./kit";

const PAGE: Pagination = { page: 1, limit: 20 };

const list = (k: Kit, actor: Actor | null, pagination: Pagination = PAGE) =>
  listNotifications({ container: k.container, actor, input: { pagination } });

/** `A` stewards place P with S; an approval appoints `who` to P (S is told). */
async function stewardAddedTo(k: Kit, A: Person, who: Person) {
  const P = k.place("店舗P");
  await k.appoint(P, A, who);
  await k.consume(
    k.event(
      AuthorityEvents.stewardAppointed(
        P,
        who.accountId,
        "application",
        k.tick(),
      ),
    ),
  );
  return P;
}

/**
 * K is retired to K2 while P's listing stores K; the retirement reaches
 * P's steward A.
 */
async function reassignedCategory(k: Kit) {
  const A = await k.person("a");
  const P = k.place("店舗P");
  await k.appoint(P, A);
  const [K, K2] = await k.categories("K", "K2");
  if (K === undefined || K2 === undefined) throw new Error("no category");
  await k.listing(P, { categoryId: K });
  await k.retireCategory(K, K2);
  await k.consume(k.event(ListingEvents.categoryRetired(K, k.tick())));
  return { A, P, K, K2 };
}

describe("listNotifications", () => {
  it("listNotifications#1 利用者 A に、T1 < T2 < T3 の順に3つの通知が作られた / A として1ページ目を読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const P = k.place("店舗P");
    const R = k.region("地域R");
    await k.consume(
      k.event(AuthorityEvents.roleGranted("editor", A.accountId, k.tick())),
    );
    await k.consume(
      k.event(
        AuthorityEvents.stewardAppointed(R, A.accountId, "grant", k.tick()),
      ),
    );
    await k.consume(
      k.event(
        AuthorityEvents.stewardRemoved(P, A.accountId, "revoked", k.tick()),
      ),
    );
    const result = await list(k, A.actor);
    expect(result.count).toBe(3);
    expect(result.items.map((item) => item.occurrence.to)).toEqual([
      "self",
      "grantee",
      "grantee",
    ]);
    const [t3, t2, t1] = result.items;
    expect(t3?.createdAt.getTime()).toBeGreaterThan(
      t2?.createdAt.getTime() ?? 0,
    );
    expect(t2?.createdAt.getTime()).toBeGreaterThan(
      t1?.createdAt.getTime() ?? 0,
    );
    expect(t3).toMatchObject({
      delivery: "direct",
      pointedContent: P,
      vacantTarget: null,
      labels: [{ ref: P, label: "店舗P" }],
      destination: null,
    });
    expect(t2).toMatchObject({
      pointedContent: R,
      labels: [{ ref: R, label: "地域R" }],
      destination: {
        kind: "grantedAuthority",
        granted: { kind: "stewardship", target: R },
      },
    });
    expect(t1).toMatchObject({
      pointedContent: null,
      labels: [],
      destination: {
        kind: "grantedAuthority",
        granted: { kind: "role", role: "editor" },
      },
    });
  });

  it("listNotifications#2 利用者 A に通知が1件もない / A として1ページ目を読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    expect(await list(k, A.actor)).toEqual({ items: [], count: 0 });
  });

  it("listNotifications#3 通知を持つ利用者がいる。ログインしていない / Actor なしで読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    await k.consume(
      k.event(AuthorityEvents.roleGranted("editor", A.accountId, k.tick())),
    );
    await expect(list(k, null)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("listNotifications#4 利用者 A は、店舗 P の店舗管理者、地域 R の地域運営者、編集担当者を兼ねる。それぞれの立場宛ての出来事と、A が個人として行った申請の承認が起きた / A として読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const P = k.place("店舗P");
    const R = k.region("地域R");
    await k.appoint(P, A);
    await k.appoint(R, A);
    await k.editors(A);
    const L = await k.listing(k.place("店舗Q"), { name: "掲載L" });
    const A1 = await k.article([L], { title: "読みものA1" });
    await k.consume(k.event(PlaceEvents.suspended(P.id, k.tick())));
    await k.consume(
      k.event(
        OccasionEvents.regionLinked(k.occasion("イベントC").id, R.id, k.tick()),
      ),
    );
    await k.consume(k.event(ListingEvents.deleted(L.id, k.tick())));
    await k.consume(
      k.event(
        ApplicationEvents.approved(
          k.applicationId(),
          { kind: "individual", accountId: A.accountId },
          k.tick(),
        ),
      ),
    );
    const result = await list(k, A.actor);
    expect(result.count).toBe(4);
    expect(result.items.map((item) => item.occurrence.to)).toEqual([
      "applicant",
      "editors",
      "regionStewards",
      "contentManagers",
    ]);
    expect(result.items.map((item) => item.pointedContent)).toEqual([
      null,
      A1,
      R,
      P,
    ]);
  });
  it("listNotifications#5 利用者 A と利用者 B が店舗 P の店舗管理者で、店舗 P が運営による非公開になった。B には別の通知もある / A として読む", async () => {
    const k = notificationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const P = k.place("店舗P");
    await k.appoint(P, A, B);
    await k.consume(k.event(PlaceEvents.suspended(P.id, k.tick())));
    await k.consume(
      k.event(
        AuthorityEvents.stewardRemoved(
          k.place("店舗Q"),
          B.accountId,
          "revoked",
          k.tick(),
        ),
      ),
    );
    const page = await list(k, A.actor);
    expect(page.count).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      occurrence: {
        to: "contentManagers",
        content: P,
        matter: { kind: "suspended" },
      },
      delivery: "direct",
      pointedContent: P,
      labels: [{ ref: P, label: "店舗P" }],
      destination: {
        kind: "placeManagement",
        placeId: P.id,
        facet: "overview",
      },
    });
    expect((await list(k, B.actor)).count).toBe(2);
  });
  it("listNotifications#6 店舗 P の掲載 L が運営による非公開になり、店舗管理者 A に通知が届いた / A として読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const P = k.place("店舗P");
    await k.appoint(P, A);
    const L = await k.listing(P, { name: "掲載L" });
    await k.consume(k.event(ListingEvents.suspended(L.id, P.id, k.tick())));
    const [item] = (await list(k, A.actor)).items;
    expect(item).toMatchObject({
      occurrence: {
        to: "contentManagers",
        content: L,
        placeId: P.id,
        matter: { kind: "suspended" },
      },
      delivery: "direct",
      pointedContent: L,
      vacantTarget: null,
      destination: {
        kind: "listingManagement",
        listingId: L.id,
        placeId: P.id,
      },
    });
    expect(item?.labels).toContainEqual({ ref: L, label: "掲載L" });
  });
  it("listNotifications#7 店舗管理者が不在の店舗 V の掲載 LV が運営による非公開になり、サービス運営者 O に通知が届いた / O として読む", async () => {
    const k = notificationKit();
    const O = await k.person("o");
    await k.operators(O);
    const V = k.place("店舗V");
    const LV = await k.listing(V, { name: "掲載LV" });
    await k.consume(k.event(ListingEvents.suspended(LV.id, V.id, k.tick())));
    const [item] = (await list(k, O.actor)).items;
    expect(item).toMatchObject({
      delivery: "proxy",
      vacantTarget: V,
      pointedContent: LV,
      destination: {
        kind: "proxyOperation",
        target: V,
        direct: { kind: "listingManagement", listingId: LV.id, placeId: V.id },
      },
    });
    expect(item?.labels).toContainEqual({ ref: LV, label: "掲載LV" });
  });
  it("listNotifications#8 店舗管理者として行った申請 Ap が、最後の店舗管理者の退会で失効し、サービス運営者 O に失効の通知が届いた / O として読む", async () => {
    const k = notificationKit();
    const O = await k.person("o");
    await k.operators(O);
    const T1 = await k.person("t1");
    const Q = k.place("店舗Q");
    await k.appoint(Q, T1);
    const R = {
      kind: "region",
      id: RegionId.create(k.container.idGenerator.next()),
    } as const;
    const { entity: region } = Region.register(
      {
        id: R.id,
        content: RegionContent.create({
          name: "地域R",
          address: SampleAddress.otemachi(),
          location: GeoPoint.create(35.6848, 139.7639),
          photoIds: [PhotoId.create(k.container.idGenerator.next())],
          description: null,
          tagline: null,
        }),
      },
      k.tick(),
    );
    await k.container.unitOfWorkProvider.run(({ regionRepository }) =>
      regionRepository.insert(Region.publish(region, k.tick()).entity),
    );
    k.directory.add(R, "地域R");
    const submitted = await submitAffiliationChange({
      container: k.container,
      actor: T1.actor,
      input: {
        applicationId: k.container.idGenerator.next(),
        kind: "affiliation",
        actingAs: "steward",
        placeId: Q.id,
        regionId: R.id,
      },
    });
    const Ap = ApplicationId.create(submitted.id);
    await k.withdraw(T1);
    await reassessApplicationPremises.handle(k.container, {
      ...AuthorityEvents.stewardshipVacated(Q, k.tick()),
      id: EventId.create(k.container.idGenerator.next()),
    });
    const lapsed = await k.container.unitOfWorkProvider.run(
      ({ applicationRepository }) => applicationRepository.findById(Ap),
    );
    expect(lapsed?.entity.status).toEqual({
      kind: "lapsed",
      brokenPremises: ["placeHasSteward"],
    });
    await k.consume(
      k.event(
        ApplicationEvents.lapsed(
          Ap,
          { kind: "place", placeId: Q.id },
          k.tick(),
        ),
      ),
    );
    const [item] = (await list(k, O.actor)).items;
    expect(item).toMatchObject({
      occurrence: { to: "applicant", applicationId: Ap, matter: "lapsed" },
      delivery: "proxy",
      vacantTarget: Q,
      pointedContent: null,
      destination: {
        kind: "proxyOperation",
        target: Q,
        direct: { kind: "ownApplication", applicationId: Ap },
      },
    });
    expect(item?.labels).toEqual([
      { ref: Q, label: "店舗Q" },
      {
        ref: { kind: "application", id: Ap },
        label: {
          applicationKind: "affiliation",
          subjects: [
            { kind: "place", name: "店舗Q" },
            { kind: "region", name: "地域R" },
          ],
        },
      },
    ]);
  });
  it("listNotifications#9 利用者 A の店舗の登録申請 Ap が否認され、A に通知が届いた。店舗は作られていない / A として読む", async () => {
    const k = notificationKit();
    const O = await k.person("o");
    await k.operators(O);
    const A = await k.person("a");
    const apps = applicationFixtures(k);
    const { Ap1: Ap } = await apps.registration(A, "山田珈琲店");
    await apps.reject(O, Ap);
    await k.consume(
      k.event(
        ApplicationEvents.rejected(
          Ap,
          { kind: "individual", accountId: A.accountId },
          k.tick(),
        ),
      ),
    );
    const [item] = (await list(k, A.actor)).items;
    expect(item).toMatchObject({
      occurrence: { to: "applicant", applicationId: Ap, matter: "rejected" },
      labels: [
        {
          ref: { kind: "application", id: Ap },
          label: {
            applicationKind: "registration",
            subjects: [{ kind: "place", name: "山田珈琲店" }],
          },
        },
      ],
      destination: { kind: "ownApplication", applicationId: Ap },
    });
  });
  it("listNotifications#10 利用者 A の登録申請 Ap1 が承認されて店舗が作られ、その後に店舗の名称が変更された / A として読む", async () => {
    const k = notificationKit();
    const O = await k.person("o");
    await k.operators(O);
    const A = await k.person("a");
    const apps = applicationFixtures(k);
    const { Ap1, placeId } = await apps.registration(A, "山田珈琲店");
    await apps.approveRegistration(O, Ap1);
    await k.consume(
      k.event(
        ApplicationEvents.approved(
          Ap1,
          { kind: "individual", accountId: A.accountId },
          k.tick(),
        ),
      ),
    );
    k.directory.add({ kind: "place", id: placeId }, "やまだ珈琲");
    const [item] = (await list(k, A.actor)).items;
    expect(item?.labels).toEqual([
      {
        ref: { kind: "application", id: Ap1 },
        label: {
          applicationKind: "registration",
          subjects: [{ kind: "place", name: "山田珈琲店" }],
        },
      },
    ]);
  });
  it("listNotifications#11 利用者 A の掲載の申請 Ap が承認され、A に通知が届いた / A として読む", async () => {
    const k = notificationKit();
    const O = await k.person("o");
    await k.operators(O);
    const A = await k.person("a");
    const V = await k.registeredPlace("店舗V");
    const apps = applicationFixtures(k);
    const Ap = await apps.newListing(A, V, "季節のパフェ");
    await apps.approveListing(O, Ap);
    await k.consume(
      k.event(
        ApplicationEvents.approved(
          Ap,
          { kind: "individual", accountId: A.accountId },
          k.tick(),
        ),
      ),
    );
    const [item] = (await list(k, A.actor)).items;
    expect(item?.labels).toEqual([
      {
        ref: { kind: "application", id: Ap },
        label: {
          applicationKind: "listing",
          subjects: [
            { kind: "place", name: "店舗V" },
            { kind: "listing", name: "季節のパフェ" },
          ],
        },
      },
    ]);
  });

  it("listNotifications#12 地域運営者が不在の地域 RV への所属申請 Ap が提出され、サービス運営者 O に通知が届いた / O として読む", async () => {
    const k = notificationKit();
    const O = await k.person("o");
    await k.operators(O);
    const RV = k.region("地域RV");
    const Ap = k.applicationId();
    await k.consume(
      k.event(
        ApplicationEvents.submitted(
          Ap,
          { kind: "steward", target: RV },
          k.tick(),
        ),
      ),
    );
    const [item] = (await list(k, O.actor)).items;
    expect(item).toMatchObject({
      occurrence: { to: "approver", applicationId: Ap, matter: "submitted" },
      delivery: "proxy",
      vacantTarget: RV,
      pointedContent: null,
      destination: { kind: "applicationReview", applicationId: Ap },
    });
  });

  it("listNotifications#13 サービス運営者が A の店舗 P の管理権限を解除し、A に通知が届いた / A として読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const P = k.place("店舗P");
    await k.consume(
      k.event(
        AuthorityEvents.stewardRemoved(P, A.accountId, "revoked", k.tick()),
      ),
    );
    const [item] = (await list(k, A.actor)).items;
    expect(item).toMatchObject({
      occurrence: { to: "self", revoked: { kind: "stewardship", target: P } },
      pointedContent: P,
      labels: [{ ref: P, label: "店舗P" }],
      destination: null,
    });
  });

  it("listNotifications#14 S1 が、アカウントを持つ利用者 A のメールアドレスを店舗 P の管理メンバーに招待し（招待 I）、A に通知が届いた / A として読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const P = k.place("店舗P");
    const I = k.invitationId();
    await k.consume(
      k.event(AuthorityEvents.invitationIssued(P, I, A.email, k.tick())),
    );
    const [item] = (await list(k, A.actor)).items;
    expect(item).toMatchObject({
      occurrence: { to: "invitee", email: A.email, target: P, invitationId: I },
      pointedContent: P,
      labels: [{ ref: P, label: "店舗P" }],
      destination: { kind: "invitation", target: P, invitationId: I },
    });
  });

  it("listNotifications#15 店舗 P が地域 R から除外された通知を A が受けた後、A が店舗 P の店舗管理者を辞任した / A として読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const P = k.place("店舗P");
    const R = k.region("地域R");
    await k.appoint(P, A);
    await k.consume(
      k.event(
        RegionEvents.affiliationDissolved(P.id, R.id, "excluded", k.tick()),
      ),
    );
    const before = await list(k, A.actor);
    expect(before.items).toEqual([
      expect.objectContaining({
        occurrence: {
          to: "placeStewards",
          placeId: P.id,
          subject: {
            kind: "place",
            matter: { kind: "excluded_from_region", regionId: R.id },
          },
        },
        delivery: "direct",
        pointedContent: P,
        labels: [
          { ref: P, label: "店舗P" },
          { ref: R, label: "地域R" },
        ],
        destination: {
          kind: "placeManagement",
          placeId: P.id,
          facet: "affiliations",
        },
      }),
    ]);
    await k.removeSteward(P, A);
    expect(await list(k, A.actor)).toEqual(before);
  });
  it("listNotifications#16 公開中の読みもの A1 が紹介する掲載 L が削除され、編集担当者 E に通知が届いた / E として読む", async () => {
    const k = notificationKit({ realDirectory: true });
    const E = await k.person("e");
    await k.editors(E);
    const P = await k.registeredPlace("店舗P");
    const L = await k.listing(P, { name: "掲載L" });
    const A1 = await k.article([L], { title: "読みものA1" });
    await k.container.unitOfWorkProvider.run(async ({ listingRepository }) => {
      const found = await listingRepository.findById(L.id);
      if (found === null) throw new Error("no listing");
      await listingRepository.delete(L.id, found.expectedVersion);
    });
    await k.consume(k.event(ListingEvents.deleted(L.id, k.tick())));
    const { items } = await list(k, E.actor);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      occurrence: {
        to: "editors",
        articleId: A1.id,
        matter: {
          kind: "showcase_changed",
          change: { showcase: L, change: "deleted" },
        },
      },
      delivery: "direct",
      pointedContent: A1,
      vacantTarget: null,
      destination: { kind: "articleEditing", articleId: A1.id },
    });
    expect(items[0]?.labels).toEqual([
      { ref: A1, label: "読みものA1" },
      { ref: L, label: null },
    ]);
  });
  it("listNotifications#17 店舗 P への取り下げの申立て Cl が受け付けられ、サービス運営者 O に通知が届いた。その後、P が非公開になった / O として読む", async () => {
    const k = notificationKit({ realDirectory: true });
    const O = await k.person("o");
    await k.operators(O);
    const P = await k.registeredPlace("店舗P");
    const Cl = await k.takedownClaim(P);
    await k.consume(
      k.event(ModerationEvents.takedownClaimSubmitted(Cl, k.tick())),
    );
    await k.suspendPlace(P, O);
    expect(await k.container.referenceQueries.isViewable(P)).toBe(false);
    const [item] = (await list(k, O.actor)).items;
    expect(item).toMatchObject({
      occurrence: {
        to: "operators",
        matter: { kind: "takedown_claim_received", claimId: Cl },
      },
      labels: [{ ref: { kind: "takedownClaim", id: Cl }, label: "店舗P" }],
      destination: { kind: "takedownClaimHandling", claimId: Cl },
    });
    const [described] = await k.container.contentDirectory.describe([P]);
    expect(described?.name).toBe("店舗P");
    expect(item?.labels[0]?.label).toBe(described?.name);
  });
  it("listNotifications#18 カテゴリー K が移行先をカテゴリー K2 として廃止され、K を保存している掲載を持つ店舗 P の店舗管理者 A に通知が届いた / A として読む", async () => {
    const k = notificationKit();
    const { A, P, K, K2 } = await reassignedCategory(k);
    const [item] = (await list(k, A.actor)).items;
    expect(item).toMatchObject({
      occurrence: {
        to: "placeStewards",
        placeId: P.id,
        subject: {
          kind: "place",
          matter: { kind: "categories_reassigned", retiredCategoryId: K },
        },
      },
      labels: [
        { ref: P, label: "店舗P" },
        { ref: { kind: "category", id: K }, label: "K" },
      ],
      reassignedTo: { id: K2, name: "K2" },
      destination: {
        kind: "placeManagement",
        placeId: P.id,
        facet: "listings",
      },
    });
  });
  it("listNotifications#19 上の通知が届いた後、カテゴリー K2 の名称が変更された / A として読む", async () => {
    const k = notificationKit();
    const { A, K2 } = await reassignedCategory(k);
    const [before] = (await list(k, A.actor)).items;
    await k.renameCategory(K2, "K2改");
    const [item] = (await list(k, A.actor)).items;
    expect(item?.reassignedTo).toEqual({ id: K2, name: "K2改" });
    expect(item?.occurrence).toEqual(before?.occurrence);
  });
  it("listNotifications#20 その後、カテゴリー K2 が移行先をカテゴリー K3 として廃止された / A として読む", async () => {
    const k = notificationKit();
    const { A, K2 } = await reassignedCategory(k);
    const [before] = (await list(k, A.actor)).items;
    await k.renameCategory(K2, "K2改");
    const [K3] = await k.categories("K3");
    if (K3 === undefined) throw new Error("no category");
    await k.retireCategory(K2, K3);
    const [item] = (await list(k, A.actor)).items;
    expect(item?.reassignedTo).toEqual({ id: K3, name: "K3" });
    expect(item?.occurrence).toEqual(before?.occurrence);
  });

  it("listNotifications#21 管理権限の申請の承認で S3 が店舗 P の店舗管理者に加わり、A に通知が届いた / A として読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    const S3 = await k.person("s3");
    const P = await stewardAddedTo(k, A, S3);
    const [item] = (await list(k, A.actor)).items;
    expect(item).toMatchObject({
      occurrence: {
        to: "placeStewards",
        subject: { matter: { kind: "steward_added", appointee: S3.accountId } },
      },
      labels: [
        { ref: P, label: "店舗P" },
        { ref: { kind: "account", id: S3.accountId }, label: S3.email },
      ],
      destination: { kind: "placeManagement", placeId: P.id, facet: "members" },
    });
  });

  it("listNotifications#22 利用者 A の通知が、1ページの件数より多い / 1ページ目と2ページ目を読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    for (let i = 0; i < 5; i += 1) {
      await k.consume(
        k.event(
          AuthorityEvents.stewardRemoved(
            k.place(`店舗${i}`),
            A.accountId,
            "revoked",
            k.tick(),
          ),
        ),
      );
    }
    const first = await list(k, A.actor, { page: 1, limit: 3 });
    const second = await list(k, A.actor, { page: 2, limit: 3 });
    expect([first.count, second.count]).toEqual([5, 5]);
    const all = [...first.items, ...second.items];
    expect(all).toHaveLength(5);
    expect(new Set(all.map((item) => item.id)).size).toBe(5);
    const times = all.map((item) => item.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("listNotifications#23 メールが届かなかった通知（Mailer.send が失敗した） / 宛先の利用者として読む", async () => {
    const k = notificationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const P = k.place("店舗P");
    k.mailer.failWhen((mail) => mail.to === A.email);
    await k
      .consume(
        k.event(
          AuthorityEvents.stewardRemoved(P, A.accountId, "revoked", k.tick()),
        ),
      )
      .catch(() => undefined);
    k.mailer.failWhen(null);
    await k.consume(
      k.event(
        AuthorityEvents.stewardRemoved(P, B.accountId, "revoked", k.tick()),
      ),
    );
    expect(k.mailsTo(A)).toEqual([]);
    expect(k.mailsTo(B)).toHaveLength(1);
    const [failed] = (await list(k, A.actor)).items;
    const [sent] = (await list(k, B.actor)).items;
    const { id: _a, createdAt: _at, ...failedView } = failed ?? {};
    const { id: _b, createdAt: _bt, ...sentView } = sent ?? {};
    expect(failedView).toEqual(sentView);
  });
});

describe("listNotifications with stage-1 events", () => {
  it("returns the reader's notifications only, counting the reader's", async () => {
    const k = notificationKit();
    const [A, B, S3] = [
      await k.person("a"),
      await k.person("b"),
      await k.person("s3"),
    ];
    const P = k.place("店舗P");
    await k.appoint(P, A, B, S3);
    await k.consume(
      k.event(
        AuthorityEvents.stewardAppointed(
          P,
          S3.accountId,
          "application",
          k.tick(),
        ),
      ),
    );
    await k.consume(
      k.event(AuthorityEvents.roleGranted("editor", B.accountId, k.tick())),
    );
    const mine = await list(k, A.actor);
    expect(mine.count).toBe(1);
    expect((await list(k, B.actor)).count).toBe(2);
  });

  it("keeps a notification after its recipient resigned", async () => {
    const k = notificationKit();
    const [A, S3] = [await k.person("a"), await k.person("s3")];
    const P = await stewardAddedTo(k, A, S3);
    const before = await list(k, A.actor);
    await k.removeSteward(P, A);
    expect(await list(k, A.actor)).toEqual(before);
  });
});
