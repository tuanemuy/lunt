import { AccountEvents } from "@repo/core/domain/account/events";
import { ApplicationEvents } from "@repo/core/domain/application/events";
import { AuthorityEvents } from "@repo/core/domain/authority/events";
import type { AccountId, PlaceId } from "@repo/core/domain/common/ids";
import { ListingEvents } from "@repo/core/domain/listing/events";
import { describe, expect, it } from "vitest";
import { rejection } from "../../authority/__tests__/kit";
import { ConflictError } from "../../errors";
import { reassessApplicationPremises } from "../reassessApplicationPremises";
import { withdrawApplicationsOfWithdrawnAccount } from "../withdrawApplicationsOfWithdrawnAccount";
import { commitAfterRun } from "./kit";
import { type ReviewKit, reviewKit } from "./reviewKit";

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

const consume = (
  k: ReviewKit,
  event: Parameters<typeof reassessApplicationPremises.handle>[1],
  container = k.container,
) => reassessApplicationPremises.handle(container, event);

/**
 * The stage-2 applications individuals made about a place without a
 * steward: A's revision (under review), B's listing application
 * (returned) with a photo, A's listing revision (under review).
 */
async function individualsAbout() {
  const k = await reviewKit();
  const A = await k.person("A");
  const B = await k.person("B");
  const S = await k.person("S");
  const { placeId: p1 } = await k.placeWithPhotos("山田珈琲店", 1);
  const l1 = await k.listing(p1);
  const a1 = await k.revise(A, p1);
  const photo = await k.photo(B);
  const a2 = await k.newListing(B, p1, { photos: [photo] });
  await k.sendBackAs(k.O, a2.id);
  const a3 = await k.reviseListing(A, l1);
  return { k, A, B, S, p1, l1, a1, a2, a3, photo };
}

