import type { ListingId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Participation } from "@repo/core/domain/occasion/participation";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  type Person,
  rejection,
} from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { deleteListing } from "../deleteListing";
import { suspendListing } from "../suspendListing";
import { unpublishListing } from "../unpublishListing";
import { updateListing } from "../updateListing";
import {
  type ContentSpec,
  dates,
  type ListingKit,
  listingKit,
  period,
} from "./kit";

function saver(k: ListingKit) {
  return async (
    who: Person,
    listingId: ListingId,
    spec: ContentSpec,
    options: Readonly<{ version?: number; container?: RequestContainer }> = {},
  ) =>
    updateListing({
      container: options.container ?? k.container,
      actor: who.actor,
      input: {
        listingId,
        version: options.version ?? (await k.stored(listingId)).entity.version,
        content: k.content(spec),
      },
    });
}

/** The listing's current content as a `ContentSpec`, for "change only X" saves. */
async function specOf(k: ListingKit, id: ListingId): Promise<ContentSpec> {
  const { content } = (await k.stored(id)).entity;
  const offering = content.offering;
  return {
    name: content.name,
    description: content.description,
    categoryId: content.categoryId,
    photos: content.photos.items,
    offering:
      offering.kind === "none"
        ? { kind: "none" }
        : offering.kind === "period"
          ? period(offering.period.start, offering.period.end)
          : dates(...offering.dates),
  };
}

const released = async (k: ListingKit) =>
  (await k.events("photos.released")).map((e) => e.payload);

