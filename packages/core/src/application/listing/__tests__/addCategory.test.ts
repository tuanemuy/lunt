import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { commitAfter, expectCode } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError } from "../../errors";
import { addCategory } from "../addCategory";
import { listCategories } from "../listCategories";
import { listingKit } from "./kit";

const names = (list: readonly { name: string }[]) => list.map((c) => c.name);

describe("addCategory", () => {
  it("addCategory#1 現役のカテゴリー「食べる」「買う」「体験」「見る」がある。操作する人はサービス運営者 / 新しい CategoryId と名称「泊まる」で追加する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const id = k.newId();
    const result = await addCategory({
      container: k.container,
      actor: op.actor,
      input: { categoryId: id, name: "泊まる" },
    });
    expect(names(result)).toEqual(["食べる", "買う", "体験", "見る", "泊まる"]);
    expect(result.at(-1)?.id).toBe(id);
    expect(names(await listCategories({ container: k.container }))).toEqual(
      names(result),
    );
    expect(await k.events()).toEqual([]);
  });

  it("addCategory#2 カテゴリー「体験」が廃止済み / 名称「体験」で追加する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const retired = await k.category("体験");
    await k.retireCategory(retired, await k.category("見る"));
    const id = k.newId();
    const result = await addCategory({
      container: k.container,
      actor: op.actor,
      input: { categoryId: id, name: "体験" },
    });
    expect(names(result)).toEqual(["食べる", "買う", "見る", "体験"]);
    expect(result.at(-1)?.id).toBe(id);
    expect(id).not.toBe(retired);
  });

  it("addCategory#3 操作する人はサービス運営者 / 空の名称で追加する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const before = await k.catalog();
    await expectCode(
      addCategory({
        container: k.container,
        actor: op.actor,
        input: { categoryId: k.newId(), name: "  " },
      }),
      BusinessRuleError,
      "LISTING_INVALID_CATEGORY_NAME",
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("addCategory#4 現役のカテゴリー「買う」がある / 名称「買う」で追加する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const before = await k.catalog();
    await expectCode(
      addCategory({
        container: k.container,
        actor: op.actor,
        input: { categoryId: k.newId(), name: "買う" },
      }),
      BusinessRuleError,
      "LISTING_CATEGORY_NAME_TAKEN",
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("addCategory#5 同じ CategoryId と同じ名称の追加が、すでに成立している / 同じ要求を送り直す", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const input = { categoryId: k.newId(), name: "泊まる" };
    await addCategory({ container: k.container, actor: op.actor, input });
    const before = await k.catalog();
    const result = await addCategory({
      container: k.container,
      actor: op.actor,
      input,
    });
    expect(names(result)).toEqual(["食べる", "買う", "体験", "見る", "泊まる"]);
    const after = await k.catalog();
    expect(after.expectedVersion).toBe(before.expectedVersion);
    expect(after.entity.categories).toHaveLength(5);
  });

  it("addCategory#6 同じ CategoryId のカテゴリーがある / 同じ CategoryId で、違う名称で追加する", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const categoryId = k.newId();
    await addCategory({
      container: k.container,
      actor: op.actor,
      input: { categoryId, name: "泊まる" },
    });
    const before = await k.catalog();
    await expectCode(
      addCategory({
        container: k.container,
        actor: op.actor,
        input: { categoryId, name: "民宿" },
      }),
      ConflictError,
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("addCategory#7 CategoryId が c5 の「泊まる」が追加され、その後に廃止された / c5 と名称「泊まる」で追加を送り直す", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const input = { categoryId: k.newId(), name: "泊まる" };
    const added = await addCategory({
      container: k.container,
      actor: op.actor,
      input,
    });
    const c5 = added.at(-1)?.id;
    if (c5 === undefined) throw new Error("added");
    await k.retireCategory(c5, await k.category("見る"));
    const before = await k.catalog();
    await expectCode(
      addCategory({ container: k.container, actor: op.actor, input }),
      ConflictError,
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("addCategory#8 2人のサービス運営者が、同じ版の台帳を読んでいる / それぞれが別の名称のカテゴリーを同時に追加する", async () => {
    const k = await listingKit();
    const [op1, op2] = [await k.operator(), await k.operator()];
    const racing = commitAfter(k.container, () =>
      addCategory({
        container: k.container,
        actor: op2.actor,
        input: { categoryId: k.newId(), name: "泊まる" },
      }),
    );
    await expectCode(
      addCategory({
        container: racing,
        actor: op1.actor,
        input: { categoryId: k.newId(), name: "学ぶ" },
      }),
      ConflictError,
    );
    expect(names(await listCategories({ container: k.container }))).toEqual([
      "食べる",
      "買う",
      "体験",
      "見る",
      "泊まる",
    ]);
  });

  it("addCategory#9 操作する人はサービス運営者の役割を持たない / 追加する", async () => {
    const k = await listingKit();
    const someone = await k.person();
    const before = await k.catalog();
    await expectCode(
      addCategory({
        container: k.container,
        actor: someone.actor,
        input: { categoryId: k.newId(), name: "泊まる" },
      }),
      ForbiddenError,
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });

  it("addCategory#10 操作する人は、操作の途中でサービス運営者の役割を解除された / 追加する", async () => {
    const k = await listingKit();
    const [op, other] = [await k.operator(), await k.operator()];
    void other;
    const before = await k.catalog();
    const revoking = commitAfter(k.container, () =>
      k.revokeHolder("operator", op),
    );
    await expectCode(
      addCategory({
        container: revoking,
        actor: op.actor,
        input: { categoryId: k.newId(), name: "泊まる" },
      }),
      ForbiddenError,
    );
    expect((await k.catalog()).entity).toEqual(before.entity);
  });
});
