import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { NotFoundError } from "../../errors";
import {
  checkSubmissionEligibility,
  type EligibilityTargetInput,
} from "../checkSubmissionEligibility";
import { type AppKit, applicationKit } from "./kit";

const check = (k: AppKit, who: Person, target: EligibilityTargetInput) =>
  checkSubmissionEligibility({
    container: k.container,
    actor: who.actor,
    input: { target },
  });

const accepted = {
  accepted: true,
  brokenPremises: [],
  unviewable: [],
  activeDuplicate: null,
};

describe("checkSubmissionEligibility", () => {
  it.todo(
    "checkSubmissionEligibility#1 店舗 p1 は公開されていて、店舗管理者がいない。利用者 A の p1 への進行中の申請はない / A が、p1 の情報修正、p1 の掲載、p1 の公開中の地域 X への所属（個人として）について確かめる",
  ); // S3B: the affiliation kind

  it("accepts a revision and a listing of a public place without a steward, and writes nothing", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const mark = await k.mark();
    for (const kind of ["revision", "listing"] as const) {
      expect(await check(k, A, { kind, placeId: p1 })).toMatchObject({
        ...accepted,
        target: { kind, placeId: p1 },
        placeHasSteward: null,
      });
    }
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it.todo(
    "checkSubmissionEligibility#2 店舗 p1 に店舗管理者がいる / A が、p1 の情報修正、p1 の掲載、p1 の掲載 l1 の修正、p1 の所属（個人として）について確かめる",
  ); // S3B: the affiliation kind

  it("refuses a revision, a listing and a listing revision of a place with a steward on placeHasNoSteward", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    await k.manager(p1);
    for (const target of [
      { kind: "revision", placeId: p1 },
      { kind: "listing", placeId: p1 },
      { kind: "listingRevision", listingId: l1 },
    ] as const) {
      expect(await check(k, A, target)).toMatchObject({
        accepted: false,
        brokenPremises: ["placeHasNoSteward"],
        unviewable: [],
        activeDuplicate: null,
      });
    }
  });

  it("checkSubmissionEligibility#3 店舗 p1 に店舗管理者がいない / A が p1 の管理権限について確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    expect(await check(k, A, { kind: "stewardship", placeId: p1 })).toEqual({
      ...accepted,
      target: {
        kind: "stewardship",
        applicant: { kind: "individual", accountId: A.accountId },
        placeId: p1,
        registrationId: null,
      },
      placeHasSteward: false,
    });
  });

  it("checkSubmissionEligibility#4 店舗 p1 に店舗管理者 S がいる。A は店舗管理者でない / A が p1 の管理権限について確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.manager(p1, "s");
    expect(
      await check(k, A, { kind: "stewardship", placeId: p1 }),
    ).toMatchObject({ ...accepted, placeHasSteward: true });
  });

  it("checkSubmissionEligibility#5 A は p1 の店舗管理者 / A が p1 の管理権限について確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.appoint(k.ref(p1), A);
    expect(
      await check(k, A, { kind: "stewardship", placeId: p1 }),
    ).toMatchObject({
      accepted: false,
      brokenPremises: ["applicantNotSteward"],
      placeHasSteward: true,
    });
  });

  it("checkSubmissionEligibility#6 A の登録申請 r1 は取り下げになっている / A が、r1 を参照する管理権限の再申請について確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1 } = await k.register(A);
    await k.withdrawRaw(r1.id);
    expect(
      await check(k, A, { kind: "stewardship", registrationId: r1.id }),
    ).toMatchObject({
      accepted: false,
      brokenPremises: ["registrationStanding"],
      unviewable: [],
      target: { registrationId: r1.id, placeId: r1.reservedPlaceId },
    });
  });

  it("checkSubmissionEligibility#7 利用者 B の登録申請 r2 が確認中 / A が、r2 を参照する管理権限の再申請について確かめる", async () => {
    const k = await applicationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const { registration: r2 } = await k.register(B);
    await expectCode(
      check(k, A, { kind: "stewardship", registrationId: r2.id }),
      NotFoundError,
    );
  });

  it("checkSubmissionEligibility#8 A の登録申請 r1 は承認されて店舗 p1 が作られ、p1 はサービス運営者が非公開にしている / A が、r1 を参照する管理権限の再申請について確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1 } = await k.register(A);
    const p1 = await k.registrationApproved(r1.id);
    await k.suspendPlace(p1);
    expect(
      await check(k, A, { kind: "stewardship", registrationId: r1.id }),
    ).toMatchObject({
      accepted: false,
      brokenPremises: [],
      unviewable: [{ kind: "place", id: p1 }],
      target: { registrationId: null, placeId: p1 },
    });
  });

  it("checkSubmissionEligibility#9 A の p1 への情報修正の申請 a1 が差し戻し / A が p1 の情報修正について確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const a1 = await k.revise(A, p1);
    await k.sendBack(a1.id);
    expect(await check(k, A, { kind: "revision", placeId: p1 })).toMatchObject({
      accepted: false,
      brokenPremises: [],
      unviewable: [],
      activeDuplicate: a1.id,
    });
  });

  it.todo(
    "checkSubmissionEligibility#10 S は p1 の店舗管理者。p1 は地域 X に所属中 / S が、店舗管理者として、p1 の X への所属について確かめる",
  ); // S3B: the affiliation kind

  it.todo(
    "checkSubmissionEligibility#11 S は p1 の店舗管理者。イベント e1 は終了していて、p1 は e1 に参加中でもある / S が p1 の e1 への参加について確かめる",
  ); // S3B: the participation kind

  it("reports every broken premise at once, in the premise table's order", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1 } = await k.register(A);
    await k.reject(r1.id);
    // A becomes a steward of the reserved place (as if appointed otherwise).
    await k.appoint(k.ref(r1.reservedPlaceId), A);
    expect(
      await check(k, A, { kind: "stewardship", registrationId: r1.id }),
    ).toMatchObject({
      accepted: false,
      brokenPremises: ["applicantNotSteward", "registrationStanding"],
    });
  });

  it("checkSubmissionEligibility#12 店舗 p1 はサービス運営者が非公開にしている / A が p1 の情報修正について確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    await k.suspendPlace(p1);
    expect(await check(k, A, { kind: "revision", placeId: p1 })).toMatchObject({
      accepted: false,
      brokenPremises: [],
      unviewable: [{ kind: "place", id: p1 }],
    });
  });

  it("checkSubmissionEligibility#13 p1 の掲載 l1 は削除されている / A が l1 の修正について確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    await k.remove(await k.setupOperator(), l1);
    expect(
      await check(k, A, { kind: "listingRevision", listingId: l1 }),
    ).toMatchObject({
      accepted: false,
      brokenPremises: ["listingExists"],
      unviewable: [{ kind: "listing", id: l1 }],
    });
  });

  it.todo(
    "checkSubmissionEligibility#14 S は p1 の店舗管理者。p1 は、運営による非公開の地域 Z に所属中 / S が、店舗管理者として、p1 の Z からの離脱について確かめる",
  ); // S3B: the leave kind

  it("checkSubmissionEligibility#15 利用者 A がログインしている / A が、店舗の登録について確かめる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    expect(await check(k, A, { kind: "registration" })).toEqual({
      ...accepted,
      target: {
        kind: "registration",
        applicant: { kind: "individual", accountId: A.accountId },
      },
      placeHasSteward: null,
    });
  });

  it.todo(
    "checkSubmissionEligibility#16 A は p1 の店舗管理者でない / A が、店舗管理者として、p1 の e1 への参加について確かめる",
  ); // S3B: the participation kind (a steward's target, act_as_place)

  it("judges a listing revision's listing from the listing and its place", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const l1 = await k.listing(p1);
    expect(
      await check(k, A, { kind: "listingRevision", listingId: l1 }),
    ).toMatchObject(accepted);
    await k.suspendPlace(p1);
    expect(
      await check(k, A, { kind: "listingRevision", listingId: l1 }),
    ).toMatchObject({
      accepted: false,
      brokenPremises: [],
      unviewable: [{ kind: "listing", id: l1 }],
    });
  });
});
