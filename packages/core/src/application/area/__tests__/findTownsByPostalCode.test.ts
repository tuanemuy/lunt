import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { createTestContainer } from "../../__tests__/testContainer";
import { findTownsByPostalCode } from "../findTownsByPostalCode";

const find = (postalCode: string) =>
  findTownsByPostalCode({
    container: createTestContainer().container,
    input: { postalCode },
  });

describe("findTownsByPostalCode", () => {
  it("findTownsByPostalCode#1 テスト用のマスター。ログインしていない / 郵便番号「1040061」で町域の候補を引く", async () => {
    expect(await find("1040061")).toEqual([
      {
        areaCode: "1040061",
        prefectureCode: "13",
        prefectureName: "東京都",
        municipalityCode: "13102",
        municipalityName: "中央区",
        name: "銀座",
        label: "104-0061 東京都中央区銀座",
      },
    ]);
  });

  it("findTownsByPostalCode#2 テスト用のマスター / 郵便番号「１０４－００６１」（全角の数字とハイフン）で町域の候補を引く", async () => {
    expect(await find("１０４－００６１")).toEqual(await find("1040061"));
  });

  it("findTownsByPostalCode#3 テスト用のマスター / 複数の町域が対応する郵便番号「9990001」で町域の候補を引く", async () => {
    const towns = await find("9990001");
    expect(towns.map((town) => [town.name, town.areaCode])).toEqual([
      ["乙町", "9990001"],
      ["甲町", "9990001"],
    ]);
  });

  it("findTownsByPostalCode#4 テスト用のマスター / 市区町村の全域を指す郵便番号「1000000」で町域の候補を引く", async () => {
    const towns = await find("1000000");
    expect(towns).toHaveLength(1);
    expect(towns[0]).toMatchObject({
      name: "",
      prefectureName: "東京都",
      municipalityName: "千代田区",
      label: "100-0000 東京都千代田区",
    });
  });

  it("findTownsByPostalCode#5 テスト用のマスター / 事業所固有の郵便番号「1008111」で町域の候補を引く", async () => {
    const error = await find("1008111").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error).toMatchObject({ code: "AREA_TOWN_NOT_FOUND" });
  });

  it("findTownsByPostalCode#6 テスト用のマスター / 7桁の数字にならない「10400」で町域の候補を引く", async () => {
    const error = await find("10400").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error).toMatchObject({ code: "AREA_INVALID_POSTAL_CODE" });
  });
});
