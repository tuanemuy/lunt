import { CategoryId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { endListingOffering } from "../endListingOffering";
import { getManagedListing } from "../getManagedListing";
import { listCategories } from "../listCategories";
import { listPlaceListings } from "../listPlaceListings";
import { publishListing } from "../publishListing";
import { retireCategory } from "../retireCategory";
import { suspendListing } from "../suspendListing";
import { unpublishListing } from "../unpublishListing";
import { updateListing } from "../updateListing";
import { listingKit } from "./kit";

const names = (list: readonly { name: string }[]) => list.map((c) => c.name);

describe("retireCategory", () => {
  it("retireCategory#1 現役のカテゴリー「食べる」「買う」「体験」「見る」がある。「体験」を設定した公開中の掲載がある。操作する人はサービス運営者 / 「体験」を、移行先「見る」で廃止する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const a = await k.place();
    const m = await k.manager(a);
    const [experience, see] = [
      await k.category("体験"),
      await k.category("見る"),
    ];
    const listing = await k.published(m, a, { categoryId: experience });
    const before = await k.stored(listing.id);
    const result = await retireCategory({
      container: k.container,
      actor: op.actor,
      input: { categoryId: experience, successorId: see },
    });
    expect(names(result)).toEqual(["食べる", "買う", "見る"]);
    expect(
      (await k.catalog()).entity.categories.find((c) => c.id === experience),
    ).toEqual({
      id: experience,
      name: "体験",
      status: "retired",
      successorId: see,
    });
    expect((await k.events("category.retired")).map((e) => e.payload)).toEqual([
      { categoryId: experience },
    ]);
    expect(names(await listCategories({ container: k.container }))).toEqual([
      "食べる",
      "買う",
      "見る",
    ]);
    const after = await k.stored(listing.id);
    expect(after.entity).toEqual(before.entity);
    const read = await getManagedListing({
      container: k.container,
      actor: m.actor,
      input: { listingId: listing.id },
    });
    expect(read.category).toEqual({ id: see, name: "見る" });
    expect(read.publication.status).toBe("published");
    expect(read.offeringStatus).toEqual({ phase: "available" });
  });

  it("retireCategory#2 現役のカテゴリー「泊まる」を設定した掲載も申請も、1件もない / 「泊まる」を、移行先「見る」で廃止する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const stay = await k.addCategory("泊まる");
    await retireCategory({
      container: k.container,
      actor: op.actor,
      input: { categoryId: stay, successorId: await k.category("見る") },
    });
    expect((await k.events("category.retired")).map((e) => e.payload)).toEqual([
      { categoryId: stay },
    ]);
  });

  it("retireCategory#3 「体験」を保存した掲載が、公開中、下書き、一時非公開、運営による非公開、提供終了に1件ずつある / 「体験」を、移行先「見る」で廃止する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const a = await k.place();
    const m = await k.manager(a);
    const [experience, see] = [
      await k.category("体験"),
      await k.category("見る"),
    ];
    const spec = { categoryId: experience };
    const published = await k.published(m, a, spec);
    const draft = await k.draft(m, a, spec);
    const unpublished = await k.published(m, a, spec);
    await unpublishListing({
      container: k.container,
      actor: m.actor,
      input: { listingId: unpublished.id },
    });
    const suspended = await k.published(m, a, spec);
    await suspendListing({
      container: k.container,
      actor: op.actor,
      input: { listingId: suspended.id },
    });
    const ended = await k.published(m, a, spec);
    await endListingOffering({
      container: k.container,
      actor: m.actor,
      input: { listingId: ended.id },
    });
    const ids = [
      published.id,
      draft.id,
      unpublished.id,
      suspended.id,
      ended.id,
    ];
    const before = await Promise.all(ids.map((id) => k.stored(id)));
    await retireCategory({
      container: k.container,
      actor: op.actor,
      input: { categoryId: experience, successorId: see },
    });
    for (const id of ids) {
      const read = await getManagedListing({
        container: k.container,
        actor: m.actor,
        input: { listingId: id },
      });
      expect(read.category).toEqual({ id: see, name: "見る" });
    }
    const list = await listPlaceListings({
      container: k.container,
      actor: m.actor,
      input: {
        placeId: a,
        shelf: { publication: null, phase: null },
        pagination: { page: 1, limit: 10 },
      },
    });
    expect(list.items.map((row) => row.category)).toEqual(
      ids.map(() => ({ id: see, name: "見る" })),
    );
    const after = await Promise.all(ids.map((id) => k.stored(id)));
    expect(after.map((r) => r.expectedVersion)).toEqual(
      before.map((r) => r.expectedVersion),
    );
  });

  it("retireCategory#4 「体験」が移行先「見る」で廃止されている。「体験」を保存した掲載がある / 「見る」を、移行先「買う」で廃止する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const a = await k.place();
    const m = await k.manager(a);
    const [experience, see, buy] = [
      await k.category("体験"),
      await k.category("見る"),
      await k.category("買う"),
    ];
    const listing = await k.published(m, a, { categoryId: experience });
    await k.retireCategory(experience, see);
    await retireCategory({
      container: k.container,
      actor: op.actor,
      input: { categoryId: see, successorId: buy },
    });
    const read = await getManagedListing({
      container: k.container,
      actor: m.actor,
      input: { listingId: listing.id },
    });
    expect(read.category).toEqual({ id: buy, name: "買う" });
  });

  it("retireCategory#5 店舗管理者が、「体験」を保存した掲載（版 3）を読んで編集している。その間に「体験」が移行先「見る」で廃止された / 版 3 を添えて、カテゴリーに「見る」を選んで内容を保存する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const a = await k.place();
    const m = await k.manager(a);
    const [experience, see] = [
      await k.category("体験"),
      await k.category("見る"),
    ];
    const photo = await k.photo(m);
    const listing = await k.published(m, a, {
      categoryId: experience,
      photos: [photo],
    });
    const listingId = listing.id;
    await unpublishListing({
      container: k.container,
      actor: m.actor,
      input: { listingId },
    });
    const read = await publishListing({
      container: k.container,
      actor: m.actor,
      input: { listingId },
    });
    expect(read.version).toBe(3);
    await retireCategory({
      container: k.container,
      actor: op.actor,
      input: { categoryId: experience, successorId: see },
    });
    const saved = await updateListing({
      container: k.container,
      actor: m.actor,
      input: {
        listingId,
        version: 3,
        content: k.content({ categoryId: see, photos: [photo] }),
      },
    });
    expect(saved.category).toEqual({ id: see, name: "見る" });
    expect((await k.stored(listingId)).entity.content.categoryId).toBe(see);
  });

  it("retireCategory#6 現役のカテゴリー「体験」がある / 「体験」を、移行先「体験」で廃止する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const experience = await k.category("体験");
    const before = await k.catalog();
    await expectCode(
      retireCategory({
        container: k.container,
        actor: op.actor,
        input: { categoryId: experience, successorId: experience },
      }),
      BusinessRuleError,
      "LISTING_CATEGORY_SUCCESSOR_INVALID",
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("retireCategory#7 選んだ移行先を、確定までの間に別のサービス運営者が廃止している / 廃止する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const [experience, see] = [
      await k.category("体験"),
      await k.category("見る"),
    ];
    await k.retireCategory(see, await k.category("買う"));
    await expectCode(
      retireCategory({
        container: k.container,
        actor: op.actor,
        input: { categoryId: experience, successorId: see },
      }),
      BusinessRuleError,
      "LISTING_CATEGORY_SUCCESSOR_INVALID",
    );
    expect(
      (await k.catalog()).entity.categories.find((c) => c.id === experience)
        ?.status,
    ).toBe("active");
    expect(await k.events("category.retired")).toEqual([]);
  });

  it("retireCategory#8 指定した CategoryId が台帳にない / 移行先「見る」で廃止する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const before = await k.catalog();
    await expectCode(
      retireCategory({
        container: k.container,
        actor: op.actor,
        input: {
          categoryId: CategoryId.create(k.newId()),
          successorId: await k.category("見る"),
        },
      }),
      BusinessRuleError,
      "LISTING_CATEGORY_NOT_FOUND",
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("retireCategory#9 現役のカテゴリーが「見る」の1つだけで、「体験」が移行先「見る」で廃止されている / 「見る」を、移行先「体験」（廃止済み）で廃止する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const see = await k.category("見る");
    const experience = await k.category("体験");
    await k.retireCategory(await k.category("食べる"), see);
    await k.retireCategory(await k.category("買う"), see);
    await k.retireCategory(experience, see);
    const before = await k.catalog();
    await expectCode(
      retireCategory({
        container: k.container,
        actor: op.actor,
        input: { categoryId: see, successorId: experience },
      }),
      BusinessRuleError,
      "LISTING_CATEGORY_LAST_ONE",
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("retireCategory#10 現役のカテゴリーが「見る」の1つだけ / 「見る」を、移行先「見る」で廃止する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const see = await k.category("見る");
    for (const name of ["食べる", "買う", "体験"]) {
      await k.retireCategory(await k.category(name), see);
    }
    const before = await k.catalog();
    await expectCode(
      retireCategory({
        container: k.container,
        actor: op.actor,
        input: { categoryId: see, successorId: see },
      }),
      BusinessRuleError,
      "LISTING_CATEGORY_LAST_ONE",
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("retireCategory#11 廃止するカテゴリーを、別のサービス運営者がすでに廃止している / 廃止する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const [experience, see] = [
      await k.category("体験"),
      await k.category("見る"),
    ];
    await k.retireCategory(experience, see);
    await expectCode(
      retireCategory({
        container: k.container,
        actor: op.actor,
        input: {
          categoryId: experience,
          successorId: await k.category("買う"),
        },
      }),
      BusinessRuleError,
      "LISTING_CATEGORY_RETIRED",
    );
    const stored = (await k.catalog()).entity.categories.find(
      (c) => c.id === experience,
    );
    expect(stored?.status === "retired" ? stored.successorId : null).toBe(see);
    expect(await k.events("category.retired")).toEqual([]);
  });

  it("retireCategory#12 現役のカテゴリーが「体験」「見る」の2つ。2人のサービス運営者が、同じ版の台帳を読んでいる / 同時に、一方が「体験」を移行先「見る」で、他方が「見る」を移行先「体験」で廃止する", async () => {
    const k = await listingKit();
    const [op1, op2] = [await k.operator(), await k.operator()];
    const [experience, see] = [
      await k.category("体験"),
      await k.category("見る"),
    ];
    await k.retireCategory(await k.category("食べる"), see);
    await k.retireCategory(await k.category("買う"), see);
    const racing = commitAfter(k.container, () =>
      retireCategory({
        container: k.container,
        actor: op2.actor,
        input: { categoryId: see, successorId: experience },
      }),
    );
    await expectCode(
      retireCategory({
        container: racing,
        actor: op1.actor,
        input: { categoryId: experience, successorId: see },
      }),
      ConflictError,
    );
    const catalog = (await k.catalog()).entity;
    expect(names(await listCategories({ container: k.container }))).toEqual([
      "体験",
    ]);
    const retiredSee = catalog.categories.find((c) => c.id === see);
    expect(
      retiredSee?.status === "retired" ? retiredSee.successorId : null,
    ).toBe(experience);
  });

  it("retireCategory#13 操作する人はサービス運営者の役割を持たない / 廃止する", async () => {
    const k = await listingKit();
    const someone = await k.person();
    const before = await k.catalog();
    await expectCode(
      retireCategory({
        container: k.container,
        actor: someone.actor,
        input: {
          categoryId: await k.category("体験"),
          successorId: await k.category("見る"),
        },
      }),
      ForbiddenError,
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });
});
