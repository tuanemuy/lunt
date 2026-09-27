import { describe, expect, it } from "vitest";
import { listCategories } from "../listCategories";
import { listingKit } from "./kit";

const names = (list: readonly { name: string }[]) => list.map((c) => c.name);

describe("listCategories", () => {
  it("listCategories#1 開設時のカテゴリーが入っている / 読む", async () => {
    const k = await listingKit();
    const result = await listCategories({ container: k.container });
    expect(names(result)).toEqual(["食べる", "買う", "体験", "見る"]);
    expect(
      result.every((c) => Object.keys(c).sort().join() === "id,name"),
    ).toBe(true);
  });

  it("listCategories#2 カテゴリー「泊まる」が追加されている / 読む", async () => {
    const k = await listingKit();
    await k.addCategory("泊まる");
    expect(names(await listCategories({ container: k.container }))).toEqual([
      "食べる",
      "買う",
      "体験",
      "見る",
      "泊まる",
    ]);
  });

  it("listCategories#3 カテゴリー「体験」が廃止されている / 読む", async () => {
    const k = await listingKit();
    await k.retireCategory(await k.category("体験"), await k.category("見る"));
    expect(names(await listCategories({ container: k.container }))).toEqual([
      "食べる",
      "買う",
      "見る",
    ]);
  });

  it("listCategories#4 カテゴリー「買う」の名称が「買いもの」に変更されている / 読む", async () => {
    const k = await listingKit();
    await k.renameCategory(await k.category("買う"), "買いもの");
    expect(names(await listCategories({ container: k.container }))).toEqual([
      "食べる",
      "買いもの",
      "体験",
      "見る",
    ]);
  });

  it("listCategories#5 保存された台帳がない / 読む", async () => {
    const k = await listingKit({ categories: false });
    expect(await listCategories({ container: k.container })).toEqual([]);
  });
});
