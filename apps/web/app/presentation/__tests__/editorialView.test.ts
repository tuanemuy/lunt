import { describe, expect, it } from "vitest";
import {
  type ArticleFormValues,
  editorialGuardsRole,
  type ShowcaseItem,
  toArticleContent,
  withCurrentShowcases,
} from "../editorialView";

describe("editorialGuardsRole", () => {
  it("guards AM-01 and AM-02 新規 with the area's role check", () => {
    expect(editorialGuardsRole("/editorial")).toBe(true);
    expect(editorialGuardsRole("/editorial/")).toBe(true);
    expect(editorialGuardsRole("/editorial/articles/new")).toBe(true);
  });

  it("leaves an article's AM-02 and CM-03 to their read, so a missing article is CS-17", () => {
    expect(editorialGuardsRole("/editorial/articles/a1")).toBe(false);
    expect(editorialGuardsRole("/editorial/articles/a1/preview")).toBe(false);
  });
});

const viewable = (id: string, stateText: string): ShowcaseItem => ({
  kind: "listing",
  id,
  name: `listing ${id}`,
  viewable: true,
  stateText,
  badge: null,
  note: null,
  row: { meta: null, area: null },
  photoUrl: null,
});

describe("withCurrentShowcases", () => {
  const values: ArticleFormValues = {
    photos: [],
    title: "t",
    body: "b",
    showcases: [viewable("l2", "提供中"), viewable("l1", "提供中")],
  };

  it("shows each linked showcase as the latest copy does, in the form's order", () => {
    const hidden: ShowcaseItem = { kind: "listing", id: "l1", viewable: false };
    const shown = withCurrentShowcases(values, [
      hidden,
      viewable("l2", "休業"),
    ]);
    expect(shown.showcases).toEqual([viewable("l2", "休業"), hidden]);
    expect(toArticleContent(shown)).toEqual(toArticleContent(values));
  });

  it("keeps a showcase picked since the last save as its candidate row", () => {
    const shown = withCurrentShowcases(values, [viewable("l2", "休業")]);
    expect(shown.showcases[1]).toEqual(viewable("l1", "提供中"));
  });
});
