import { LocalDate } from "@repo/core/domain/common/localDate";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { detectEndedOfferings } from "../detectEndedOfferings";
import { getManagedListing } from "../getManagedListing";
import { listPlaceListings } from "../listPlaceListings";
import { searchListingsForOperation } from "../searchListingsForOperation";
import { listingKit } from "./kit";

describe("deleteListing", () => {
  it("deleteListing#1 店舗 A の公開中の掲載に写真が2枚あり、提供状態の確認記録がある。操作する人は店舗 A の店舗管理者 / 削除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const [p1, p2] = await k.photos(m, 2);
    if (p1 === undefined || p2 === undefined) throw new Error("photos");
    const listing = await k.published(m, a, {
      name: "りんご",
      photos: [p1, p2],
    });
    await detectEndedOfferings(k.container, k.clock.now());
    expect(await k.offeringRecord(listing.id)).not.toBeNull();
    const mark = await k.mark();
    await k.remove(m, listing.id);
    const list = await listPlaceListings({
      container: k.container,
      actor: m.actor,
      input: {
        placeId: a,
        shelf: { publication: null, phase: null },
        pagination: { page: 1, limit: 10 },
      },
    });
    expect(list.items).toEqual([]);
    const found = await searchListingsForOperation({
      container: k.container,
      actor: op.actor,
      input: { keyword: "りんご", pagination: { page: 1, limit: 10 } },
    });
    expect(found.items).toEqual([]);
    expect((await k.since(mark)).map((e) => [e.type, e.payload])).toEqual([
      ["listing.deleted", { listingId: listing.id }],
      ["photos.released", { photoIds: [p1, p2] }],
    ]);
    expect(await k.offeringRecord(listing.id)).toBeNull();
    const records = await k.run(({ offeringPhaseLedger }) =>
      offeringPhaseLedger.findPageDrifted(
        LocalDate.fromInstant(k.clock.now()),
        { page: 1, limit: 10 },
      ),
    );
    expect(records.items).toEqual([]);
  });

  it("deleteListing#2 上の削除が成立している / 削除した掲載を getManagedListing で読む", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.remove(m, listing.id);
    await expectCode(
      getManagedListing({
        container: k.container,
        actor: m.actor,
        input: { listingId: listing.id },
      }),
      NotFoundError,
    );
  });

  it("deleteListing#3 店舗 A に、下書き、一時非公開、提供終了、運営による非公開の掲載がある / それぞれを削除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const op = await k.operator();
    const draft = await k.draft(m, a);
    const unpublished = await k.published(m, a);
    await k.unpublish(m, unpublished.id);
    const ended = await k.published(m, a);
    await k.end(m, ended.id);
    const suspended = await k.published(m, a);
    await k.suspend(op, suspended.id);
    for (const id of [draft.id, unpublished.id, ended.id, suspended.id]) {
      await k.remove(m, id);
      expect(await k.findListing(id)).toBeNull();
    }
  });

  it("deleteListing#4 店舗 B の掲載は、管理者のいなかった時期にサービス運営者が代理作成して公開した。その後、操作する人が店舗 B の店舗管理者に就いた / 店舗管理者がその掲載を削除する", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const listing = await k.published(op, b);
    const m = await k.manager(b);
    await k.remove(m, listing.id);
    expect(await k.findListing(listing.id)).toBeNull();
  });

  it("deleteListing#5 店舗 B に店舗管理者がいない。操作する人はサービス運営者 / 店舗 B の掲載を削除する", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const listing = await k.published(op, b);
    await k.remove(op, listing.id);
    expect(await k.findListing(listing.id)).toBeNull();
    expect((await k.events("listing.deleted")).map((e) => e.payload)).toEqual([
      { listingId: listing.id },
    ]);
  });

  it("deleteListing#6 店舗 A に店舗管理者がいる。操作する人は店舗 A の管理権限を持たないサービス運営者 / 店舗 A の掲載を削除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const before = await k.stored(listing.id);
    const mark = await k.mark();
    await expectCode(k.remove(await k.operator(), listing.id), ForbiddenError);
    expect((await k.stored(listing.id)).entity).toEqual(before.entity);
    expect(await k.since(mark)).toEqual([]);
  });

  it("deleteListing#7 操作する人は、削除の確認の間に店舗 A の管理権限を失った / 店舗 A の掲載を削除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    const resigning = commitAfter(k.container, () =>
      k.removeSteward(k.ref(a), m),
    );
    await expectCode(k.remove(m, listing.id, resigning), ForbiddenError);
    expect(await k.findListing(listing.id)).not.toBeNull();
  });

  it("deleteListing#8 別の店舗管理者が、先に同じ掲載を削除している / 削除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const listing = await k.published(m, a);
    await k.remove(await k.manager(a), listing.id);
    const mark = await k.mark();
    await expectCode(k.remove(m, listing.id), NotFoundError);
    expect(await k.since(mark)).toEqual([]);
  });

  it("deleteListing#9 店舗 A の掲載がある。店舗管理者が削除する操作と、別の店舗管理者の同じ掲載の内容の保存が同時に確定する / 削除する", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const other = await k.manager(a);
    const listing = await k.published(m, a);
    const racing = commitAfter(k.container, () =>
      k.saveName(other, listing.id, "先に保存"),
    );
    const mark = await k.mark();
    await expectCode(k.remove(m, listing.id, racing), ConflictError);
    expect((await k.stored(listing.id)).entity.content.name).toBe("先に保存");
    expect(await k.since(mark)).toEqual([]);
  });
});
