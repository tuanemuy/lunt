import { describe, expect, it } from "vitest";
import { createTestContainer } from "../../__tests__/testContainer";
import {
  type BrowseAreaHierarchyInput,
  browseAreaHierarchy,
} from "../browseAreaHierarchy";

const browse = (input: BrowseAreaHierarchyInput) =>
  browseAreaHierarchy({ container: createTestContainer().container, input });

describe("browseAreaHierarchy", () => {
  it("browseAreaHierarchy#1 テスト用のマスター。ログインしていない / 都道府県の一覧を読む", async () => {
    expect(await browse({ level: "prefectures" })).toEqual({
      level: "prefectures",
      prefectures: [
        { code: "13", name: "東京都" },
        { code: "27", name: "大阪府" },
      ],
    });
  });

  it("browseAreaHierarchy#2 テスト用のマスター / 都道府県 13 の市区町村の一覧を読む", async () => {
    expect(
      await browse({ level: "municipalities", prefectureCode: "13" }),
    ).toEqual({
      level: "municipalities",
      municipalities: [
        { code: "13101", prefectureCode: "13", name: "千代田区" },
        { code: "13102", prefectureCode: "13", name: "中央区" },
      ],
    });
  });

  it("browseAreaHierarchy#3 テスト用のマスター / 市区町村 13101 の町域の一覧を読む", async () => {
    const town = (areaCode: string, name: string, label: string) => ({
      areaCode,
      prefectureCode: "13",
      prefectureName: "東京都",
      municipalityCode: "13101",
      municipalityName: "千代田区",
      name,
      label,
    });
    expect(await browse({ level: "towns", municipalityCode: "13101" })).toEqual(
      {
        level: "towns",
        towns: [
          town("1000000", "", "100-0000 東京都千代田区"),
          town("1000004", "大手町", "100-0004 東京都千代田区大手町"),
          town("1000001", "千代田", "100-0001 東京都千代田区千代田"),
        ],
      },
    );
  });

  it("browseAreaHierarchy#4 テスト用のマスター / 市区町村 27127 の町域の一覧を読む", async () => {
    const result = await browse({ level: "towns", municipalityCode: "27127" });
    const towns = result.level === "towns" ? result.towns : [];
    const sameArea = towns.filter((town) => town.areaCode === "9990001");
    expect(sameArea.map((town) => town.name)).toEqual(["乙町", "甲町"]);
    expect(sameArea.map((town) => town.label)).toEqual([
      "999-0001 大阪府大阪市北区乙町",
      "999-0001 大阪府大阪市北区甲町",
    ]);
  });

  it("browseAreaHierarchy#5 テスト用のマスター / マスターにない都道府県 47 の市区町村の一覧を読む", async () => {
    expect(
      await browse({ level: "municipalities", prefectureCode: "47" }),
    ).toEqual({ level: "municipalities", municipalities: [] });
  });

  it("browseAreaHierarchy#6 テスト用のマスター / マスターにない市区町村 13103 の町域の一覧を読む", async () => {
    expect(await browse({ level: "towns", municipalityCode: "13103" })).toEqual(
      {
        level: "towns",
        towns: [],
      },
    );
  });

  it("refuses codes in the wrong format", async () => {
    await expect(
      browse({ level: "municipalities", prefectureCode: "48" }),
    ).rejects.toMatchObject({ code: "AREA_INVALID_PREFECTURE_CODE" });
    await expect(
      browse({ level: "towns", municipalityCode: "131" }),
    ).rejects.toMatchObject({ code: "AREA_INVALID_MUNICIPALITY_CODE" });
  });
});
