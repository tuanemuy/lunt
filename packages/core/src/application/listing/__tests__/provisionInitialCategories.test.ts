import { describe, expect, it } from "vitest";
import { commitAfter } from "../../authority/__tests__/kit";
import { ConflictError } from "../../errors";
import { listCategories } from "../listCategories";
import { provisionInitialCategories } from "../provisionInitialCategories";
import { listingKit } from "./kit";

const names = (list: readonly { name: string }[]) => list.map((c) => c.name);

describe("provisionInitialCategories", () => {
  it("provisionInitialCategories#1 保存された台帳がない / 実行する", async () => {
    const k = await listingKit({ categories: false });
    expect(
      await provisionInitialCategories({ container: k.container }),
    ).toEqual({ provisioned: true });
    const catalog = (await k.catalog()).entity;
    expect(catalog.categories.map((c) => [c.name, c.status])).toEqual([
      ["食べる", "active"],
      ["買う", "active"],
      ["体験", "active"],
      ["見る", "active"],
    ]);
    expect(await k.events()).toEqual([]);
  });

  it("provisionInitialCategories#2 初期値の4つが入っている / もう一度実行する", async () => {
    const k = await listingKit();
    const before = await k.catalog();
    expect(
      await provisionInitialCategories({ container: k.container }),
    ).toEqual({ provisioned: false });
    const after = await k.catalog();
    expect(after.expectedVersion).toBe(before.expectedVersion);
    expect(after.entity.categories).toHaveLength(4);
  });

  it("provisionInitialCategories#3 開設の後に、カテゴリーの追加と廃止が行われている / 実行する", async () => {
    const k = await listingKit();
    await k.addCategory("泊まる");
    await k.retireCategory(await k.category("体験"), await k.category("見る"));
    const before = await k.catalog();
    await provisionInitialCategories({ container: k.container });
    const after = await k.catalog();
    expect(after.entity).toEqual(before.entity);
    expect(after.expectedVersion).toBe(before.expectedVersion);
  });

  it("provisionInitialCategories#4 保存された台帳がない / 同時に2つ実行する", async () => {
    const k = await listingKit({ categories: false });
    const results = await Promise.allSettled([
      provisionInitialCategories({ container: k.container }),
      provisionInitialCategories({ container: k.container }),
    ]);
    const rejected = results.filter((r) => r.status === "rejected");
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    }
    const catalog = (await k.catalog()).entity;
    expect(catalog.categories).toHaveLength(4);
    expect(names(await listCategories({ container: k.container }))).toEqual([
      "食べる",
      "買う",
      "体験",
      "見る",
    ]);
  });

  it("two runs that both read the empty catalog: one writes, the other conflicts", async () => {
    const k = await listingKit({ categories: false });
    const racing = commitAfter(k.container, () =>
      provisionInitialCategories({ container: k.container }),
    );
    await expect(
      provisionInitialCategories({ container: racing }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await k.catalog()).entity.categories).toHaveLength(4);
  });
});
