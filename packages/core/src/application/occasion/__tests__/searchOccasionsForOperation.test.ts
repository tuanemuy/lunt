import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import { expectCode } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { searchOccasionsForOperation } from "../searchOccasionsForOperation";
import { occasionKit } from "./kit";

type K = Awaited<ReturnType<typeof occasionKit>>;

const search = (k: K, who: Person, keyword: string) =>
  searchOccasionsForOperation({
    container: k.container,
    actor: who.actor,
    input: { keyword, pagination: { page: 1, limit: 100 } },
  });

describe("searchOccasionsForOperation", () => {
  it("searchOccasionsForOperation#1 操作する人はサービス運営者。名称に「マルシェ」を含むイベントが、公開中・draft・公開の取り下げ中・運営による非公開・中止中・終了の6件ある / 「マルシェ」で探す", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const published = await k.published(o, { name: "公開のマルシェ" });
    const draft = await k.register(o, { name: "下書きのマルシェ" });
    const unpublished = await k.published(o, { name: "取り下げのマルシェ" });
    await k.unpublish(o, unpublished.id);
    const suspended = await k.published(o, { name: "非公開のマルシェ" });
    await k.suspend(o, suspended.id);
    const cancelled = await k.published(o, { name: "中止のマルシェ" });
    await k.cancel(o, cancelled.id);
    const ended = await k.published(o, {
      name: "終了のマルシェ",
      period: { start: "2026-09-01", end: "2026-09-03" },
    });
    const result = await search(k, o, "マルシェ");
    expect(result.count).toBe(6);
    const byId = new Map(result.items.map((item) => [item.id, item]));
    expect(byId.get(published.id)).toMatchObject({
      publication: { status: "published" },
      suspended: false,
      holdingStatus: "upcoming",
    });
    expect(byId.get(draft.id)).toMatchObject({
      publication: { status: "draft" },
      holdingStatus: "upcoming",
    });
    expect(byId.get(unpublished.id)).toMatchObject({
      publication: { status: "unpublished", reason: "byManager" },
    });
    expect(byId.get(suspended.id)).toMatchObject({ suspended: true });
    expect(byId.get(cancelled.id)).toMatchObject({
      holdingStatus: "cancelled",
    });
    expect(byId.get(ended.id)).toMatchObject({ holdingStatus: "ended" });
  });

  it("searchOccasionsForOperation#2 操作する人はサービス運営者。「秋のマルシェ」にはイベント運営者がいて、「春のマルシェ」にはいない / 「マルシェ」で探す", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const autumn = await k.register(o, { name: "秋のマルシェ" });
    const spring = await k.register(o, { name: "春のマルシェ" });
    await k.steward(autumn.id);
    const result = await search(k, o, "マルシェ");
    const byId = new Map(result.items.map((item) => [item.id, item]));
    expect(byId.get(autumn.id)?.hasSteward).toBe(true);
    expect(byId.get(spring.id)?.hasSteward).toBe(false);
  });

  it("searchOccasionsForOperation#3 操作する人はサービス運営者。名称が「マルシェ」「マルシェ広場」「秋のマルシェ」のイベントがある / 「マルシェ」で探す", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const partial = await k.register(o, { name: "秋のマルシェ" });
    const prefix = await k.register(o, { name: "マルシェ広場" });
    const exact = await k.register(o, { name: "マルシェ" });
    const result = await search(k, o, "マルシェ");
    expect(result.items.map((item) => item.id)).toEqual([
      exact.id,
      prefix.id,
      partial.id,
    ]);
  });

  it("searchOccasionsForOperation#4 操作する人はサービス運営者。名称がなく、紹介に「マルシェ」を含む draft のイベントがある / 「マルシェ」で探す", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const { id: unnamed } = await k.register(o, {
      name: null,
      description: "マルシェを開きます",
    });
    const result = await search(k, o, "マルシェ");
    expect(result.items.map((item) => item.id)).toEqual([unnamed]);
    expect(result.items[0]?.name).toBeNull();
  });

  it("searchOccasionsForOperation#5 操作する人はサービス運営者。名称に「マルシェ」を含むイベントと、名称に含まず紹介にだけ含むイベントがある / 「マルシェ」で探す", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const byDescription = await k.register(o, {
      name: "秋祭り",
      description: "マルシェもあります",
    });
    const byName = await k.register(o, { name: "秋のマルシェ" });
    const result = await search(k, o, "マルシェ");
    expect(result.items.map((item) => item.id)).toEqual([
      byName.id,
      byDescription.id,
    ]);
  });

  it("searchOccasionsForOperation#6 操作する人はサービス運営者。キーワードに合うイベントがない / 探す", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    await k.register(o, { name: "秋祭り" });
    expect(await search(k, o, "マルシェ")).toEqual({ items: [], count: 0 });
  });

  it("searchOccasionsForOperation#7 操作する人は、サービス運営者の役割を持たない利用者（イベント運営者を含む） / 探す", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    const occasion = await k.register(o, { name: "秋のマルシェ" });
    const s = await k.steward(occasion.id);
    const stranger = await k.person("stranger");
    for (const who of [s, stranger]) {
      await expectCode(search(k, who, "マルシェ"), ForbiddenError);
    }
  });

  it("searchOccasionsForOperation#8 操作する人はサービス運営者。イベントが登録されている / 空のキーワードと、空白だけのキーワードでそれぞれ探す", async () => {
    const k = await occasionKit();
    const o = await k.operator();
    await k.register(o, { name: "秋のマルシェ" });
    expect(await search(k, o, "")).toEqual({ items: [], count: 0 });
    expect(await search(k, o, "　 ")).toEqual({ items: [], count: 0 });
  });
});
