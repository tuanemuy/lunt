import type { ListingId } from "@repo/core/domain/common/ids";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError } from "../../errors";
import { searchListingsForOperation } from "../searchListingsForOperation";
import { type ListingKit, listingKit } from "./kit";

const searcher = (k: ListingKit) => (who: Person, keyword: string) =>
  searchListingsForOperation({
    container: k.container,
    actor: who.actor,
    input: { keyword, pagination: { page: 1, limit: 20 } },
  });

const ids = (items: readonly { id: ListingId }[]) => items.map((i) => i.id);

describe("searchListingsForOperation", () => {
  it("searchListingsForOperation#1 名称に「りんご」を含む掲載が、公開中、下書き、一時非公開、運営による非公開、非公開の店舗の掲載に1件ずつある。操作する人はサービス運営者 / 「りんご」で探す", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const a = await k.place("山田商店");
    const m = await k.manager(a);
    const hiddenPlace = await k.place("閉じた店舗");
    const spec = { name: "りんご" };
    const published = (await k.published(m, a, spec)).id;
    const draft = (await k.draft(m, a, spec)).id;
    const unpublished = (await k.published(m, a, spec)).id;
    await k.unpublish(m, unpublished);
    const suspended = (await k.published(m, a, spec)).id;
    await k.suspend(op, suspended);
    const ofHiddenPlace = (await k.published(op, hiddenPlace, spec)).id;
    await k.suspendPlace(hiddenPlace);
    const result = await searcher(k)(op, "りんご");
    expect([...ids(result.items)].sort()).toEqual(
      [published, draft, unpublished, suspended, ofHiddenPlace].sort(),
    );
    expect(result.count).toBe(5);
    const item = (id: ListingId) => result.items.find((i) => i.id === id);
    expect(item(published)).toMatchObject({
      place: { id: a, name: "山田商店", suspended: false },
      hasSteward: true,
      publication: { status: "published" },
      suspended: false,
      offeringStatus: { phase: "available" },
    });
    expect(item(ofHiddenPlace)).toMatchObject({
      place: { name: "閉じた店舗", suspended: true },
      hasSteward: false,
    });
    expect(item(suspended)?.suspended).toBe(true);
    expect(item(unpublished)?.publication.status).toBe("unpublished");
    expect(item(draft)?.publication.status).toBe("draft");
  });

  it("searchListingsForOperation#2 名称に「りんご」を含む掲載と、説明にだけ「りんご」を含む掲載がある / 「りんご」で探す", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const a = await k.place();
    const inDescription = (
      await k.draft(op, a, { name: "ジャム", description: "りんごの" })
    ).id;
    const inName = (await k.draft(op, a, { name: "青森のりんご" })).id;
    expect(ids((await searcher(k)(op, "りんご")).items)).toEqual([
      inName,
      inDescription,
    ]);
  });

  it("searchListingsForOperation#3 名称が「青森のりんごジュース」の掲載 X と、名称が「りんご」で説明に「ジュースにも使える」とある掲載 Y と、名称が「りんご飴」の掲載 Z がある / 「ジュース りんご」で探す", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const a = await k.place();
    const x = (await k.draft(op, a, { name: "青森のりんごジュース" })).id;
    const y = (
      await k.draft(op, a, {
        name: "りんご",
        description: "ジュースにも使える",
      })
    ).id;
    await k.draft(op, a, { name: "りんご飴" });
    expect(
      [...ids((await searcher(k)(op, "ジュース りんご")).items)].sort(),
    ).toEqual([x, y].sort());
  });

  it("searchListingsForOperation#4 名称が「りんご」の掲載、「りんご飴」の掲載、「青森のりんご」の掲載、説明にだけ「りんご」を含む掲載がある / 「りんご」で探す", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const a = await k.place();
    const onlyDescription = (
      await k.draft(op, a, { name: "ジャム", description: "りんごの" })
    ).id;
    const contains = (await k.draft(op, a, { name: "青森のりんご" })).id;
    const startsWith = (await k.draft(op, a, { name: "りんご飴" })).id;
    const equals = (await k.draft(op, a, { name: "りんご" })).id;
    expect(ids((await searcher(k)(op, "りんご")).items)).toEqual([
      equals,
      startsWith,
      contains,
      onlyDescription,
    ]);
  });

  it("searchListingsForOperation#5 掲載がある / 空のキーワード、または空白だけのキーワードで探す", async () => {
    const k = await listingKit();
    const op = await k.operator();
    await k.draft(op, await k.place(), { name: "りんご" });
    for (const keyword of ["", "   ", "　"]) {
      expect(await searcher(k)(op, keyword)).toEqual({ items: [], count: 0 });
    }
  });

  it("searchListingsForOperation#6 キーワードを含む掲載がない / 探す", async () => {
    const k = await listingKit();
    const op = await k.operator();
    await k.draft(op, await k.place(), { name: "みかん" });
    expect(await searcher(k)(op, "りんご")).toEqual({ items: [], count: 0 });
  });

  it("searchListingsForOperation#7 名称に「りんご」を含む掲載が削除されている / 「りんご」で探す", async () => {
    const k = await listingKit();
    const op = await k.operator();
    const a = await k.place();
    const deleted = (await k.draft(op, a, { name: "りんご" })).id;
    const kept = (await k.draft(op, a, { name: "りんご飴" })).id;
    await k.remove(op, deleted);
    expect(ids((await searcher(k)(op, "りんご")).items)).toEqual([kept]);
  });

  it("searchListingsForOperation#8 操作する人は店舗管理者で、サービス運営者の役割を持たない / 探す", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    await k.draft(m, a, { name: "りんご" });
    await expectCode(searcher(k)(m, "りんご"), ForbiddenError);
  });

  it("a non-operator is refused before the keyword and pagination are looked at", async () => {
    const k = await listingKit();
    const a = await k.place();
    const m = await k.manager(a);
    await expectCode(
      searchListingsForOperation({
        container: k.container,
        actor: m.actor,
        input: { keyword: "り".repeat(101), pagination: { page: 0, limit: 0 } },
      }),
      ForbiddenError,
    );
  });

  it("a pagination out of bounds is COMMON_INVALID_INPUT", async () => {
    const k = await listingKit();
    const op = await k.operator();
    for (const pagination of [
      { page: 0, limit: 20 },
      { page: 1, limit: 101 },
    ]) {
      await expectCode(
        searchListingsForOperation({
          container: k.container,
          actor: op.actor,
          input: { keyword: "りんご", pagination },
        }),
        BusinessRuleError,
        "COMMON_INVALID_INPUT",
      );
    }
  });
});
