import type { LocalDate } from "@repo/core/domain/common/localDate";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { oct, participationKit, sep } from "./participationKit";

const CHANGED = "occasion.participation_changed";

/**
 * 共通の前提: O is 10/1〜10/3; P has no steward and takes part in O
 * (added directly with L1 and 10/1 unless `dates` says otherwise); L1・L2
 * published and available, L3 a draft.
 */
async function setup(options: Readonly<{ dates?: readonly LocalDate[] }> = {}) {
  const k = await participationKit();
  const o = await k.occasion();
  const organizer = await k.organizer(o);
  const op = await k.operator();
  const p = await k.place();
  const l1 = (await k.published(op, p)).id;
  const l2 = (await k.published(op, p)).id;
  const l3 = (await k.draft(op, p)).id;
  const pair = { occasionId: o, placeId: p };
  await k.add(organizer, pair, {
    listingIds: [l1],
    dates: options.dates ?? [oct(1)],
  });
  return { k, o, organizer, op, p, l1, l2, l3, pair };
}

describe("changeParticipationByOccasion", () => {
  it("changeParticipationByOccasion#1 操作する人はイベント O の運営者。店舗 P の参加は addParticipationDirectly で成立した。参加内容は、添えた掲載 L1、参加日 10/1 / 添える掲載を L1、L2 に、参加日を 10/2 にして保存する", async () => {
    const { k, o, organizer, p, l1, l2, pair } = await setup();
    const before = (await k.storedParticipation(pair)).entity;
    await k.byOccasion(organizer, pair, {
      listingIds: [l1, l2],
      dates: [oct(2)],
    });
    const after = (await k.storedParticipation(pair)).entity;
    expect(after.details).toEqual({ listingIds: [l1, l2], dates: [oct(2)] });
    expect(after.version).toBe(Version.next(before.version));
    expect((await k.events(CHANGED)).map((e) => e.payload)).toEqual([
      { occasionId: o, placeId: p, changedBy: "occasion" },
    ]);
  });

  it("changeParticipationByOccasion#2 操作する人はイベント O の運営者。店舗 P の参加は、店舗管理者の参加の申請の承認で成立し、その後に店舗管理者が不在になった / 参加内容を変更して保存する", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const organizer = await k.organizer(o);
    const p = await k.place();
    const m = await k.manager(p);
    const pair = { occasionId: o, placeId: p };
    await k.approved(o, p, { dates: [oct(1)] });
    await k.removeSteward(k.ref(p), m);
    await k.byOccasion(organizer, pair, { dates: [oct(3)] });
    expect((await k.storedParticipation(pair)).entity.details.dates).toEqual([
      oct(3),
    ]);
  });

  it("changeParticipationByOccasion#3 操作する人はイベント O の運営者。イベント O は中止中 / 参加内容を変更して保存する", async () => {
    const { k, o, organizer, pair } = await setup();
    await k.changeOccasion(
      o,
      (occasion, now) => Occasion.cancel(occasion, now).entity,
    );
    await k.byOccasion(organizer, pair, { dates: [oct(2)] });
    expect((await k.storedParticipation(pair)).entity.details.dates).toEqual([
      oct(2),
    ]);
  });

  it("changeParticipationByOccasion#4 イベント O にイベント運営者がいない。操作する人はサービス運営者 / 参加内容を変更して保存する", async () => {
    const k = await participationKit();
    const o = await k.occasion();
    const op = await k.operator();
    const p = await k.place();
    const pair = { occasionId: o, placeId: p };
    await k.add(op, pair, { dates: [oct(1)] });
    await k.byOccasion(op, pair, { dates: [oct(2)] });
    expect((await k.storedParticipation(pair)).entity.details.dates).toEqual([
      oct(2),
    ]);
  });

  it("changeParticipationByOccasion#5 操作する人はイベント O の運営者。保存するまでの間に、店舗 P に店舗管理者が就いた / 参加内容を変更して保存する", async () => {
    const { k, organizer, p, pair } = await setup();
    const started = (await k.storedParticipation(pair)).entity;
    await k.manager(p);
    await expectCode(
      k.byOccasion(
        organizer,
        pair,
        { dates: [oct(2)] },
        { version: started.version },
      ),
      BusinessRuleError,
      "OCCASION_PLACE_HAS_STEWARD",
    );
    expect((await k.storedParticipation(pair)).entity).toEqual(started);
  });

  it("changeParticipationByOccasion#6 操作する人はイベント O の運営者。編集を始めた後に、店舗 P に店舗管理者が就き、その店舗管理者が参加内容を保存して版が進んでいる / 編集を始めたときの版を添えて保存する", async () => {
    const { k, o, organizer, p, l1, l3, pair } = await setup();
    const started = (await k.storedParticipation(pair)).entity.version;
    const m = await k.manager(p);
    await k.byPlace(m, pair, { listingIds: [l1], dates: [oct(3)] });
    await k.postpone(o, oct(5), oct(7));
    const saved = (await k.storedParticipation(pair)).entity;
    await expectCode(
      k.byOccasion(
        organizer,
        pair,
        { listingIds: [l3], dates: [oct(2)] },
        { version: started },
      ),
      BusinessRuleError,
      "OCCASION_PLACE_HAS_STEWARD",
    );
    expect((await k.storedParticipation(pair)).entity).toEqual(saved);
  });

  it("changeParticipationByOccasion#7 操作する人はイベント O の運営者で、店舗管理者のいる店舗 Q が参加中 / 店舗 Q の参加内容を変更して保存する", async () => {
    const { k, o, organizer } = await setup();
    const q = await k.place();
    await k.manager(q);
    await k.approved(o, q, { dates: [oct(1)] });
    await expectCode(
      k.byOccasion(organizer, { occasionId: o, placeId: q }, { dates: [] }),
      BusinessRuleError,
      "OCCASION_PLACE_HAS_STEWARD",
    );
  });

  it("changeParticipationByOccasion#8 操作する人はイベント O の運営者 / 下書きの掲載 L3 を添えて保存する", async () => {
    const { k, organizer, l1, l3, pair } = await setup();
    await expectCode(
      k.byOccasion(organizer, pair, { listingIds: [l1, l3] }),
      BusinessRuleError,
      "OCCASION_LISTING_NOT_ATTACHABLE",
    );
  });

  it("changeParticipationByOccasion#9 操作する人はイベント O の運営者 / 参加日を 9/30 にして保存する", async () => {
    const { k, organizer, pair } = await setup();
    await expectCode(
      k.byOccasion(organizer, pair, { dates: [sep(30)] }),
      BusinessRuleError,
      "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD",
    );
  });

  it("changeParticipationByOccasion#10 操作する人はイベント O の運営者 / 現在と同じ参加内容で保存する", async () => {
    const { k, organizer, l1, pair } = await setup();
    const before = (await k.storedParticipation(pair)).entity;
    await k.byOccasion(organizer, pair, { listingIds: [l1], dates: [oct(1)] });
    expect((await k.storedParticipation(pair)).entity).toEqual(before);
    expect(await k.events(CHANGED)).toEqual([]);
  });

  it("changeParticipationByOccasion#11 操作する人はイベント O の運営者。保存するまでの間に、別の運営者が店舗 P を除外した / 参加内容を変更して保存する", async () => {
    const { k, o, organizer, pair } = await setup();
    const other = await k.organizer(o, "other-organizer");
    const racing = commitAfter(k.container, () => k.exclude(other, pair));
    await expectCode(
      k.byOccasion(organizer, pair, { dates: [oct(2)] }, { over: racing }),
      NotFoundError,
    );
    expect(await k.findParticipation(pair)).toBeNull();
  });

  it("changeParticipationByOccasion#12 操作する人はイベント O の運営者。編集を始めた後に、別の運営者が参加内容を保存して版が進んでいる / 編集を始めたときの版を添えて保存する", async () => {
    const { k, o, organizer, pair } = await setup();
    const started = (await k.storedParticipation(pair)).entity.version;
    const other = await k.organizer(o, "other-organizer");
    await k.byOccasion(other, pair, { dates: [oct(3)] });
    await expectCode(
      k.byOccasion(organizer, pair, { dates: [oct(2)] }, { version: started }),
      ConflictError,
    );
    expect((await k.storedParticipation(pair)).entity.details.dates).toEqual([
      oct(3),
    ]);
  });

  it("changeParticipationByOccasion#13 イベント O にイベント運営者がいる。操作する人は、イベント O の管理権限を持たないサービス運営者 / 参加内容を変更して保存する", async () => {
    const { k, op, pair } = await setup();
    await expectCode(
      k.byOccasion(op, pair, { dates: [oct(2)] }),
      ForbiddenError,
    );
  });

  it("changeParticipationByOccasion#14 操作する人はイベント O の運営者。参加日は 10/3。その後にイベントの開催期間が 10/1〜10/2 に更新された / 参加日 10/3 を残したまま、添える掲載だけを変更して保存する", async () => {
    const { k, o, organizer, l2, pair } = await setup({ dates: [oct(3)] });
    await k.postpone(o, oct(1), oct(2));
    const before = (await k.storedParticipation(pair)).entity;
    await expectCode(
      k.byOccasion(organizer, pair, { listingIds: [l2], dates: [oct(3)] }),
      BusinessRuleError,
      "OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD",
    );
    expect((await k.storedParticipation(pair)).entity).toEqual(before);
  });
});
