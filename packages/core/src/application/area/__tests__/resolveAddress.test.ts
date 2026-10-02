import { createTestAreaCatalog } from "@repo/core/adapters/staticAssets/testing/testAreaMaster";
import { TownRef } from "@repo/core/domain/area/townRef";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { resolveAddress } from "../resolveAddress";

const ref = (areaCode: string, municipalityCode: string, name: string) =>
  TownRef.create({ areaCode, municipalityCode, name });

describe("resolveAddress (the path from a picked town to an Address)", () => {
  it("builds the address of the resolved town and the trimmed rest", async () => {
    expect(
      await resolveAddress(
        createTestAreaCatalog(),
        ref("9990001", "27127", "甲町"),
        " 1-2-3 ",
      ),
    ).toEqual({
      areaCode: "9990001",
      prefecture: "大阪府",
      municipality: "大阪市北区",
      town: "甲町",
      rest: "1-2-3",
    });
  });

  it("gives an empty town for the whole-municipality town", async () => {
    const address = await resolveAddress(
      createTestAreaCatalog(),
      ref("1000000", "13101", ""),
      "永田町1-7-1",
    );
    expect(address).toMatchObject({ town: "", rest: "永田町1-7-1" });
  });

  it("refuses a town the master lacks with AREA_TOWN_NOT_FOUND", async () => {
    const error = await resolveAddress(
      createTestAreaCatalog(),
      ref("1040061", "13101", "銀座"),
      "",
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error).toMatchObject({ code: "AREA_TOWN_NOT_FOUND" });
  });
});
