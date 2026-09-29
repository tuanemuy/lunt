import { AccountEvents } from "@repo/core/domain/account/events";
import type { Application } from "@repo/core/domain/application/application";
import { ApplicationEvents } from "@repo/core/domain/application/events";
import { AuthorityEvents } from "@repo/core/domain/authority/events";
import type {
  AccountId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { ListingEvents } from "@repo/core/domain/listing/events";
import { OccasionEvents } from "@repo/core/domain/occasion/events";
import { RegionEvents } from "@repo/core/domain/region/events";
import { describe, expect, it } from "vitest";
import { rejection } from "../../authority/__tests__/kit";
import { ConflictError } from "../../errors";
import { reassessApplicationPremises } from "../reassessApplicationPremises";
import { withdrawApplicationsOfWithdrawnAccount } from "../withdrawApplicationsOfWithdrawnAccount";
import { commitAfterRun } from "./kit";
import { oct, type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

type ReviewKit = StewardSeatKit;

const placeRef = (id: PlaceId) => ({ kind: "place", id }) as const;

const appointed = (k: ReviewKit, placeId: PlaceId, accountId: AccountId) =>
  k.delivered(
    AuthorityEvents.stewardAppointed(
      placeRef(placeId),
      accountId,
      "invitation",
      k.tick(),
    ),
  );

const vacated = (k: ReviewKit, placeId: PlaceId) =>
  k.delivered(AuthorityEvents.stewardshipVacated(placeRef(placeId), k.tick()));

const affiliationEstablished = (
  k: ReviewKit,
  placeId: PlaceId,
  regionId: RegionId,
) =>
  k.delivered(RegionEvents.affiliationEstablished(placeId, regionId, k.tick()));

const consume = (
  k: ReviewKit,
  event: Parameters<typeof reassessApplicationPremises.handle>[1],
  container = k.container,
) => reassessApplicationPremises.handle(container, event);

/** The stored applications, in the given order. */
const appsOf = (
  k: ReviewKit,
  apps: readonly Pick<Application, "id">[],
): Promise<readonly Application[]> => Promise.all(apps.map((a) => k.app(a.id)));

/**
 * The applications individuals made about a place without a steward:
 * A's revision a1 (under review), B's listing application a2 (returned)
 * with a photo, A's listing revision a3 (under review), B's affiliation
 * a4 with region X and A's leave a5 from region Y (both under review).
 */
async function individualsAbout() {
  const k = await stewardSeatKit();
  const A = await k.person("A");
  const B = await k.person("B");
  const S = await k.person("S");
  const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 1);
  const [X, Y] = [
    await k.addRegion({ name: "X" }),
    await k.addRegion({ name: "Y" }),
  ];
  await k.affiliate(p1, Y);
  const l1 = await k.listing(p1);
  const a1 = await k.revise(A, p1);
  const photo = await k.photo(B);
  const a2 = await k.newListing(B, p1, { photos: [photo] });
  await k.sendBackAs(k.O, a2.id);
  const a3 = await k.reviseListing(A, l1);
  const a4 = await k.affiliateAsIndividual(B, { placeId: p1, regionId: X });
  const a5 = await k.leaveAsIndividual(A, { placeId: p1, regionId: Y });
  return { k, A, B, S, p1, l1, X, Y, a1, a2, a3, a4, a5, photo };
}

/**
 * Place p1 with its steward S; S's affiliation b1 with region X (under
 * review) and participation b2 in an upcoming occasion (returned), both
 * filed as the place.
 */
async function placeApplications() {
  const k = await stewardSeatKit();
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  const X = await k.addRegion();
  const e1 = await k.addOccasion();
  const b1 = await k.affiliateAsPlace(S, { placeId: p1, regionId: X });
  const b2 = await k.participationApp(S, { placeId: p1, occasionId: e1 });
  await k.sendBack(b2.id);
  return { k, p1, S, X, e1, b1, b2 };
}

/**
 * Occasion e1 (upcoming, 10/1〜10/3) and two places with stewards; the
 * first place's participation c1 is under review, the second's c2 is
 * returned.
 */
async function participationsIn() {
  const k = await stewardSeatKit();
  const e1 = await k.addOccasion();
  const [p1, p2] = [await k.place("一の店"), await k.place("二の店")];
  const [S1, S2] = [await k.manager(p1, "S1"), await k.manager(p2, "S2")];
  const c1 = await k.participationApp(S1, { placeId: p1, occasionId: e1 });
  const c2 = await k.participationApp(S2, { placeId: p2, occasionId: e1 });
  await k.sendBack(c2.id);
  return { k, e1, p1, p2, S1, S2, c1, c2 };
}

const occasionEvent = {
  cancelled: (k: ReviewKit, id: OccasionId) =>
    k.delivered(OccasionEvents.cancelled(id, k.tick())),
  periodChanged: (k: ReviewKit, id: OccasionId) =>
    k.delivered(OccasionEvents.periodChanged(id, k.tick())),
};

const lapsedOn = (...brokenPremises: readonly string[]) => ({
  kind: "lapsed",
  brokenPremises,
});

describe("reassessApplicationPremises", () => {
  it("reassessApplicationPremises#1 管理者のいなかった店舗 p1 に、利用者 S が店舗管理者として就いた。個人が p1 に行った、A の情報修正の申請 a1（確認中）、B の掲載の申請 a2（差し戻し）、A の掲載の修正の申請 a3（確認中）、B の所属の申請 a4（確認中）、A の離脱の申請 a5（確認中）がある / p1 の authority.steward_appointed を消費する", async () => {
    const { k, A, B, S, p1, l1, Y, a1, a2, a3, a4, a5, photo } =
      await individualsAbout();
    await k.appoint(placeRef(p1), S);
    const [place, listing] = [await k.getPlace(p1), await k.listingOf(l1)];
    const mark = await k.mark();

    await consume(k, appointed(k, p1, S.accountId));

    for (const app of await appsOf(k, [a1, a2, a3, a4, a5])) {
      expect(app.status).toEqual(lapsedOn("placeHasNoSteward"));
    }
    const lapsed = await k.eventsSince(mark);
    expect(lapsed.map((e) => e.type)).toEqual(
      Array(5).fill("application.lapsed"),
    );
    const individual = (who: typeof A) => ({
      kind: "individual",
      accountId: who.accountId,
    });
    expect(lapsed.map((e) => e.payload)).toEqual([
      { applicationId: a1.id, applicant: individual(A) },
      { applicationId: a2.id, applicant: individual(B) },
      { applicationId: a3.id, applicant: individual(A) },
      { applicationId: a4.id, applicant: individual(B) },
      { applicationId: a5.id, applicant: individual(A) },
    ]);
    // Nothing is reflected, and the application keeps its photo.
    expect(await k.getPlace(p1)).toEqual(place);
    expect(await k.listingOf(l1)).toEqual(listing);
    expect(await k.findListing(a2.reservedListingId)).toBeNull();
    expect(await k.affiliatedRegions(p1)).toEqual([Y]);
    expect(await k.photoOwner(photo)).toEqual(k.applicationOwner(a2.id));
  });

  it("reassessApplicationPremises#2 同上。別の利用者 C の p1 への管理権限の申請 a6 が確認中 / p1 の authority.steward_appointed を消費する", async () => {
    const { k, S, p1, a1, a2, a3, a4, a5 } = await individualsAbout();
    const C = await k.person("C");
    const a6 = await k.claim(C, { placeId: p1 });
    await k.appoint(placeRef(p1), S);
    const before = await k.app(a6.id);
    const mark = await k.mark();

    await consume(k, appointed(k, p1, S.accountId));

    expect(await k.app(a6.id)).toEqual(before);
    for (const app of await appsOf(k, [a1, a2, a3, a4, a5])) {
      expect(app.status.kind).toBe("lapsed");
    }
    expect(
      (await k.eventsSince(mark)).map(
        (e) => (e.payload as { applicationId: string }).applicationId,
      ),
    ).not.toContain(a6.id);
  });

  it("reassessApplicationPremises#3 利用者 A の p1 への管理権限の申請 a7 が確認中。A が招待の承諾で p1 の店舗管理者になった / p1 の authority.steward_appointed を消費する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const { placeId: p1, claim: a7 } = await k.claimOnPlace(A);
    await k.appoint(placeRef(p1), A);

    await consume(k, appointed(k, p1, A.accountId));

    expect((await k.app(a7.id)).status).toEqual({
      kind: "lapsed",
      brokenPremises: ["applicantNotSteward"],
    });
  });

  it("reassessApplicationPremises#4 店舗 p1 が店舗管理者として行った、所属の申請 b1（確認中）と参加の申請 b2（差し戻し）がある。p1 の最後の店舗管理者が辞任した / p1 の authority.stewardship_vacated を消費する", async () => {
    const { k, p1, S, b1, b2 } = await placeApplications();
    await k.removeSteward(placeRef(p1), S);
    const mark = await k.mark();

    await consume(k, vacated(k, p1));

    for (const app of await appsOf(k, [b1, b2])) {
      expect(app.status).toEqual(lapsedOn("placeHasSteward"));
    }
    expect((await k.eventsSince(mark)).map((e) => e.payload)).toEqual([
      { applicationId: b1.id, applicant: { kind: "place", placeId: p1 } },
      { applicationId: b2.id, applicant: { kind: "place", placeId: p1 } },
    ]);
  });

  it("a vacated place's stewardship is re-read; the individuals' applications about it, whose premise holds again, stay as they are", async () => {
    const { k, p1, a1, a2, a3 } = await individualsAbout();
    const before = await Promise.all([a1, a2, a3].map((a) => k.app(a.id)));
    const mark = await k.mark();

    await consume(
      k,
      k.delivered(AuthorityEvents.stewardshipVacated(placeRef(p1), k.tick())),
    );

    expect(await Promise.all([a1, a2, a3].map((a) => k.app(a.id)))).toEqual(
      before,
    );
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("reassessApplicationPremises#5 店舗 p1 について店舗管理者として行った申請 b1 が確認中。b1 を提出した店舗管理者 T が辞任し、店舗管理者 S が残っている（authority.stewardship_vacated は出ない）。その後、p1 の別の地域への所属が成立した / p1 の region.affiliation_established を消費する", async () => {
    const k = await stewardSeatKit();
    const p1 = await k.place();
    const T = await k.manager(p1, "T");
    await k.manager(p1, "S");
    const [X, Y] = [await k.addRegion(), await k.addRegion()];
    const b1 = await k.affiliateAsPlace(T, { placeId: p1, regionId: X });
    await k.removeSteward(placeRef(p1), T);
    await k.affiliate(p1, Y);
    const mark = await k.mark();

    await consume(k, affiliationEstablished(k, p1, Y));

    expect(await k.app(b1.id)).toEqual(b1);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("reassessApplicationPremises#6 登録申請 r1 と、併せた管理権限の申請 s1 が確認中だった。r1 が否認された / r1 の application.rejected を消費する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.rejectAs(k.O, r1.id);

    await consume(
      k,
      k.delivered(
        ApplicationEvents.rejected(r1.id, r1.target.applicant, k.tick()),
      ),
    );

    expect((await k.app(s1.id)).status).toEqual({
      kind: "lapsed",
      brokenPremises: ["registrationStanding"],
    });
  });

  it("reassessApplicationPremises#7 登録申請 r1 と、併せた管理権限の申請 s1 が確認中だった。r1 が取り下げられた / r1 の application.withdrawn を消費する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.withdrawAs(A, r1.id);

    await consume(
      k,
      k.delivered(
        ApplicationEvents.withdrawn(r1.id, { kind: "operator" }, k.tick()),
      ),
    );

    expect((await k.app(s1.id)).status).toEqual({
      kind: "lapsed",
      brokenPremises: ["registrationStanding"],
    });
  });

  it("reassessApplicationPremises#8 A の退会の消費で、登録申請 r1 と、併せた管理権限の申請 s1 が同じ UnitOfWork で取り下げになった / r1 の application.withdrawn を消費する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.deleteAccount(A);
    await withdrawApplicationsOfWithdrawnAccount.handle(
      k.container,
      k.delivered(AccountEvents.withdrawn(A.accountId, k.tick())),
    );
    expect((await k.app(s1.id)).status.kind).toBe("withdrawn");
    const mark = await k.mark();

    await consume(
      k,
      k.delivered(
        ApplicationEvents.withdrawn(r1.id, { kind: "operator" }, k.tick()),
      ),
    );

    expect((await k.app(s1.id)).status.kind).toBe("withdrawn");
    expect(await k.eventsSince(mark, "application.lapsed")).toEqual([]);
  });

  it("reassessApplicationPremises#9 情報修正の申請 a1 が否認された（登録申請でない） / a1 の application.rejected を消費する", async () => {
    const { k, S, p1, a1, a2, a3 } = await individualsAbout();
    await k.rejectAs(k.O, a1.id);
    await k.appoint(placeRef(p1), S);
    const before = await Promise.all([a2, a3].map((a) => k.app(a.id)));
    const mark = await k.mark();

    await consume(
      k,
      k.delivered(
        ApplicationEvents.rejected(a1.id, a1.target.applicant, k.tick()),
      ),
    );

    expect(await Promise.all([a2, a3].map((a) => k.app(a.id)))).toEqual(before);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("reassessApplicationPremises#10 掲載 l1 への修正の申請 a3 が確認中。l1 が削除された / l1 の listing.deleted を消費する", async () => {
    const { k, l1, a3 } = await individualsAbout();
    await k.remove(await k.setupOperator(), l1);

    await consume(k, k.delivered(ListingEvents.deleted(l1, k.tick())));

    expect((await k.app(a3.id)).status).toEqual({
      kind: "lapsed",
      brokenPremises: ["listingExists"],
    });
  });

  it("reassessApplicationPremises#11 店舗 p2 の地域 X への所属の申請が、A のもの（b3）と B のもの（b4）、どちらも確認中だった。b3 が承認されて所属が成立した / region.affiliation_established を消費する", async () => {
    const k = await stewardSeatKit();
    const [A, B, C] = [
      await k.person("A"),
      await k.person("B"),
      await k.person("C"),
    ];
    const p2 = await k.place();
    const [X, Y] = [await k.addRegion(), await k.addRegion()];
    const R = await k.regionSteward(X, "R");
    const b3 = await k.affiliateAsIndividual(A, { placeId: p2, regionId: X });
    const b4 = await k.affiliateAsIndividual(B, { placeId: p2, regionId: X });
    const toY = await k.affiliateAsIndividual(C, { placeId: p2, regionId: Y });
    await k.approveAffiliationAs(R, b3.id);
    const mark = await k.mark();

    await consume(k, affiliationEstablished(k, p2, X));

    expect((await k.app(b4.id)).status).toEqual(lapsedOn("notAffiliated"));
    expect(await k.app(toY.id)).toEqual(toY);
    expect((await k.eventsSince(mark)).map((e) => e.payload)).toEqual([
      {
        applicationId: b4.id,
        applicant: { kind: "individual", accountId: B.accountId },
      },
    ]);
  });

  it("reassessApplicationPremises#12 店舗 p1 の X からの離脱の申請 b5 が確認中。X の運営者が p1 を除外した / region.affiliation_dissolved を消費する", async () => {
    const k = await stewardSeatKit();
    const p1 = await k.place();
    const S = await k.manager(p1, "S");
    const X = await k.addRegion();
    await k.affiliate(p1, X);
    const b5 = await k.leaveAsPlace(S, { placeId: p1, regionId: X });
    await k.exclude(p1, X);

    await consume(
      k,
      k.delivered(
        RegionEvents.affiliationDissolved(p1, X, "excluded", k.tick()),
      ),
    );

    expect((await k.app(b5.id)).status).toEqual(lapsedOn("affiliated"));
  });

  it("reassessApplicationPremises#13 イベント e1 への参加の申請 c1（確認中）と c2（差し戻し）がある。e1 が中止になった / e1 の occasion.cancelled を消費する", async () => {
    const { k, e1, c1, c2 } = await participationsIn();
    await k.cancelOccasion(e1);

    await consume(k, occasionEvent.cancelled(k, e1));

    for (const app of await appsOf(k, [c1, c2])) {
      expect(app.status).toEqual(lapsedOn("occasionOpen"));
    }
  });

  it("reassessApplicationPremises#14 e1 への参加の申請 c1 が確認中。日次のジョブが e1 の終了を確かめた / e1 の occasion.ended を消費する", async () => {
    const { k, e1, c1 } = await participationsIn();
    // 「今日」 2026-07-10 → 2026-10-08, after the period 10/1〜10/3.
    k.passDays(90);

    await consume(
      k,
      k.delivered(
        OccasionEvents.ended(
          e1,
          LocalDate.fromInstant(k.clock.now()),
          k.tick(),
        ),
      ),
    );

    expect((await k.app(c1.id)).status).toEqual(lapsedOn("occasionOpen"));
  });

  it("reassessApplicationPremises#15 e1 への参加の申請 c1（確認中）と c2（差し戻し）がある。e1 の開催期間が過去の日付へ更新され、開催の状態が終了になった / e1 の occasion.period_changed を消費する", async () => {
    const { k, e1, c1, c2 } = await participationsIn();
    await k.setPeriod(e1, [
      LocalDate.parse("2026-07-01"),
      LocalDate.parse("2026-07-05"),
    ]);

    await consume(k, occasionEvent.periodChanged(k, e1));

    for (const app of await appsOf(k, [c1, c2])) {
      expect(app.status).toEqual(lapsedOn("occasionOpen"));
    }
  });

  it("reassessApplicationPremises#16 e1 への参加の申請 c1 が確認中。e1 の開催期間が別の未来の日付へ更新され、開催の状態は開催前のまま / e1 の occasion.period_changed を消費する", async () => {
    const { k, e1, c1 } = await participationsIn();
    await k.setPeriod(e1, [oct(10), oct(12)]);
    const mark = await k.mark();

    await consume(k, occasionEvent.periodChanged(k, e1));

    expect(await k.app(c1.id)).toEqual(c1);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("reassessApplicationPremises#17 e1 への参加の申請 c1 が確認中。e1 は公開を取り下げていて、開催期間を消す更新で開催の状態がなくなった / e1 の occasion.period_changed を消費する", async () => {
    const { k, e1, c1 } = await participationsIn();
    await k.unpublishOccasion(e1);
    await k.setPeriod(e1, null);

    await consume(k, occasionEvent.periodChanged(k, e1));

    expect(await k.app(c1.id)).toEqual(c1);
  });

  it("reassessApplicationPremises#18 e1 への、店舗 p1 の参加の申請 c1 が確認中。p1 の最後の店舗管理者が辞任して p1 が管理者不在になり、e1 の運営者が p1 を直接追加し、その後に利用者 T が p1 の店舗管理者に就いた。辞任と就任による再評価は、まだ届いていない / p1 の occasion.participation_established を消費する", async () => {
    const { k, e1, p1, S1, c1 } = await participationsIn();
    await k.removeSteward(placeRef(p1), S1);
    await k.participate(e1, p1);
    await k.manager(p1, "T");

    await consume(
      k,
      k.delivered(OccasionEvents.participationEstablished(e1, p1, k.tick())),
    );

    expect((await k.app(c1.id)).status).toEqual(lapsedOn("notParticipating"));
  });

  it("reassessApplicationPremises#19 c1 は e1 の中止で失効した。その後、中止が取り消された / 再配送された e1 の occasion.cancelled を消費する", async () => {
    const { k, e1, c1 } = await participationsIn();
    await k.cancelOccasion(e1);
    const event = occasionEvent.cancelled(k, e1);
    await consume(k, event);
    await k.revokeCancellation(e1);
    const lapsed = await k.app(c1.id);
    const mark = await k.mark();

    await consume(k, event);

    expect(await k.app(c1.id)).toEqual(lapsed);
    expect(lapsed.status).toEqual(lapsedOn("occasionOpen"));
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("reassessApplicationPremises#20 情報修正の申請 a1 の対象の店舗 p1（店舗管理者がいない）が、サービス運営者によって非公開になった。その後、p1 の地域への所属が成立した / p1 の region.affiliation_established を消費する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const p1 = await k.place();
    const a1 = await k.revise(A, p1);
    await k.suspendPlace(p1);
    const X = await k.addRegion();
    await k.affiliate(p1, X);

    await consume(k, affiliationEstablished(k, p1, X));

    expect(await k.app(a1.id)).toEqual(a1);
  });

  it("a suspended place is no premise: its revision stays under review when an event about the place is consumed", async () => {
    const { k, p1, a1 } = await individualsAbout();
    await k.suspendPlace(p1);
    const before = await k.app(a1.id);

    await consume(
      k,
      k.delivered(AuthorityEvents.stewardshipVacated(placeRef(p1), k.tick())),
    );

    expect(await k.app(a1.id)).toEqual(before);
  });

  it("reassessApplicationPremises#21 a1〜a5 は、authority.steward_appointed の消費ですでに失効している / 同じドメインイベントをもう一度消費する", async () => {
    const { k, S, p1, a1, a2, a3, a4, a5 } = await individualsAbout();
    await k.appoint(placeRef(p1), S);
    const event = appointed(k, p1, S.accountId);
    await consume(k, event);
    const after = await appsOf(k, [a1, a2, a3, a4, a5]);
    expect(after.every((app) => app.status.kind === "lapsed")).toBe(true);
    const mark = await k.mark();

    await consume(k, event);

    expect(await appsOf(k, [a1, a2, a3, a4, a5])).toEqual(after);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("reassessApplicationPremises#22 p1 に店舗管理者が就いた後、authority.steward_appointed が届く前に、その店舗管理者が辞任して p1 は管理者不在に戻っている / 遅れて届いた authority.steward_appointed を消費する", async () => {
    const { k, S, p1, a1, a2, a3 } = await individualsAbout();
    await k.appoint(placeRef(p1), S);
    await k.removeSteward(placeRef(p1), S);
    const before = await Promise.all([a1, a2, a3].map((a) => k.app(a.id)));

    await consume(k, appointed(k, p1, S.accountId));

    expect(await Promise.all([a1, a2, a3].map((a) => k.app(a.id)))).toEqual(
      before,
    );
  });

  it("reassessApplicationPremises#23 a1 と a2 が確認中。a1 の save が、同時の承認者の判断と競合した / p1 の authority.steward_appointed を消費する", async () => {
    const k = await stewardSeatKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const S = await k.person("S");
    const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 0);
    const a1 = await k.revise(A, p1);
    const a2 = await k.newListing(B, p1);
    await k.appoint(placeRef(p1), S);
    // Run 1 reads the active applications; run 2 lapses a1 (the lower id).
    const racing = commitAfterRun(k.container, 2, () => k.rejectAs(k.O, a1.id));

    const error = await rejection(
      consume(k, appointed(k, p1, S.accountId), racing),
    );

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors[0]).toBeInstanceOf(ConflictError);
    expect((await k.app(a1.id)).status.kind).toBe("rejected");
    expect((await k.app(a2.id)).status).toEqual({
      kind: "lapsed",
      brokenPremises: ["placeHasNoSteward"],
    });
  });
});
