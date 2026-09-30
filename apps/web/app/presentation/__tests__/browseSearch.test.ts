import { describe, expect, it } from "vitest";
import {
  browseCriteriaOf,
  browseSearchKey,
  browseSearchOf,
  browseSearchSchema,
  filterHref,
  withoutArea,
  withoutAreas,
  withoutCategory,
} from "../browseSearch";

describe("browseSearch", () => {
  it("reads each code's unit from its length and drops malformed and repeated ones", () => {
    const search = browseSearchSchema.parse({
      area: "13,13101,1010001,99,13101,abc",
      cat: "c1,c1,bad id,c2",
    });
    expect(browseCriteriaOf(search)).toEqual({
      areas: [
        { unit: "prefecture", prefectureCode: "13" },
        { unit: "municipality", municipalityCode: "13101" },
        { unit: "area", areaCode: "1010001" },
      ],
      categoryIds: ["c1", "c2"],
    });
  });

  it("accepts the number the router parses a bare code into, and never errors", () => {
    expect(browseSearchSchema.parse({ area: 13101 })).toEqual({
      area: "13101",
    });
    expect(browseSearchSchema.parse({ area: { x: 1 }, cat: [] })).toEqual({});
  });

  it("removes one condition, the areas, or everything", () => {
    const search = { area: "13101,27", cat: "c1,c2" };
    expect(withoutArea(search, "27")).toEqual({ area: "13101", cat: "c1,c2" });
    expect(withoutCategory(search, "c1")).toEqual({
      area: "13101,27",
      cat: "c2",
    });
    expect(withoutAreas(search)).toEqual({ cat: "c1,c2" });
    expect(browseSearchOf({ areas: [], categoryIds: [] })).toEqual({});
  });

  it("keys equal conditions alike and builds VW-02's URL", () => {
    expect(browseSearchKey({ area: "13101,13101" })).toBe(
      browseSearchKey({ area: "13101" }),
    );
    expect(filterHref("regions", { area: "13101", cat: "c1" })).toBe(
      "/filter?from=regions&area=13101&cat=c1",
    );
  });
});