describe("updateListing", () => {
  it("updateListing#1 店舗 A の下書きの掲載がある。操作する人は店舗 A の店舗管理者 / 名称・説明・カテゴリーを変えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const draft = await k.draft(m, a, { photos: [] });
    const before = (await k.stored(draft.id)).entity;
    k.tick();
    const buy = await k.category("買う");
    const view = await saver(k)(m, draft.id, {
      name: "新しい名称",
      description: "新しい説明",
      categoryId: buy,
      photos: [],
    });
    const after = (await k.stored(draft.id)).entity;
    expect(after.content.name).toBe("新しい名称");
    expect(after.content.description).toBe("新しい説明");
    expect(after.content.categoryId).toBe(buy);
    expect(after.version).toBe(before.version + 1);
    expect(after.updatedAt).toEqual(k.clock.now());
    expect(after.publication.status).toBe("draft");
    expect(view.category).toEqual({ id: buy, name: "買う" });
    expect(await k.events()).toEqual([]);
  });

  it("updateListing#2 店舗 A の公開中の掲載がある。操作する人は店舗 A の店舗管理者 / 名称と説明を変えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const view = await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      name: "変えた名称",
      description: "変えた説明",
    });
    expect(view.publication.status).toBe("published");
    expect(view.name).toBe("変えた名称");
    const stored = (await k.stored(listing.id)).entity;
    expect(stored.publication.status).toBe("published");
    expect(stored.content.description).toBe("変えた説明");
  });

  it("updateListing#3 店舗 A の下書きの掲載に写真が1枚ある。操作する人が登録した、持ち主のない写真が2枚ある / 写真を3枚にし、加えた写真の1枚を先頭に並び替えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const first = await k.photo(m);
    const draft = await k.draft(m, a, { photos: [first] });
    const [x, y] = await k.photos(m, 2);
    if (x === undefined || y === undefined) throw new Error("photos");
    await saver(k)(m, draft.id, {
      ...(await specOf(k, draft.id)),
      photos: [y, first, x],
    });
    const stored = (await k.stored(draft.id)).entity;
    expect(PhotoSet.photoIds(stored.content.photos)).toEqual([y, first, x]);
    for (const p of [x, y]) {
      expect(await k.photoOwner(p)).toEqual({ kind: "listing", id: draft.id });
    }
  });

  it("updateListing#4 店舗 A の下書きの掲載に写真が2枚ある / 1枚目に見せる範囲を設定し、2枚目は調整せずに保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [p1, p2] = await k.photos(m, 2);
    if (p1 === undefined || p2 === undefined) throw new Error("photos");
    const draft = await k.draft(m, a, { photos: [p1, p2] });
    const framing = { x: 0.2, y: 0, width: 0.6, height: 1 };
    await saver(k)(m, draft.id, {
      ...(await specOf(k, draft.id)),
      photos: [{ photoId: p1, framing }, p2],
    });
    expect((await k.stored(draft.id)).entity.content.photos.items).toEqual([
      { photoId: p1, framing },
      { photoId: p2, framing: null },
    ]);
  });

  it("updateListing#5 店舗 A の公開中の掲載に写真が2枚ある / 2枚目を外して保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [p1, p2] = await k.photos(m, 2);
    if (p1 === undefined || p2 === undefined) throw new Error("photos");
    const listing = await k.published(m, a, { photos: [p1, p2] });
    await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      photos: [p1],
    });
    expect(
      PhotoSet.photoIds((await k.stored(listing.id)).entity.content.photos),
    ).toEqual([p1]);
    expect(await released(k)).toEqual([{ photoIds: [p2] }]);
  });

  it("updateListing#6 店舗 A の公開中の掲載がある / 写真をすべて外して保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const before = await k.stored(listing.id);
    const error = await rejection(
      saver(k)(m, listing.id, { ...(await specOf(k, listing.id)), photos: [] }),
    );
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error).toMatchObject({
      code: "LISTING_PUBLISH_CONDITION_UNMET",
      missing: ["photos"],
    });
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
    expect(await released(k)).toEqual([]);
  });

  it("updateListing#7 店舗 A の公開中の掲載がある / 名称を空にして保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const before = await k.stored(listing.id);
    const error = await rejection(
      saver(k)(m, listing.id, { ...(await specOf(k, listing.id)), name: "" }),
    );
    expect(error).toMatchObject({
      code: "LISTING_PUBLISH_CONDITION_UNMET",
      missing: ["name"],
    });
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("updateListing#8 店舗 A の一時非公開の掲載がある / 写真をすべて外して保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const photo = await k.photo(m);
    const listing = await k.published(m, a, { photos: [photo] });
    await unpublishListing({
      container: k.container,
      actor: m.actor,
      input: { listingId: listing.id },
    });
    await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      photos: [],
    });
    const stored = (await k.stored(listing.id)).entity;
    expect(stored.content.photos.items).toEqual([]);
    expect(stored.publication.status).toBe("unpublished");
    expect(await released(k)).toEqual([{ photoIds: [photo] }]);
  });

  it("updateListing#9 店舗 A の公開中の掲載がある。提供の設定は「設定しない」 / 提供期間を開始日 2026-07-20、終了日 2026-08-31 にして保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const view = await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      offering: period("2026-07-20", "2026-08-31"),
    });
    expect(view.offeringStatus).toEqual({
      phase: "upcoming",
      startsOn: "2026-07-20",
    });
  });

  it("updateListing#10 店舗 A の公開中の掲載がある / 提供期間を終了日 2026-07-01 だけにして保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const view = await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      offering: period(null, "2026-07-01"),
    });
    expect(view.offeringStatus).toEqual({ phase: "ended", cause: "schedule" });
  });

  it("updateListing#11 店舗 A の公開中の掲載が、終了日 2026-06-30 を過ぎて提供終了になっている / 終了日を 2026-08-31 に更新して保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: period(null, "2026-06-30"),
    });
    expect(listing.offeringStatus.phase).toBe("ended");
    const view = await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      offering: period(null, "2026-08-31"),
    });
    expect(view.offeringStatus).toEqual({ phase: "available" });
  });

  it("updateListing#12 店舗 A の公開中の掲載が、終了日 2026-06-30 を過ぎて提供終了になっている / 提供の設定を「設定しない」に切り替えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: period(null, "2026-06-30"),
    });
    const view = await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      offering: { kind: "none" },
    });
    expect(view.offering).toEqual({ kind: "none" });
    expect(view.offeringStatus).toEqual({ phase: "available" });
  });

  it("updateListing#13 店舗 A の掲載に提供期間が設定されている / 提供の設定を「開催日」に切り替え、開催日を指定して保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.draft(m, a, {
      offering: period("2026-07-01", "2026-08-31"),
    });
    await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      offering: dates("2026-07-25"),
    });
    expect((await k.stored(listing.id)).entity.content.offering).toEqual({
      kind: "dates",
      dates: ["2026-07-25"],
    });
  });

  it("updateListing#14 店舗 A の公開中の掲載がある / 開催日を 2026-08-03、2026-07-20、2026-07-27 の3つにして保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const view = await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      offering: dates("2026-08-03", "2026-07-20", "2026-07-27"),
    });
    expect(view.offering).toEqual({
      kind: "dates",
      dates: ["2026-07-20", "2026-07-27", "2026-08-03"],
    });
    expect(view.offeringStatus).toEqual({ phase: "available" });
  });

  it("updateListing#15 店舗 A の公開中の掲載の開催日が 2026-06-20 と 2026-06-27 で、提供終了になっている / 開催日に 2026-07-25 を追加して保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: dates("2026-06-20", "2026-06-27"),
    });
    expect(listing.offeringStatus).toEqual({
      phase: "ended",
      cause: "schedule",
    });
    const view = await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      offering: dates("2026-06-20", "2026-06-27", "2026-07-25"),
    });
    expect(view.offeringStatus).toEqual({ phase: "available" });
  });

  it("updateListing#16 店舗 A の公開中の掲載が、運営による非公開になっている / 名称を変えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    await suspendListing({
      container: k.container,
      actor: op.actor,
      input: { listingId: listing.id },
    });
    const view = await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      name: "変えた名称",
    });
    expect(view.name).toBe("変えた名称");
    expect(view.suspended).toBe(true);
    expect(view.publication.status).toBe("published");
  });

  it("updateListing#17 店舗 A の掲載が、申立てによる写真の削除で写真がなくなり、一時非公開（photoTakedown）になっている / 写真を1枚登録して保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const photo = await k.photo(m);
    const listing = await k.published(m, a, { photos: [photo] });
    await k.takeDown(listing.id, [photo]);
    const fresh = await k.photo(m);
    const view = await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      photos: [fresh],
    });
    expect(await k.photoOwner(fresh)).toEqual({
      kind: "listing",
      id: listing.id,
    });
    expect(view.publication).toMatchObject({
      status: "unpublished",
      reason: "photoTakedown",
    });
  });

  it("updateListing#18 店舗 B の掲載は、管理者のいなかった時期にサービス運営者が代理作成して公開した。その後、操作する人が店舗 B の店舗管理者に就いた / 店舗管理者がその掲載の内容を変えて保存する", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const listing = await k.published(op, b);
    const m = await k.manager(b);
    const view = await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      name: "店舗管理者が変えた",
    });
    expect(view.name).toBe("店舗管理者が変えた");
    expect(view.publication.status).toBe("published");
  });

  it("updateListing#19 店舗 B に店舗管理者がいない。操作する人はサービス運営者 / 店舗 B の公開中の掲載の内容を変えて保存する", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const listing = await k.published(op, b);
    const view = await saver(k)(op, listing.id, {
      ...(await specOf(k, listing.id)),
      name: "代行で変えた",
    });
    expect(view.name).toBe("代行で変えた");
    expect((await k.stored(listing.id)).entity.content.name).toBe(
      "代行で変えた",
    );
  });

  it("updateListing#20 サービス運営者が、管理者のいない店舗 B の掲載を編集している間に、店舗 B に店舗管理者が就いた / サービス運営者が店舗 B の掲載の内容を変えて保存する", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const listing = await k.published(op, b);
    const version = (await k.stored(listing.id)).entity.version;
    await k.appoint(k.ref(b), await k.person());
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(
        op,
        listing.id,
        { ...(await specOf(k, listing.id)), name: "代行" },
        { version },
      ),
      ForbiddenError,
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("updateListing#21 店舗 A に店舗管理者が1人残っている。操作する人は店舗 A の管理権限を持たないサービス運営者 / 店舗 A の掲載の内容を変えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const listing = await k.published(m, a);
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(op, listing.id, { ...(await specOf(k, listing.id)), name: "x" }),
      ForbiddenError,
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("updateListing#22 操作する人は、編集の途中で店舗 A の管理権限を失った / 店舗 A の掲載を保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const before = await k.stored(listing.id);
    const resigning = commitAfter(k.container, () =>
      k.removeSteward(k.ref(a), m),
    );
    await expectCode(
      saver(k)(
        m,
        listing.id,
        { ...(await specOf(k, listing.id)), name: "x" },
        { container: resigning },
      ),
      ForbiddenError,
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("updateListing#23 店舗 A は地域 X に所属している。操作する人は X の地域運営者で、店舗の管理権限を持たない / 店舗 A の掲載の内容を変えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const X = k.region("地域 X");
    await k.run(({ placeAffiliationsRepository }) =>
      placeAffiliationsRepository.insert(
        PlaceAffiliations.affiliate(
          PlaceAffiliations.empty(a, k.tick()),
          X.id,
          k.tick(),
        ).entity,
      ),
    );
    const R = await k.person("region");
    await k.appoint(X, R);
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(R, listing.id, { ...(await specOf(k, listing.id)), name: "x" }),
      ForbiddenError,
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("updateListing#24 店舗 A はイベント O に参加している。操作する人は O のイベント運営者で、店舗の管理権限を持たない / 店舗 A の掲載の内容を変えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const E = k.occasion("イベント O");
    await k.run(({ participationRepository }) =>
      participationRepository.insert(
        Participation.establish(
          {
            key: { occasionId: E.id, placeId: a },
            details: { listingIds: [], dates: [] },
          },
          k.tick(),
        ).entity,
      ),
    );
    const V = await k.person("occasion");
    await k.appoint(E, V);
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(V, listing.id, { ...(await specOf(k, listing.id)), name: "x" }),
      ForbiddenError,
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("a steward of another target (a region or an occasion) cannot save a place's listing", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const regionSteward = await k.person();
    await k.appoint(k.region(), regionSteward);
    const occasionSteward = await k.person();
    await k.appoint(k.occasion(), occasionSteward);
    const before = await k.stored(listing.id);
    for (const who of [regionSteward, occasionSteward]) {
      await expectCode(
        saver(k)(who, listing.id, {
          ...(await specOf(k, listing.id)),
          name: "x",
        }),
        ForbiddenError,
      );
    }
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("updateListing#25 編集している間に、別の店舗管理者が掲載を削除した / 保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const listing = await k.published(m, a);
    const spec = await specOf(k, listing.id);
    const version = listing.version;
    await deleteListing({
      container: k.container,
      actor: other.actor,
      input: { listingId: listing.id },
    });
    await expectCode(
      saver(k)(m, listing.id, { ...spec, name: "x" }, { version }),
      NotFoundError,
    );
  });

  it("updateListing#26 編集を始めた後に、別の店舗管理者が同じ掲載を保存した / 編集を始めたときの版を添えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const listing = await k.published(m, a);
    const spec = await specOf(k, listing.id);
    const version = listing.version;
    await saver(k)(other, listing.id, { ...spec, name: "先に保存" });
    await expectCode(
      saver(k)(m, listing.id, { ...spec, name: "後から" }, { version }),
      ConflictError,
    );
    expect((await k.stored(listing.id)).entity.content.name).toBe("先に保存");
  });

  it("updateListing#27 選んだカテゴリーが、保存までに廃止された / そのカテゴリーで保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.draft(m, a);
    const experience = await k.category("体験");
    await k.retireCategory(experience, await k.category("見る"));
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(m, listing.id, {
        ...(await specOf(k, listing.id)),
        categoryId: experience,
      }),
      BusinessRuleError,
      "LISTING_CATEGORY_NOT_AVAILABLE",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("updateListing#28 店舗 A の掲載がある / 提供期間の終了日を開始日より前にして保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.draft(m, a);
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(m, listing.id, {
        ...(await specOf(k, listing.id)),
        offering: period("2026-08-31", "2026-08-01"),
      }),
      BusinessRuleError,
      "LISTING_INVALID_OFFERING_PERIOD",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("updateListing#29 店舗 A の掲載がある / 保存されている内容と同じ内容で保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a, {
      offering: period("2026-07-01", null),
    });
    const before = await k.stored(listing.id);
    k.tick();
    await saver(k)(m, listing.id, await specOf(k, listing.id));
    const after = await k.stored(listing.id);
    expect(after.expectedVersion).toBe(before.expectedVersion);
    expect(after.entity.updatedAt).toEqual(before.entity.updatedAt);
    expect(await k.events()).toEqual([]);
  });

  it("updateListing#30 店舗 A の掲載がある。加える写真の1枚が、すでに別の掲載を持ち主に持つ / その写真を加えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.draft(m, a);
    const [taken, free] = await k.photos(m, 2);
    if (taken === undefined || free === undefined) throw new Error("photos");
    await k.draft(m, a, { photos: [taken] });
    const spec = await specOf(k, listing.id);
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(m, listing.id, {
        ...spec,
        photos: [...(spec.photos ?? []), free, taken],
      }),
      BusinessRuleError,
      "MEDIA_PHOTO_ALREADY_OWNED",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
    expect(await k.photoOwner(free)).toBeNull();
  });

  it("updateListing#31 店舗 A の掲載がある / 名称に改行を含めて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.draft(m, a);
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(m, listing.id, {
        ...(await specOf(k, listing.id)),
        name: "a\r\nb",
      }),
      BusinessRuleError,
      "LISTING_INVALID_NAME",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("updateListing#32 写真 P を持つ店舗 A の掲載がある / 写真を P・P の順にして保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const p = await k.photo(m);
    const listing = await k.draft(m, a, { photos: [p] });
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(m, listing.id, {
        ...(await specOf(k, listing.id)),
        photos: [p, p],
      }),
      BusinessRuleError,
      "LISTING_DUPLICATE_PHOTO",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("updateListing#33 店舗 A の掲載がある / 提供の設定に「開催日」を選び、開催日を1つも指定せずに保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.draft(m, a);
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(m, listing.id, {
        ...(await specOf(k, listing.id)),
        offering: dates(),
      }),
      BusinessRuleError,
      "LISTING_INVALID_OPEN_DATES",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
  });

  it("updateListing#34 店舗 A の掲載がある。加える写真の1枚は、登録の後に一定の期間持ち主が設定されず削除された / その写真を加えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const photo = await k.photo(m);
    const listing = await k.draft(m, a, { photos: [photo] });
    const [swept, kept] = await k.photos(m, 2);
    if (swept === undefined || kept === undefined) throw new Error("photos");
    await k.run(async ({ photoAssetRepository }) => {
      const found = await photoAssetRepository.findById(swept);
      if (found === null) throw new Error("photo");
      await photoAssetRepository.delete(swept, found.expectedVersion);
    });
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(m, listing.id, {
        ...(await specOf(k, listing.id)),
        photos: [kept, swept],
      }),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_AVAILABLE",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
    expect(await released(k)).toEqual([]);
    expect(await k.photoOwner(kept)).toBeNull();
  });

  it("updateListing#35 店舗 A の掲載がある。加える写真 Q は別の人が登録した、持ち主のない写真 / Q を加えて保存する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.draft(m, a);
    const q = await k.photo(await k.person());
    const before = await k.stored(listing.id);
    const spec = await specOf(k, listing.id);
    await expectCode(
      saver(k)(m, listing.id, { ...spec, photos: [...(spec.photos ?? []), q] }),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_REGISTRANT",
    );
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
    expect(await k.photoOwner(q)).toBeNull();
  });

  it("a photo a previous save removed cannot be added back before the release consumer deletes it", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [p1, p2] = await k.photos(m, 2);
    if (p1 === undefined || p2 === undefined) throw new Error("photos");
    const listing = await k.published(m, a, { photos: [p1, p2] });
    await saver(k)(m, listing.id, {
      ...(await specOf(k, listing.id)),
      photos: [p1],
    });
    expect(await released(k)).toEqual([{ photoIds: [p2] }]);
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(m, listing.id, {
        ...(await specOf(k, listing.id)),
        photos: [p1, p2],
      }),
      BusinessRuleError,
      "MEDIA_PHOTO_ALREADY_OWNED",
    );
    expect(await k.stored(listing.id)).toEqual(before);
    expect(await released(k)).toEqual([{ photoIds: [p2] }]);
  });

  it("judges an invalid input value before a stale version", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const listing = await k.published(m, a);
    const spec = await specOf(k, listing.id);
    const version = listing.version;
    await saver(k)(other, listing.id, { ...spec, name: "先に保存" });
    const before = await k.stored(listing.id);
    await expectCode(
      saver(k)(m, listing.id, { ...spec, name: "a\r\nb" }, { version }),
      BusinessRuleError,
      "LISTING_INVALID_NAME",
    );
    expect(await k.stored(listing.id)).toEqual(before);
  });
});
