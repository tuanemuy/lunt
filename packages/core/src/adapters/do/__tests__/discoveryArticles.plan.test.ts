import { describe, expect, it } from "vitest";
import type { SqlRow } from "../sql";
import { DISCOVERY_ARTICLE_PLANS } from "../store/discoveryArticles";
import { createNodeHarness } from "../testing/nodeHarness";

type PlanRow = Readonly<{ detail: string }> & SqlRow;

/** `EXPLAIN QUERY PLAN` details of `statement` on the migrated schema. */
function planOf(statement: string, bindings: number): readonly string[] {
  const { sql } = createNodeHarness().state.storage;
  return sql
    .exec<PlanRow>(
      `EXPLAIN QUERY PLAN ${statement}`,
      ...Array.from({ length: bindings }, () => "x"),
    )
    .toArray()
    .map((row) => row.detail);
}

// The planner has no statistics (ANALYZE never runs), so these pin the
// index each read starts from: a regression shows here, not at scale.
describe("Discovery's article read plans", () => {
  it("the published list walks idx_articles_published in order, without sorting", () => {
    const plan = planOf(DISCOVERY_ARTICLE_PLANS.publishedIds, 2);
    expect(plan.join("\n")).toContain("idx_articles_published");
    expect(plan.join("\n")).not.toContain("TEMP B-TREE");
    expect(
      planOf(DISCOVERY_ARTICLE_PLANS.publishedCount, 0).join("\n"),
    ).toContain("idx_articles_published");
  });

  it("a target's articles start from idx_article_showcases_target", () => {
    for (const [statement, bindings] of [
      [DISCOVERY_ARTICLE_PLANS.showcasingIds, 4],
      [DISCOVERY_ARTICLE_PLANS.showcasingCount, 2],
    ] as const) {
      const [first] = planOf(statement, bindings);
      expect(first).toContain("idx_article_showcases_target");
    }
  });
});
