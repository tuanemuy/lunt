import { CategoryId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { getManagedListing } from "../getManagedListing";
import { renameCategory } from "../renameCategory";
import { listingKit } from "./kit";

const names = (list: readonly { name: string }[]) => list.map((c) => c.name);

describe("renameCategory", () => {
  it("renameCategory#1 現役のカテゴリー「買う」があり、「買う」を設定した公開中の掲載がある。操作する人はサービス運営者 / 「買う」の名称を「買いもの」に変更する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const a = await k.place();
    const m = await k.manager(a);
    const buy = await k.category("買う");
    const listing = await k.published(m, a, { categoryId: buy });
    const before = await k.stored(listing.id);
    const result = await renameCategory({
      container: k.container,
      actor: op.actor,
      input: { categoryId: buy, name: "買いもの" },
    });
    expect(names(result)).toEqual(["食べる", "買いもの", "体験", "見る"]);
    const after = await k.stored(listing.id);
    expect(after.entity).toEqual(before.entity);
    expect(after.expectedVersion).toBe(before.expectedVersion);
    const read = await getManagedListing({
      container: k.container,
      actor: m.actor,
      input: { listingId: listing.id },
    });
    expect(read.category).toEqual({ id: buy, name: "買いもの" });
    expect(read.publication.status).toBe("published");
    expect(read.offeringStatus).toEqual({ phase: "available" });
    expect(await k.events()).toEqual([]);
  });

  it("renameCategory#2 カテゴリー「体験」が廃止済み。現役のカテゴリー「見る」がある / 「見る」の名称を「体験」に変更する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const see = await k.category("見る");
    await k.retireCategory(await k.category("体験"), see);
    const result = await renameCategory({
      container: k.container,
      actor: op.actor,
      input: { categoryId: see, name: "体験" },
    });
    expect(names(result)).toEqual(["食べる", "買う", "体験"]);
  });

  it("renameCategory#3 現役のカテゴリー「買う」がある / 「買う」の名称を、同じ「買う」に変更する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const before = await k.catalog();
    await renameCategory({
      container: k.container,
      actor: op.actor,
      input: { categoryId: await k.category("買う"), name: "買う" },
    });
    expect((await k.catalog()).expectedVersion).toBe(before.expectedVersion);
  });

  it("renameCategory#4 現役のカテゴリー「買う」がある / 「買う」の名称を空にして変更する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const before = await k.catalog();
    await expectCode(
      renameCategory({
        container: k.container,
        actor: op.actor,
        input: { categoryId: await k.category("買う"), name: "" },
      }),
      BusinessRuleError,
      "LISTING_INVALID_CATEGORY_NAME",
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("renameCategory#5 現役のカテゴリー「買う」と「見る」がある / 「買う」の名称を「見る」に変更する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const before = await k.catalog();
    await expectCode(
      renameCategory({
        container: k.container,
        actor: op.actor,
        input: { categoryId: await k.category("買う"), name: "見る" },
      }),
      BusinessRuleError,
      "LISTING_CATEGORY_NAME_TAKEN",
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("renameCategory#6 変更しようとしたカテゴリーを、別のサービス運営者がすでに廃止している / 名称を変更する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const experience = await k.category("体験");
    await k.retireCategory(experience, await k.category("見る"));
    const before = await k.catalog();
    await expectCode(
      renameCategory({
        container: k.container,
        actor: op.actor,
        input: { categoryId: experience, name: "遊ぶ" },
      }),
      BusinessRuleError,
      "LISTING_CATEGORY_RETIRED",
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("renameCategory#7 指定した CategoryId が台帳にない / 名称を変更する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    await expectCode(
      renameCategory({
        container: k.container,
        actor: op.actor,
        input: { categoryId: CategoryId.create(k.newId()), name: "遊ぶ" },
      }),
      BusinessRuleError,
      "LISTING_CATEGORY_NOT_FOUND",
    );
  });

  it("renameCategory#8 2人のサービス運営者が、同じ版の台帳を読んでいる / 同時に、別々のカテゴリーの名称を変更する", async () => {
    const k = await listingKit();
    const [op1, op2] = [await k.operator(), await k.operator()];
    const eat = await k.category("食べる");
    const buy = await k.category("買う");
    const racing = commitAfter(k.container, () =>
      renameCategory({
        container: k.container,
        actor: op2.actor,
        input: { categoryId: eat, name: "食事" },
      }),
    );
    await expectCode(
      renameCategory({
        container: racing,
        actor: op1.actor,
        input: { categoryId: buy, name: "買いもの" },
      }),
      ConflictError,
    );
    expect((await k.catalog()).entity.categories.map((c) => c.name)).toEqual([
      "食事",
      "買う",
      "体験",
      "見る",
    ]);
  });

  it("renameCategory#9 操作する人はサービス運営者の役割を持たない / 名称を変更する", async () => {
    const k = await listingKit();
    const someone = await k.person();
    const before = await k.catalog();
    await expectCode(
      renameCategory({
        container: k.container,
        actor: someone.actor,
        input: { categoryId: await k.category("買う"), name: "買いもの" },
      }),
      ForbiddenError,
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });
});
