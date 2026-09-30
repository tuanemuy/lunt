import { describe, expect, it } from "vitest";
import { editorialGuardsRole } from "../editorialView";

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
