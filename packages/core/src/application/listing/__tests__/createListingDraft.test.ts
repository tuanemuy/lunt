import { ListingId, PhotoId, PlaceId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { Listing } from "@repo/core/domain/listing/listing";
import { describe, expect, it } from "vitest";
import {
  commitAfter,
  expectCode,
  type Person,
} from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import type { GeneratedId } from "../../ports/idGenerator";
import { createListingDraft } from "../createListingDraft";
import { deleteListing } from "../deleteListing";
import { getManagedListing } from "../getManagedListing";
import { publishListing } from "../publishListing";
import {
  type ContentSpec,
  dates,
  type ListingKit,
  listingKit,
  period,
} from "./kit";

function creator(k: ListingKit) {
  return (
    who: Person,
    placeId: PlaceId,
    spec: ContentSpec,
    listingId: GeneratedId = k.newId(),
    container: RequestContainer = k.container,
  ) =>
    createListingDraft({
      container,
      actor: who.actor,
      input: { listingId, placeId, content: k.content(spec) },
    });
}

const owner = (id: string) => ({ kind: "listing", id });

describe("createListingDraft", () => {
  it("createListingDraft#1 操作する人は店舗 A の店舗管理者。現役のカテゴリー「食べる」がある。操作する人が登録した、持ち主のない写真が2枚ある / 店舗 A、名称、説明、カテゴリー「食べる」、写真2枚（1枚目に見せる範囲）、提供の設定「設定しない」で下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [p1, p2] = await k.photos(m, 2);
    if (p1 === undefined || p2 === undefined) throw new Error("photos");
    const framing = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    const eat = await k.category("食べる");
    const view = await creator(k)(m, a, {
      name: "焼きたてパン",
      description: "毎朝焼いています",
      categoryId: eat,
      photos: [{ photoId: p1, framing }, p2],
    });
    const stored = await k.stored(view.id);
    expect(stored.entity.publication.status).toBe("draft");
    expect(stored.entity.placeId).toBe(a);
    expect(stored.entity.suspension).toEqual({ suspended: false });
    expect(stored.entity.content.photos.items).toEqual([
      { photoId: p1, framing },
      { photoId: p2, framing: null },
    ]);
    expect(await k.photoOwner(p1)).toEqual(owner(view.id));
    expect(await k.photoOwner(p2)).toEqual(owner(view.id));
    expect(await k.events()).toEqual([]);
    expect(Object.keys(Listing.snapshot(stored.entity).content).sort()).toEqual(
      [
        "categoryId",
        "description",
        "name",
        "offering",
        "photos",
        "photosTakenDown",
      ],
    );
    expect(view).not.toHaveProperty("price");
    expect(view).not.toHaveProperty("tagline");
    expect(view.category).toEqual({ id: eat, name: "食べる" });
    expect(view.place.id).toBe(a);
  });

  it("createListingDraft#2 操作する人は店舗 A の店舗管理者 / 店舗 A への紐づけだけを指定し、名称・説明・カテゴリー・写真を空にして下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const view = await creator(k)(m, a, {
      name: null,
      description: null,
      categoryId: null,
      photos: [],
    });
    const stored = (await k.stored(view.id)).entity;
    expect(stored.publication.status).toBe("draft");
    expect(stored.content.name).toBeNull();
    expect(stored.content.description).toBeNull();
    expect(stored.content.categoryId).toBeNull();
    expect(stored.content.photos.items).toEqual([]);
  });

  it("createListingDraft#3 操作する人は店舗 A の店舗管理者。現役のカテゴリー「食べる」「買う」「体験」「見る」がある / 商品・体験・景色・見どころのそれぞれを、同じ項目の入力で、カテゴリーだけを変えて下書きにする", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const create = creator(k);
    const made = [];
    for (const name of ["買う", "体験", "見る", "食べる"]) {
      made.push(
        await create(m, a, {
          name: "同じ名称",
          categoryId: await k.category(name),
          photos: [],
        }),
      );
    }
    const stored = await Promise.all(made.map((v) => k.stored(v.id)));
    expect(new Set(stored.map((s) => s.entity.content.categoryId)).size).toBe(
      4,
    );
    for (const s of stored) {
      expect(s.entity.publication.status).toBe("draft");
      expect(s.entity.content.name).toBe("同じ名称");
    }
  });

  it("createListingDraft#4 店舗 B に店舗管理者がいない。操作する人はサービス運営者 / 店舗 B の下書きを作る", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const photo = await k.photo(op);
    const view = await creator(k)(op, b, { photos: [photo] });
    expect((await k.stored(view.id)).entity.placeId).toBe(b);
    expect(await k.photoOwner(photo)).toEqual(owner(view.id));
  });

  it("createListingDraft#5 店舗 A に店舗管理者がいる。操作する人は店舗 A の管理権限を持たないサービス運営者 / 店舗 A の下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    await k.manager(a);
    const op = await k.operator();
    const photo = await k.photo(op);
    const id = k.newId();
    await expectCode(
      creator(k)(op, a, { photos: [photo] }, id),
      ForbiddenError,
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
    expect(await k.photoOwner(photo)).toBeNull();
  });

  it("createListingDraft#6 操作する人は店舗 A の管理権限を持たない利用者 / 店舗 A の下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    await k.manager(a);
    const someone = await k.person();
    const id = k.newId();
    await expectCode(
      creator(k)(someone, a, { photos: [] }, id),
      ForbiddenError,
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
  });

  it("createListingDraft#7 操作する人は、作成の途中で店舗 A の店舗管理者を辞任した / 店舗 A の下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const id = k.newId();
    const resigning = commitAfter(k.container, () =>
      k.removeSteward(k.ref(a), m),
    );
    await expectCode(
      creator(k)(m, a, { photos: [] }, id, resigning),
      ForbiddenError,
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
  });

  it("createListingDraft#8 サービス運営者が店舗 B の掲載を作成している間に、店舗 B に店舗管理者が就いた / サービス運営者が店舗 B の下書きを作る", async () => {
    const k = await listingKit();
    const b = await k.place();
    const op = await k.operator();
    const newcomer = await k.person();
    const id = k.newId();
    const appointing = commitAfter(k.container, () =>
      k.appoint(k.ref(b), newcomer),
    );
    await expectCode(
      creator(k)(op, b, { photos: [] }, id, appointing),
      ForbiddenError,
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
  });

  it("createListingDraft#9 指定した PlaceId の店舗がない。操作する人はサービス運営者 / 下書きを作る", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const id = k.newId();
    await expectCode(
      creator(k)(op, PlaceId.create(k.newId()), { photos: [] }, id),
      NotFoundError,
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
  });

  it("createListingDraft#10 操作する人は店舗 A の店舗管理者。選んだカテゴリーが、保存までに廃止された / そのカテゴリーで下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const experience = await k.category("体験");
    await k.retireCategory(experience, await k.category("見る"));
    const id = k.newId();
    await expectCode(
      creator(k)(m, a, { categoryId: experience, photos: [] }, id),
      BusinessRuleError,
      "LISTING_CATEGORY_NOT_AVAILABLE",
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
  });

  it("createListingDraft#11 操作する人は店舗 A の店舗管理者 / 提供期間の終了日を開始日より前にして下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const id = k.newId();
    await expectCode(
      creator(k)(
        m,
        a,
        { photos: [], offering: period("2026-08-31", "2026-07-20") },
        id,
      ),
      BusinessRuleError,
      "LISTING_INVALID_OFFERING_PERIOD",
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
  });

  it("createListingDraft#12 操作する人は店舗 A の店舗管理者 / 提供の設定に「提供期間」を選び、開始日も終了日も指定せずに下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const id = k.newId();
    await expectCode(
      creator(k)(m, a, { photos: [], offering: period(null, null) }, id),
      BusinessRuleError,
      "LISTING_INVALID_OFFERING_PERIOD",
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
  });

  it("createListingDraft#13 操作する人は店舗 A の店舗管理者 / 提供の設定に「開催日」を選び、開催日を1つも指定せずに下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const id = k.newId();
    await expectCode(
      creator(k)(m, a, { photos: [], offering: dates() }, id),
      BusinessRuleError,
      "LISTING_INVALID_OPEN_DATES",
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
  });

  it("createListingDraft#14 操作する人は店舗 A の店舗管理者。同じ ListingId、同じ店舗、同じ内容の下書きが保存されている / 同じ要求を送り直す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const photo = await k.photo(m);
    const id = k.newId();
    const spec = { photos: [photo], offering: period("2026-07-20", null) };
    await creator(k)(m, a, spec, id);
    const before = await k.stored(ListingId.create(id));
    const again = await creator(k)(m, a, spec, id);
    expect(again.id).toBe(id);
    const after = await k.stored(ListingId.create(id));
    expect(after.expectedVersion).toBe(before.expectedVersion);
    expect(after.entity).toEqual(before.entity);
    expect(await k.events()).toEqual([]);
  });

  it("createListingDraft#15 操作する人は店舗 A の店舗管理者。同じ ListingId、同じ店舗、同じ内容の下書きが作られ、その後に公開された / 作成の要求を送り直す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const photo = await k.photo(m);
    const id = k.newId();
    await creator(k)(m, a, { photos: [photo] }, id);
    await publishListing({
      container: k.container,
      actor: m.actor,
      input: { listingId: ListingId.create(id) },
    });
    const before = await k.stored(ListingId.create(id));
    const again = await creator(k)(m, a, { photos: [photo] }, id);
    expect(again.publication.status).toBe("published");
    expect((await k.stored(ListingId.create(id))).expectedVersion).toBe(
      before.expectedVersion,
    );
  });

  it("createListingDraft#16 操作する人は店舗 A の店舗管理者。同じ ListingId の掲載が保存されている / 同じ ListingId で、名称の違う内容の下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const id = k.newId();
    await creator(k)(m, a, { name: "元の名称", photos: [] }, id);
    const before = await k.stored(ListingId.create(id));
    await expectCode(
      creator(k)(m, a, { name: "別の名称", photos: [] }, id),
      ConflictError,
    );
    expect((await k.stored(ListingId.create(id))).entity).toEqual(
      before.entity,
    );
  });

  it("createListingDraft#17 操作する人は店舗 A の店舗管理者。ListingId X で下書きを作り、その後 X の掲載を削除した / 同じ X と同じ内容で、下書きの作成を送り直す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const photo = await k.photo(m);
    const x = k.newId();
    await creator(k)(m, a, { photos: [photo] }, x);
    await deleteListing({
      container: k.container,
      actor: m.actor,
      input: { listingId: ListingId.create(x) },
    });
    const photoBefore = await k.run(({ photoAssetRepository }) =>
      photoAssetRepository.findById(photo),
    );
    await expectCode(creator(k)(m, a, { photos: [photo] }, x), ConflictError);
    await expectCode(
      getManagedListing({
        container: k.container,
        actor: m.actor,
        input: { listingId: ListingId.create(x) },
      }),
      NotFoundError,
    );
    const photoAfter = await k.run(({ photoAssetRepository }) =>
      photoAssetRepository.findById(photo),
    );
    expect(photoAfter?.expectedVersion).toBe(photoBefore?.expectedVersion);
  });

  it("createListingDraft#18 操作する人は店舗 A の店舗管理者。指定した写真の1枚が、すでに別の掲載を持ち主に持つ / その写真を含む下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const [taken, free] = await k.photos(m, 2);
    if (taken === undefined || free === undefined) throw new Error("photos");
    const other = await creator(k)(m, a, { photos: [taken] });
    const id = k.newId();
    await expectCode(
      creator(k)(m, a, { photos: [free, taken] }, id),
      BusinessRuleError,
      "MEDIA_PHOTO_ALREADY_OWNED",
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
    expect(await k.photoOwner(free)).toBeNull();
    expect(await k.photoOwner(taken)).toEqual(owner(other.id));
  });

  it("createListingDraft#19 操作する人は店舗 A の店舗管理者 / 名称に改行を含めて下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const id = k.newId();
    await expectCode(
      creator(k)(m, a, { name: "1行目\n2行目", photos: [] }, id),
      BusinessRuleError,
      "LISTING_INVALID_NAME",
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
  });

  it("createListingDraft#20 操作する人は店舗 A の店舗管理者。操作する人が登録した、持ち主のない写真 P / 写真を P・P の順にして下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const p = await k.photo(m);
    const id = k.newId();
    await expectCode(
      creator(k)(m, a, { photos: [p, p] }, id),
      BusinessRuleError,
      "LISTING_DUPLICATE_PHOTO",
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
    expect(await k.photoOwner(p)).toBeNull();
  });

  it("createListingDraft#21 操作する人は店舗 A の店舗管理者。存在しない PhotoId と、操作する人が登録した持ち主のない写真 / 両方を載せて下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const mine = await k.photo(m);
    const id = k.newId();
    await expectCode(
      creator(k)(m, a, { photos: [PhotoId.create(k.newId()), mine] }, id),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_AVAILABLE",
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
    expect(await k.photoOwner(mine)).toBeNull();
  });

  it("createListingDraft#22 操作する人は店舗 A の店舗管理者。写真 Q は別の人が登録した、持ち主のない写真 / Q を載せて下書きを作る", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    const q = await k.photo(await k.person());
    const id = k.newId();
    await expectCode(
      creator(k)(m, a, { photos: [q] }, id),
      BusinessRuleError,
      "MEDIA_PHOTO_NOT_REGISTRANT",
    );
    expect(await k.findListing(ListingId.create(id))).toBeNull();
    expect(await k.photoOwner(q)).toBeNull();
  });
});
