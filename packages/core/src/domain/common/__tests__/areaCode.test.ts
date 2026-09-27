import { AreaCode } from "@repo/core/domain/common/areaCode";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

const CODE = "COMMON_INVALID_AREA_CODE";

describe("AreaCode.create (7 digits, format only, no normalisation)", () => {
  it("accepts 7 ASCII digits as is", () => {
    expect(AreaCode.create("1000001")).toBe("1000001");
    expect(AreaCode.create("0600000")).toBe("0600000");
  });

  it.each([
    ["6 digits", "100000"],
    ["8 digits", "10000011"],
    ["hyphenated (normalising is PostalCode's job)", "100-0001"],
    ["full-width digits", "１０００００１"],
    ["surrounding whitespace", " 1000001"],
    ["letters", "100000a"],
    ["empty", ""],
  ])("rejects %s", (_label, input) => {
    expectBusinessError(() => AreaCode.create(input), CODE);
  });

  it("accepts every 7-digit string", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{7}$/), (s) => {
        expect(AreaCode.create(s)).toBe(s);
      }),
    );
  });
});
