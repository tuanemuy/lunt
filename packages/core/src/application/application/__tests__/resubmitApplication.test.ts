import type {
  Application,
  ApplicationOf,
} from "@repo/core/domain/application/application";
import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import { ApplicationId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { Place } from "@repo/core/domain/place/place";
import { PlaceProfile } from "@repo/core/domain/place/profile";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import {
  type ResubmissionContent,
  resubmitApplication,
} from "../resubmitApplication";
import { type AppKit, applicationKit, profileFields } from "./kit";

const resubmit = (
  k: AppKit,
  who: Person,
  app: Pick<Application, "id" | "version">,
  amended: ResubmissionContent,
  reply: string | null = null,
) =>
  resubmitApplication({
    container: k.container,
    actor: who.actor,
    input: { applicationId: app.id, version: app.version, amended, reply },
  });

const claimContent = (
  evidence = "03-1111-1111",
  relationship = "店主です",
): ResubmissionContent => ({ kind: "stewardship", relationship, evidence });

/** A revision of a fresh place by `who`, returned by the approver. */
async function returnedRevision(k: AppKit, who: Person) {
  const p1 = await k.place("喫茶ルント");
  const a3 = await k.revise(who, p1, { profile: { name: "喫茶ルント本店" } });
  return { p1, a3: await k.sendBack(a3.id) };
}

describe("resubmitApplication", () => {
  it("resubmitApplication#1 利用者 A の管理権限の申請 a1（店舗 p1）が、追加で必要な確認 q を添えて差し戻されている / A が、確かめたときの版を添えて、確認に使える連絡先を直し、回答 w を添えて a1 を再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const a1 = await k.claim(A, { placeId: p1 });
    const returned = await k.sendBack(a1.id, "店舗との関係を示す資料を");
    const mark = await k.mark();
    const result = await resubmit(
      k,
      A,
      returned,
      claimContent("店の電話 03-1111-1111"),
      "名刺の写しを送ります",
    );
    if (result.outcome !== "resubmitted") throw new Error("lapsed");
    const app = result.application as ApplicationOf<"stewardship">;
    expect(await k.app(a1.id)).toEqual(app);
    expect(app.id).toBe(a1.id);
    expect(app.content.evidence).toBe("店の電話 03-1111-1111");
    expect(app.status).toEqual({
      kind: "underReview",
      since: k.clock.now(),
      answering: {
        request: "店舗との関係を示す資料を",
        reply: "名刺の写しを送ります",
      },
    });
    expect(app.submittedAt).toEqual(a1.submittedAt);
    expect(app.version).toBe(returned.version + 1);
    expect(await k.eventsSince(mark)).toEqual([
      expect.objectContaining({
        type: "application.resubmitted",
        payload: { applicationId: a1.id, approver: { kind: "operator" } },
      }),
    ]);
  });

  it("resubmitApplication#2 A の登録申請 a2 が差し戻し。内容の写真は ph1、ph2。A が登録した、持ち主のない写真 ph3 がある / A が、写真を ph1、ph3 にして a2 を再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const [ph1, ph2, ph3] = await k.photos(A, 3);
    if (ph1 === undefined || ph2 === undefined || ph3 === undefined) {
      throw new Error("no photos");
    }
    const { registration: a2 } = await k.register(A, {
      profile: { photoIds: [ph1, ph2] },
    });
    const returned = await k.sendBack(a2.id);
    const mark = await k.mark();
    const result = await resubmit(k, A, returned, {
      kind: "registration",
      profile: profileFields({ name: "新しい店", photoIds: [ph1, ph3] }),
    });
    const app = result.application as ApplicationOf<"registration">;
    expect(result.outcome).toBe("resubmitted");
    expect(PhotoSet.photoIds(app.content.photos)).toEqual([ph1, ph3]);
    expect(app.reservedPlaceId).toBe(a2.reservedPlaceId);
    expect(await k.photoOwner(ph3)).toEqual(k.applicationOwner(a2.id));
    const released = await k.eventsSince(mark, "photos.released");
    expect(released).toEqual([
      expect.objectContaining({
        aggregateId: a2.id,
        payload: { photoIds: [ph2] },
      }),
    ]);
  });

  it("resubmitApplication#3 A の情報修正の申請 a3（店舗 p1、名称の項目）が差し戻し。その後、p1 の紹介が別の承認で変わっている / A が、名称と営業時間を直した内容で a3 を再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { p1, a3 } = await returnedRevision(k, A);
    await k.changePlace(
      p1,
      (place, now) =>
        Place.updateProfile(
          place,
          PlaceProfile.create({
            name: place.profile.name,
            photoIds: [],
            description: "承認で変わった紹介",
            address: place.profile.address,
            location: place.profile.location,
            businessHours: null,
            contact: null,
          }),
          now,
        ).entity,
    );
    const result = await resubmit(k, A, a3, {
      kind: "revision",
      profile: await k.fieldsOf(p1, {
        name: "喫茶ルント駅前店",
        businessHours: "8:00-20:00",
      }),
      operatingStatus: "open",
    });
    const app = result.application as ApplicationOf<"revision">;
    expect(FieldPatch.fields(app.content)).toEqual(["name", "businessHours"]);
  });

  it.todo(
    "resubmitApplication#4 店舗 p1 について店舗管理者として行った所属の申請 a4（地域 X）が、追加で必要な確認 q2 を添えて差し戻し。S は p1 の店舗管理者 / S が、回答 w2 だけを添えて a4 を再提出する",
  ); // S3B: the affiliation kind (a steward's application)

  it.todo(
    "resubmitApplication#5 店舗 p1 の店舗管理者 T が店舗管理者として行った参加の申請 a5 が差し戻し。S は p1 の別の店舗管理者 / S が、添える掲載と参加日を直して a5 を再提出する",
  ); // S3B: the participation kind

  it.todo(
    "resubmitApplication#6 a5 を提出した T は、p1 の店舗管理者を辞任している。S は p1 の店舗管理者 / S が a5 を再提出する",
  ); // S3B: the participation kind

  it.todo(
    "resubmitApplication#7 参加の申請 a5 に添えた掲載 l1 は、差し戻しの間に提供終了になった。S は p1 の店舗管理者 / S が、l1 を添えたまま a5 を再提出する",
  ); // S3B: the participation kind

  it.todo(
    "resubmitApplication#8 参加の申請 a5 に添えた掲載 l2 は、差し戻しの間に一時非公開になった / S が、l2 を添えたまま a5 を再提出する",
  ); // S3B: the participation kind

  it.todo(
    "resubmitApplication#9 参加の申請 a5 は掲載 l1 を添えて差し戻し。p1 の掲載 l3 は一時非公開 / S が、l3 を新たに添えて a5 を再提出する",
  ); // S3B: the participation kind

  it("resubmitApplication#10 A の登録申請 r1 が差し戻し。r1 に併せた管理権限の申請 s1 は確認中 / A が、店舗の情報を直し、回答を添えて r1 を再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    const returned = await k.sendBack(r1.id);
    const result = await resubmit(
      k,
      A,
      returned,
      { kind: "registration", profile: profileFields({ name: "直した店" }) },
      "名称を直しました",
    );
    expect(result.outcome).toBe("resubmitted");
    expect(result.application.status.kind).toBe("underReview");
    expect(await k.app(s1.id)).toEqual(s1);
  });

  it("resubmitApplication#11 A の情報修正の申請 a3（店舗 p1）が差し戻しの間に、p1 に店舗管理者が就いた。前提の再評価はまだ届いていない / A が a3 を再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { p1, a3 } = await returnedRevision(k, A);
    await k.manager(p1);
    const mark = await k.mark();
    const result = await resubmit(k, A, a3, {
      kind: "revision",
      profile: await k.fieldsOf(p1, { name: "喫茶ルント駅前店" }),
      operatingStatus: "open",
    });
    expect(result).toEqual({
      outcome: "lapsed",
      application: expect.objectContaining({
        status: { kind: "lapsed", brokenPremises: ["placeHasNoSteward"] },
      }),
      brokenPremises: ["placeHasNoSteward"],
    });
    expect((await k.app(a3.id)).status).toEqual({
      kind: "lapsed",
      brokenPremises: ["placeHasNoSteward"],
    });
    expect((await k.eventsSince(mark)).map((e) => e.type)).toEqual([
      "application.lapsed",
    ]);
  });

  it("resubmitApplication#12 A の情報修正の申請 a3 が差し戻しの間に、店舗 p1 がサービス運営者によって非公開になった / A が a3 を再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { p1, a3 } = await returnedRevision(k, A);
    await k.suspendPlace(p1);
    const result = await resubmit(k, A, a3, {
      kind: "revision",
      profile: await k.fieldsOf(p1, { name: "喫茶ルント駅前店" }),
      operatingStatus: "open",
    });
    expect(result.outcome).toBe("resubmitted");
    expect(result.application.status.kind).toBe("underReview");
  });

  it("resubmitApplication#13 A の申請 a1 が差し戻し。利用者 B は申請者でない / B が a1 を再提出する", async () => {
    const k = await applicationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const a1 = await k.claim(A, { placeId: await k.place() });
    const returned = await k.sendBack(a1.id);
    await expectCode(resubmit(k, B, returned, claimContent()), ForbiddenError);
    expect(await k.app(a1.id)).toEqual(returned);
  });

  it.todo(
    "resubmitApplication#14 店舗 p1 について店舗管理者として行った申請 a4 が差し戻し。T は p1 の管理権限を解除されている / T が、自分が提出した a4 を再提出する",
  ); // S3B: a steward's application (affiliation, leave, participation)

  it("resubmitApplication#15 A の申請 a1 は確認中（再提出の後） / A が a1 をもう一度再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const a1 = await k.claim(A, { placeId: await k.place() });
    const returned = await k.sendBack(a1.id);
    const first = await resubmit(k, A, returned, claimContent());
    await expectCode(
      resubmit(k, A, first.application, claimContent("別の連絡先")),
      Error,
      "APPLICATION_UNDER_REVIEW",
    );
    expect(await k.app(a1.id)).toEqual(first.application);
  });

  it("resubmitApplication#16 A の申請 a3 は、修正している間に失効した / A が a3 を再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { p1, a3 } = await returnedRevision(k, A);
    await k.manager(p1);
    await k.lapse(a3.id);
    await expectCode(
      resubmit(k, A, a3, {
        kind: "revision",
        profile: await k.fieldsOf(p1, { name: "喫茶ルント駅前店" }),
        operatingStatus: "open",
      }),
      Error,
      "APPLICATION_ALREADY_LAPSED",
    );
  });

  it.todo(
    "resubmitApplication#17 店舗 p1 について店舗管理者として行った申請 a5 が差し戻し。S と T がどちらも同じ版で修正を始め、T が先に再提出して承認者がもう一度差し戻した / S が、古い版を添えて a5 を再提出する",
  ); // S3B: a steward's application (participation)

  it("refuses a version older than the stored one (resubmitted and returned again since)", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const a1 = await k.claim(A, { placeId: await k.place() });
    const returned = await k.sendBack(a1.id);
    await resubmit(k, A, returned, claimContent("先の連絡先"));
    const again = await k.sendBack(a1.id);
    await expectCode(
      resubmit(k, A, returned, claimContent("後の連絡先")),
      ConflictError,
    );
    expect(await k.app(a1.id)).toEqual(again);
  });

  it("resubmitApplication#18 A の情報修正の申請 a3 が差し戻し / A が、店舗の現在の内容から何も変えない内容で再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { p1, a3 } = await returnedRevision(k, A);
    await expectCode(
      resubmit(k, A, a3, {
        kind: "revision",
        profile: await k.fieldsOf(p1),
        operatingStatus: "open",
      }),
      Error,
      "COMMON_INVALID_FIELD_PATCH",
    );
    expect(await k.app(a3.id)).toEqual(a3);
  });

  it("resubmitApplication#19 A の管理権限の申請 a1 が、追加で必要な確認 q を添えて差し戻し / A が、回答を添えずに、連絡先だけを直して再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const a1 = await k.claim(A, { placeId: await k.place() });
    const returned = await k.sendBack(a1.id, "q");
    const result = await resubmit(k, A, returned, claimContent("直した連絡先"));
    expect(result.application.status).toEqual({
      kind: "underReview",
      since: k.clock.now(),
      answering: { request: "q", reply: null },
    });
  });

  it("resubmitApplication#20 A の管理権限の申請 a1 が差し戻し / A が、回答を空白だけにして再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const a1 = await k.claim(A, { placeId: await k.place() });
    const returned = await k.sendBack(a1.id);
    await expectCode(
      resubmit(k, A, returned, claimContent(), "   "),
      Error,
      "APPLICATION_INVALID_RETURN_REPLY",
    );
    expect(await k.app(a1.id)).toEqual(returned);
  });

  it("resubmitApplication#21 A の管理権限の申請 a1 が差し戻し / A が、店舗との関係を空にして再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const a1 = await k.claim(A, { placeId: await k.place() });
    const returned = await k.sendBack(a1.id);
    await expectCode(
      resubmit(k, A, returned, claimContent("03-1111-1111", " ")),
      Error,
      "APPLICATION_INVALID_STEWARDSHIP_CLAIM",
    );
  });

  it("resubmitApplication#22 ID が a9 の申請はない / A が a9 を再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const a1 = await k.claim(A, { placeId: await k.place() });
    await expectCode(
      resubmit(
        k,
        A,
        { id: ApplicationId.create(k.newId()), version: a1.version },
        claimContent(),
      ),
      NotFoundError,
    );
  });

  it("resubmitApplication#23 A の情報修正の申請 a3 が差し戻し / A が、掲載の修正の内容で a3 を再提出する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { a3 } = await returnedRevision(k, A);
    await expectCode(
      resubmit(k, A, a3, { kind: "listingRevision", content: k.content() }),
      NotFoundError,
    );
    expect(await k.app(a3.id)).toEqual(a3);
  });

  it("rebuilds a listing revision's patch against the listing now and claims only the photos it newly adds", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1, { name: "モーニング" });
    const ph1 = await k.photo(A);
    const app = await k.reviseListing(A, l1, { name: "直した掲載" });
    const returned = await k.sendBack(app.id);
    const current = await k.listingInput(l1);
    const result = await resubmit(k, A, returned, {
      kind: "listingRevision",
      content: {
        ...current,
        photos: [...current.photos, { photoId: ph1, framing: null }],
      },
    });
    const resubmitted = result.application as ApplicationOf<"listingRevision">;
    expect(FieldPatch.fields(resubmitted.content)).toEqual(["photos"]);
    expect(await k.photoOwner(ph1)).toEqual(k.applicationOwner(app.id));
  });

  it("checks a resubmitted listing's category is active", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const app = await k.newListing(A, p1);
    const returned = await k.sendBack(app.id);
    const c2 = await k.addCategory("季節もの");
    await k.retireCategory(c2, await k.category("買う"));
    await expectCode(
      resubmit(k, A, returned, {
        kind: "listing",
        content: k.content({
          photos: app.content.photos.items,
          categoryId: c2,
        }),
      }),
      Error,
      "LISTING_CATEGORY_NOT_AVAILABLE",
    );
  });
});
