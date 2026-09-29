import type {
  ApplicationId,
  ListingId,
  OccasionId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { expectLapsed } from "./kit";
import { oct, type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

/**
 * Occasion e1 (upcoming, 10/1〜10/3) with its organizer V; place p1 with
 * its steward S and two published listings l1, l2; S's participation
 * application c1 with l1, l2 and two days is under review.
 */
async function setting(k: StewardSeatKit) {
  const e1 = await k.addOccasion({ name: "秋祭り" });
  const V = await k.organizer(e1, "V");
  const p1 = await k.place("山田珈琲店");
  const S = await k.manager(p1, "S");
  const l1 = (await k.published(S, p1)).id;
  const l2 = (await k.published(S, p1)).id;
  const c1 = await k.participationApp(S, {
    placeId: p1,
    occasionId: e1,
    listingIds: [l1, l2],
    dates: [oct(1), oct(2)],
  });
  return { e1, V, p1, S, l1, l2, c1 };
}

async function expectApproved(
  k: StewardSeatKit,
  id: ApplicationId,
  reviewAs: "approver" | "overdue_proxy",
) {
  expect((await k.app(id)).status).toEqual({ kind: "approved", reviewAs });
}

const expectNoParticipation = async (
  k: StewardSeatKit,
  occasionId: OccasionId,
  placeId: PlaceId,
) => expect(await k.participation(occasionId, placeId)).toBeNull();

const detailsOf = async (
  k: StewardSeatKit,
  occasionId: OccasionId,
  placeId: PlaceId,
) => (await k.participation(occasionId, placeId))?.details;

describe("approveParticipation", () => {
  it("approveParticipation#1 利用者 V はイベント e1（開催前）の運営者。店舗 p1（店舗管理者がいる）について店舗管理者として行った、掲載 l1・l2 と参加日2日を添えた e1 への参加の申請 c1 が確認中 / V が、確かめたときの版を添えて c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, V, p1, l1, l2, c1 } = await setting(k);
    const place = await k.getPlace(p1);
    const listings = await Promise.all([l1, l2].map(k.findListing));
    const mark = await k.mark();

    const result = await k.approveParticipationAs(V, c1.id, {
      version: c1.version,
    });

    expect(result).toEqual({
      outcome: "approved",
      application: expect.objectContaining({
        id: c1.id,
        kind: "participation",
        status: { kind: "approved", reviewAs: "approver" },
      }),
      reflected: { kind: "occasion", id: e1 },
    });
    const participation = await k.participation(e1, p1);
    expect(participation?.details).toEqual({
      listingIds: [l1, l2],
      dates: [oct(1), oct(2)],
    });
    expect(participation?.participatedAt).toEqual(k.clock.now());
    const events = await k.eventsSince(mark);
    expect(events.map((e) => e.type).sort()).toEqual([
      "application.approved",
      "occasion.participation_established",
    ]);
    expect(events.map((e) => e.payload)).toEqual(
      expect.arrayContaining([
        { applicationId: c1.id, applicant: { kind: "place", placeId: p1 } },
        { occasionId: e1, placeId: p1 },
      ]),
    );
    expect(await k.getPlace(p1)).toEqual(place);
    expect(await Promise.all([l1, l2].map(k.findListing))).toEqual(listings);
  });

  it("approveParticipation#2 掲載も参加日も添えていない参加の申請 c2 が確認中 / V が c2 を承認する", async () => {
    const k = await stewardSeatKit();
    const e1 = await k.addOccasion();
    const V = await k.organizer(e1, "V");
    const p1 = await k.place();
    const S = await k.manager(p1, "S");
    const c2 = await k.participationApp(S, { placeId: p1, occasionId: e1 });

    expect((await k.approveParticipationAs(V, c2.id)).outcome).toBe("approved");
    expect(await detailsOf(k, e1, p1)).toEqual({ listingIds: [], dates: [] });
  });

  it("approveParticipation#3 c1 に添えた掲載 l2 が、確認中に一時非公開になった / V が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, V, p1, S, l1, l2, c1 } = await setting(k);
    await k.unpublish(S, l2);

    expect((await k.approveParticipationAs(V, c1.id)).outcome).toBe("approved");
    expect((await detailsOf(k, e1, p1))?.listingIds).toEqual([l1, l2]);
  });

  it("approveParticipation#4 c1 の参加日は、開催期間内の2日。確認中に e1 の開催期間が短くなり、そのうち1日が期間外になった / V が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, V, p1, c1 } = await setting(k);
    await k.setPeriod(e1, [oct(1), oct(1)]);

    expect((await k.approveParticipationAs(V, c1.id)).outcome).toBe("approved");
    expect((await detailsOf(k, e1, p1))?.dates).toEqual([oct(1), oct(2)]);
  });

  it("approveParticipation#5 V は e1 の運営者で、p1 の店舗管理者でもある。V が店舗管理者として行った c1 が確認中 / V が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const e1 = await k.addOccasion();
    const V = await k.organizer(e1, "V");
    const p1 = await k.place();
    await k.appoint(k.ref(p1), V);
    const c1 = await k.participationApp(V, { placeId: p1, occasionId: e1 });

    expect((await k.approveParticipationAs(V, c1.id)).outcome).toBe("approved");
    await expectApproved(k, c1.id, "approver");
  });

  it("approveParticipation#6 イベント e2 に運営者がいない。e2 への参加の申請 c3 が確認中。操作する人はサービス運営者 O / O が c3 を承認する", async () => {
    const k = await stewardSeatKit();
    const e2 = await k.addOccasion();
    const p1 = await k.place();
    const S = await k.manager(p1, "S");
    const c3 = await k.participationApp(S, { placeId: p1, occasionId: e2 });

    expect((await k.approveParticipationAs(k.O, c3.id)).outcome).toBe(
      "approved",
    );
    await expectApproved(k, c3.id, "approver");
    expect(await k.participation(e2, p1)).not.toBeNull();
  });

  it("approveParticipation#7 e1 に運営者がいる。c1 は10日前から確認中。O は e1 の運営者でない / O が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, p1, c1 } = await setting(k);
    k.passDays(10);

    expect((await k.approveParticipationAs(k.O, c1.id)).outcome).toBe(
      "approved",
    );
    await expectApproved(k, c1.id, "overdue_proxy");
    expect(await k.participation(e1, p1)).not.toBeNull();
  });

  it("approveParticipation#8 e1 に運営者がいる。c1 は3日前から確認中 / O が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, p1, c1 } = await setting(k);
    k.passDays(3);

    await expectCode(
      k.approveParticipationAs(k.O, c1.id),
      BusinessRuleError,
      "APPLICATION_AWAITING_STEWARDS",
    );
    await expectNoParticipation(k, e1, p1);
  });

  it("approveParticipation#9 イベント e2 に運営者がいない。e2 への参加の申請 c4 は10日前から確認中。サービス運営者 O が不在の代行で c4 を確かめた後、承認の前に利用者 W が e2 の運営者に就いた / O が c4 を1回承認する", async () => {
    const k = await stewardSeatKit();
    const e2 = await k.addOccasion();
    const p1 = await k.place();
    const S = await k.manager(p1, "S");
    const c4 = await k.participationApp(S, { placeId: p1, occasionId: e2 });
    k.passDays(10);
    const read = await k.versionOf(c4.id);
    await k.organizer(e2, "W");

    const result = await k.approveParticipationAs(k.O, c4.id, {
      version: read,
    });

    expect(result.outcome).toBe("approved");
    await expectApproved(k, c4.id, "overdue_proxy");
    expect(await k.participation(e2, p1)).not.toBeNull();
  });

  it("approveParticipation#10 e2 に運営者がいない。c4 は3日前から確認中。O が不在の代行で c4 を確かめた後、承認の前に W が e2 の運営者に就いた / O が c4 を承認する", async () => {
    const k = await stewardSeatKit();
    const e2 = await k.addOccasion();
    const p1 = await k.place();
    const S = await k.manager(p1, "S");
    const c4 = await k.participationApp(S, { placeId: p1, occasionId: e2 });
    k.passDays(3);
    const read = await k.versionOf(c4.id);
    await k.organizer(e2, "W");

    await expectCode(
      k.approveParticipationAs(k.O, c4.id, { version: read }),
      BusinessRuleError,
      "APPLICATION_AWAITING_STEWARDS",
    );
    expect((await k.app(c4.id)).status.kind).toBe("underReview");
    await expectNoParticipation(k, e2, p1);
  });

  it("approveParticipation#11 c1 の確認中に、e1 が中止になった。前提の再評価はまだ届いていない / V が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, V, p1, c1 } = await setting(k);
    await k.cancelOccasion(e1);

    await expectLapsed(k, () => k.approveParticipationAs(V, c1.id), [
      "occasionOpen",
    ]);
    await expectNoParticipation(k, e1, p1);
  });

  it("approveParticipation#12 c1 の確認中に、e1 の開催期間が更新されて終了になった。前提の再評価はまだ届いていない / V が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, V, p1, c1 } = await setting(k);
    // 「今日」 is 2026-07-10.
    await k.setPeriod(e1, [
      LocalDate.parse("2026-07-01"),
      LocalDate.parse("2026-07-05"),
    ]);

    await expectLapsed(k, () => k.approveParticipationAs(V, c1.id), [
      "occasionOpen",
    ]);
    await expectNoParticipation(k, e1, p1);
  });

  it("approveParticipation#13 c1 の確認中に、p1 の最後の店舗管理者が辞任して p1 は管理者不在になり、V が p1 を参加店舗として直接追加し、その後に利用者 T が p1 の店舗管理者に就いた。前提の再評価はまだ届いていない / V が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, V, p1, S, c1 } = await setting(k);
    await k.removeSteward(k.ref(p1), S);
    await k.participate(e1, p1);
    const direct = await k.participation(e1, p1);
    await k.manager(p1, "T");

    await expectLapsed(k, () => k.approveParticipationAs(V, c1.id), [
      "notParticipating",
    ]);
    expect(await k.participation(e1, p1)).toEqual(direct);
  });

  it("approveParticipation#14 c1 の確認中に、p1 の最後の店舗管理者が退会した。前提の再評価はまだ届いていない / V が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, V, p1, S, c1 } = await setting(k);
    await k.withdraw(S);

    await expectLapsed(k, () => k.approveParticipationAs(V, c1.id), [
      "placeHasSteward",
    ]);
    await expectNoParticipation(k, e1, p1);
  });

  it("approveParticipation#15 c1 の確認中に、e1 が運営による非公開になった / V が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, V, p1, c1 } = await setting(k);
    await k.suspendOccasion(e1);

    expect((await k.approveParticipationAs(V, c1.id)).outcome).toBe("approved");
    expect(await k.participation(e1, p1)).not.toBeNull();
  });

  it("approveParticipation#16 利用者 U は e1 の運営者でも、サービス運営者でもない / U が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, p1, c1 } = await setting(k);
    const U = await k.person("U");

    await expectCode(k.approveParticipationAs(U, c1.id), ForbiddenError);
    await expectNoParticipation(k, e1, p1);
  });

  it("approveParticipation#17 c1 は、期間超過の代行をするサービス運営者が先に承認した / V が c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, V, p1, c1 } = await setting(k);
    k.passDays(10);
    await k.approveParticipationAs(k.O, c1.id);
    const participation = await k.participation(e1, p1);

    await expectCode(
      k.approveParticipationAs(V, c1.id),
      BusinessRuleError,
      "APPLICATION_ALREADY_APPROVED",
    );
    expect(await k.participation(e1, p1)).toEqual(participation);
  });

  it("approveParticipation#18 c1 は、V が確かめた後に、別の運営者が差し戻し、店舗管理者が掲載と参加日を直して再提出して確認中に戻った / V が、古い版を添えて c1 を承認する", async () => {
    const k = await stewardSeatKit();
    const { e1, V, p1, S, l1, c1 } = await setting(k);
    const read = await k.versionOf(c1.id);
    const V2 = await k.organizer(e1, "V2");
    await k.sendBackAs(V2, c1.id, "参加日を見直してください", {
      container: k.week,
    });
    const amended: readonly ListingId[] = [l1];
    await k.resubmitAs(S, c1.id, {
      kind: "participation",
      listingIds: amended,
      dates: [oct(3)],
    });

    await expectCode(
      k.approveParticipationAs(V, c1.id, { version: read }),
      ConflictError,
    );
    expect((await k.app(c1.id)).status.kind).toBe("underReview");
    await expectNoParticipation(k, e1, p1);
  });

  it("a direct addition committed before the approval's commit refuses the approval", async () => {
    const k = await stewardSeatKit();
    const { e1, V, p1, c1 } = await setting(k);
    const racing = commitAfter(k.container, () => k.participate(e1, p1));

    await expectCode(
      k.approveParticipationAs(V, c1.id, {
        container: { ...racing, reviewPolicy: k.week.reviewPolicy },
      }),
      ConflictError,
    );
    expect((await k.app(c1.id)).status.kind).toBe("underReview");
  });
});
