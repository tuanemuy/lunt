import type { AreaSelectionInput } from "@repo/core/domain/area/areaSelection";
import { describe, expect, it } from "vitest";
import { createTestContainer } from "../../__tests__/testContainer";
import { labelAreaSelections } from "../labelAreaSelections";

const label = (selections: readonly AreaSelectionInput[]) =>
  labelAreaSelections({
    container: createTestContainer().container,
    input: { selections },
  });

const prefecture13 = { unit: "prefecture", prefectureCode: "13" } as const;
const area1040061 = { unit: "area", areaCode: "1040061" } as const;

describe("labelAreaSelections", () => {
  it("labelAreaSelections#1 テスト用のマスター。ログインしていない / 都道府県 13、市区町村 27127、エリア 1040061 の選択（単位の異なる選択）の表示名を引く", async () => {
    expect(
      await label([
        prefecture13,
        { unit: "municipality", municipalityCode: "27127" },
        area1040061,
      ]),
    ).toEqual([
      { selection: prefecture13, label: "東京都" },
      {
        selection: { unit: "municipality", municipalityCode: "27127" },
        label: "大阪府大阪市北区",
      },
      { selection: area1040061, label: "104-0061 東京都中央区銀座" },
    ]);
  });

  it("labelAreaSelections#2 テスト用のマスター / 同じエリアに複数の町域があるエリア 9990001 の選択の表示名を引く", async () => {
    expect(await label([{ unit: "area", areaCode: "9990001" }])).toEqual([
      {
        selection: { unit: "area", areaCode: "9990001" },
        label: "999-0001 大阪府大阪市北区乙町",
      },
    ]);
  });

  it("labelAreaSelections#3 テスト用のマスター / 都道府県 13、エリア 1040061、都道府県 13（等価な選択の重なり）の表示名を引く", async () => {
    const labels = await label([prefecture13, area1040061, prefecture13]);
    expect(labels.map((entry) => entry.selection)).toEqual([
      prefecture13,
      area1040061,
    ]);
  });

  it("labelAreaSelections#4 テスト用のマスター / 都道府県 13 と、マスターにないエリア 1008111 の選択の表示名を引く", async () => {
    expect(
      await label([prefecture13, { unit: "area", areaCode: "1008111" }]),
    ).toEqual([{ selection: prefecture13, label: "東京都" }]);
  });

  it("labelAreaSelections#5 テスト用のマスター / 空の選択の表示名を引く", async () => {
    expect(await label([])).toEqual([]);
  });

  it("refuses a selection with a code in the wrong format", async () => {
    await expect(
      label([{ unit: "area", areaCode: "104-0061" }]),
    ).rejects.toMatchObject({ code: "COMMON_INVALID_AREA_CODE" });
  });
});