describe("reassessApplicationPremises", () => {
  it.todo(
    "reassessApplicationPremises#1 管理者のいなかった店舗 p1 に、利用者 S が店舗管理者として就いた。個人が p1 に行った、A の情報修正の申請 a1（確認中）、B の掲載の申請 a2（差し戻し）、A の掲載の修正の申請 a3（確認中）、B の所属の申請 a4（確認中）、A の離脱の申請 a5（確認中）がある / p1 の authority.steward_appointed を消費する",
  );

  it("an appointment to a place without a steward lapses the individuals' stage-2 applications about it on placeHasNoSteward, keeping their photos", async () => {
    const { k, A, B, S, p1, a1, a2, a3, photo } = await individualsAbout();
    await k.appoint(placeRef(p1), S);
    const mark = await k.mark();

    await consume(k, appointed(k, p1, S.accountId));

    for (const app of [a1, a2, a3]) {
      expect((await k.app(app.id)).status).toEqual({
        kind: "lapsed",
        brokenPremises: ["placeHasNoSteward"],
      });
    }
    const lapsed = await k.eventsSince(mark);
    expect(lapsed.map((e) => e.type)).toEqual([
      "application.lapsed",
      "application.lapsed",
      "application.lapsed",
    ]);
    expect(lapsed.map((e) => e.payload)).toEqual([
      {
        applicationId: a1.id,
        applicant: { kind: "individual", accountId: A.accountId },
      },
      {
        applicationId: a2.id,
        applicant: { kind: "individual", accountId: B.accountId },
      },
      {
        applicationId: a3.id,
        applicant: { kind: "individual", accountId: A.accountId },
      },
    ]);
    expect(await k.photoOwner(photo)).toEqual(k.applicationOwner(a2.id));
  });

  it.todo(
    "reassessApplicationPremises#2 同上。別の利用者 C の p1 への管理権限の申請 a6 が確認中 / p1 の authority.steward_appointed を消費する",
  );

  it("another person's stewardship claim on the place stays under review when the place gains a steward", async () => {
    const { k, S, p1, a1 } = await individualsAbout();
    const C = await k.person("C");
    const a6 = await k.claim(C, { placeId: p1 });
    await k.appoint(placeRef(p1), S);
    const before = await k.app(a6.id);

    await consume(k, appointed(k, p1, S.accountId));

    expect(await k.app(a6.id)).toEqual(before);
    expect((await k.app(a1.id)).status.kind).toBe("lapsed");
  });

  it("reassessApplicationPremises#3 利用者 A の p1 への管理権限の申請 a7 が確認中。A が招待の承諾で p1 の店舗管理者になった / p1 の authority.steward_appointed を消費する", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const { placeId: p1, claim: a7 } = await k.claimOnPlace(A);
    await k.appoint(placeRef(p1), A);

    await consume(k, appointed(k, p1, A.accountId));

    expect((await k.app(a7.id)).status).toEqual({
      kind: "lapsed",
      brokenPremises: ["applicantNotSteward"],
    });
  });

  it.todo(
    "reassessApplicationPremises#4 店舗 p1 が店舗管理者として行った、所属の申請 b1（確認中）と参加の申請 b2（差し戻し）がある。p1 の最後の店舗管理者が辞任した / p1 の authority.stewardship_vacated を消費する",
  );

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

  it.todo(
    "reassessApplicationPremises#5 店舗 p1 について店舗管理者として行った申請 b1 が確認中。b1 を提出した店舗管理者 T が辞任し、店舗管理者 S が残っている（authority.stewardship_vacated は出ない）。その後、p1 の別の地域への所属が成立した / p1 の region.affiliation_established を消費する",
  );

  it("reassessApplicationPremises#6 登録申請 r1 と、併せた管理権限の申請 s1 が確認中だった。r1 が否認された / r1 の application.rejected を消費する", async () => {
    const k = await reviewKit();
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
    const k = await reviewKit();
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
    const k = await reviewKit();
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

  it.todo(
    "reassessApplicationPremises#11 店舗 p2 の地域 X への所属の申請が、A のもの（b3）と B のもの（b4）、どちらも確認中だった。b3 が承認されて所属が成立した / region.affiliation_established を消費する",
  );

  it.todo(
    "reassessApplicationPremises#12 店舗 p1 の X からの離脱の申請 b5 が確認中。X の運営者が p1 を除外した / region.affiliation_dissolved を消費する",
  );

  it.todo(
    "reassessApplicationPremises#13 イベント e1 への参加の申請 c1（確認中）と c2（差し戻し）がある。e1 が中止になった / e1 の occasion.cancelled を消費する",
  );

  it.todo(
    "reassessApplicationPremises#14 e1 への参加の申請 c1 が確認中。日次のジョブが e1 の終了を確かめた / e1 の occasion.ended を消費する",
  );

  it.todo(
    "reassessApplicationPremises#15 e1 への参加の申請 c1（確認中）と c2（差し戻し）がある。e1 の開催期間が過去の日付へ更新され、開催の状態が終了になった / e1 の occasion.period_changed を消費する",
  );

  it.todo(
    "reassessApplicationPremises#16 e1 への参加の申請 c1 が確認中。e1 の開催期間が別の未来の日付へ更新され、開催の状態は開催前のまま / e1 の occasion.period_changed を消費する",
  );

  it.todo(
    "reassessApplicationPremises#17 e1 への参加の申請 c1 が確認中。e1 は公開を取り下げていて、開催期間を消す更新で開催の状態がなくなった / e1 の occasion.period_changed を消費する",
  );

  it.todo(
    "reassessApplicationPremises#18 e1 への、店舗 p1 の参加の申請 c1 が確認中。p1 の最後の店舗管理者が辞任して p1 が管理者不在になり、e1 の運営者が p1 を直接追加し、その後に利用者 T が p1 の店舗管理者に就いた。辞任と就任による再評価は、まだ届いていない / p1 の occasion.participation_established を消費する",
  );

  it.todo(
    "reassessApplicationPremises#19 c1 は e1 の中止で失効した。その後、中止が取り消された / 再配送された e1 の occasion.cancelled を消費する",
  );

  it.todo(
    "reassessApplicationPremises#20 情報修正の申請 a1 の対象の店舗 p1（店舗管理者がいない）が、サービス運営者によって非公開になった。その後、p1 の地域への所属が成立した / p1 の region.affiliation_established を消費する",
  );

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

  it.todo(
    "reassessApplicationPremises#21 a1〜a5 は、authority.steward_appointed の消費ですでに失効している / 同じドメインイベントをもう一度消費する",
  );

  it("consuming the same appointment again changes nothing and stores no event", async () => {
    const { k, S, p1, a1, a2, a3 } = await individualsAbout();
    await k.appoint(placeRef(p1), S);
    const event = appointed(k, p1, S.accountId);
    await consume(k, event);
    const after = await Promise.all([a1, a2, a3].map((a) => k.app(a.id)));
    const mark = await k.mark();

    await consume(k, event);

    expect(await Promise.all([a1, a2, a3].map((a) => k.app(a.id)))).toEqual(
      after,
    );
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
    const k = await reviewKit();
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
