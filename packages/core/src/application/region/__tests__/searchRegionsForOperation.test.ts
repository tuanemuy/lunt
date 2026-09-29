import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { searchRegionsForOperation } from "../searchRegionsForOperation";
import { type RegionKit, regionKit } from "./kit";

const search = (k: RegionKit, who: Person, keyword: string, limit = 20) =>
  searchRegionsForOperation({
    container: k.container,
    actor: who.actor,
    input: { keyword, pagination: { page: 1, limit } },
  });

async function operator() {
  const k = regionKit();
  const O = await k.setupOperator();
  return { k, O };
}

describe("searchRegionsForOperation", () => {
  it("searchRegionsForOperation#1 操作する人がサービス運営者。名称にキーワードを含む地域が、draft・published・unpublished・運営による非公開のそれぞれにある / キーワードで探す", async () => {
    const { k, O } = await operator();
    const draft = await k.region({ name: "谷中の下書き" }, "draft");
    const published = await k.region({ name: "谷中の公開" }, "published");
    const unpublished = await k.region(
      { name: "谷中の取り下げ" },
      "unpublished",
    );
    const suspended = await k.region({ name: "谷中の非公開" }, "published", {
      suspended: true,
    });
    const found = await search(k, O, "谷中");
    expect(found.count).toBe(4);
    const byId = new Map(found.items.map((item) => [item.region.id, item]));
    expect(byId.get(draft.id)?.region).toEqual(draft);
    expect(byId.get(published.id)?.region).toEqual(published);
    expect(byId.get(unpublished.id)?.region).toEqual(unpublished);
    expect(byId.get(suspended.id)?.region).toEqual(suspended);
    expect(byId.get(suspended.id)?.region.suspension).toEqual({
      suspended: true,
    });
    expect(byId.get(unpublished.id)?.region.publication.status).toBe(
      "unpublished",
    );
  });

  it("searchRegionsForOperation#2 操作する人がサービス運営者。キーワードと名称が完全に一致する地域、名称がキーワードで始まる地域、名称の途中にキーワードを含む地域がある / キーワードで探す", async () => {
    const { k, O } = await operator();
    const partial = await k.region({ name: "東京谷中" });
    const prefix = await k.region({ name: "谷中銀座" });
    const exact = await k.region({ name: "谷中" });
    const found = await search(k, O, "谷中");
    expect(found.items.map((item) => item.region.id)).toEqual([
      exact.id,
      prefix.id,
      partial.id,
    ]);
  });

  it("searchRegionsForOperation#3 操作する人がサービス運営者。キーワードに合う地域のうち、1つには地域運営者がいて、1つにはいない（管理権限を付与されたことがない）、1つは最後の運営者が辞任している / キーワードで探す", async () => {
    const { k, O } = await operator();
    const stewarded = await k.region({ name: "谷中一" });
    const never = await k.region({ name: "谷中二" });
    const resigned = await k.region({ name: "谷中三" });
    await k.steward(stewarded.id);
    const last = await k.steward(resigned.id, "last-steward");
    await k.removeSteward(k.regionRef(resigned.id), last);
    const found = await search(k, O, "谷中");
    const hasSteward = new Map(
      found.items.map((item) => [item.region.id, item.hasSteward]),
    );
    expect([
      hasSteward.get(stewarded.id),
      hasSteward.get(never.id),
      hasSteward.get(resigned.id),
    ]).toEqual([true, false, false]);
  });

  it("searchRegionsForOperation#4 操作する人がサービス運営者。名称にキーワードを含む地域と、名称に含まずキャッチコピー・紹介・所在地のどれかにだけ含む地域がある / キーワードで探す", async () => {
    const { k, O } = await operator();
    const byTagline = await k.region({
      name: "根津",
      tagline: "谷中のとなり",
      description: null,
    });
    const byName = await k.region({ name: "東京谷中", description: null });
    const found = await search(k, O, "谷中");
    expect(found.items.map((item) => item.region.id)).toEqual([
      byName.id,
      byTagline.id,
    ]);
  });

  it("searchRegionsForOperation#5 操作する人がサービス運営者。名称・キャッチコピー・紹介・所在地のどれにもキーワードを含む地域がない / キーワードで探す", async () => {
    const { k, O } = await operator();
    await k.region({ name: "根津" });
    expect(await search(k, O, "谷中")).toEqual({ items: [], count: 0 });
  });

  it("searchRegionsForOperation#6 操作する人がサービス運営者でない（地域運営者、編集担当者を含む） / キーワードで探す", async () => {
    const { k } = await operator();
    const r = await k.region({ name: "谷中" });
    const R = await k.steward(r.id);
    const editor = await k.person("editor");
    await k.editors(editor);
    for (const who of [R, editor]) {
      await expectCode(search(k, who, "谷中"), ForbiddenError);
    }
  });

  it("searchRegionsForOperation#7 操作する人がサービス運営者。地域が登録されている / 空のキーワードと、空白だけのキーワードでそれぞれ探す", async () => {
    const { k, O } = await operator();
    await k.region({ name: "谷中" });
    expect(await search(k, O, "")).toEqual({ items: [], count: 0 });
    expect(await search(k, O, " 　 ")).toEqual({ items: [], count: 0 });
  });
});
