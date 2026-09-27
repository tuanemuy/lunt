import { Address } from "@repo/core/domain/common/address";
import { AreaCode } from "@repo/core/domain/common/areaCode";
import { describe, expect, it } from "vitest";

const locality = {
  areaCode: AreaCode.create("1500001"),
  prefecture: "東京都",
  municipality: "渋谷区",
  town: "神宮前",
};

describe("Address", () => {
  it("of keeps the town's locality and trims rest", () => {
    const address = Address.of(locality, "  1-2-3 ルントビル ");
    expect(address).toEqual({ ...locality, rest: "1-2-3 ルントビル" });
  });

  it("rest may be empty", () => {
    expect(Address.of(locality, "   ").rest).toBe("");
  });

  it("text joins prefecture, municipality, town, rest in order with no separator", () => {
    expect(Address.text(Address.of(locality, "1-2-3"))).toBe(
      "東京都渋谷区神宮前1-2-3",
    );
  });

  it("text of a town with an empty name is prefecture + municipality + rest", () => {
    expect(
      Address.text(Address.of({ ...locality, town: "" }, "神宮前1-2-3")),
    ).toBe("東京都渋谷区神宮前1-2-3");
  });

  it("equals compares every component", () => {
    const a = Address.of(locality, "1-2-3");
    expect(Address.equals(a, Address.of(locality, " 1-2-3 "))).toBe(true);
    expect(Address.equals(a, Address.of(locality, "1-2-4"))).toBe(false);
    expect(
      Address.equals(a, Address.of({ ...locality, town: "千駄ヶ谷" }, "1-2-3")),
    ).toBe(false);
  });
});
