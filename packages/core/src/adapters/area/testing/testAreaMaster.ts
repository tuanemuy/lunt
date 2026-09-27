import { AssetAreaCatalog } from "../assetAreaCatalog";
import type { AreaMasterRow } from "../assetFormat";
import { InMemoryAreaAssets } from "./inMemoryAreaAssets";

const tokyo = { prefectureCode: "13", prefectureName: "東京都" } as const;
const osaka = { prefectureCode: "27", prefectureName: "大阪府" } as const;
const chiyoda = {
  ...tokyo,
  municipalityCode: "13101",
  municipalityName: "千代田区",
} as const;
const chuo = {
  ...tokyo,
  municipalityCode: "13102",
  municipalityName: "中央区",
} as const;
const kita = {
  ...osaka,
  municipalityCode: "27127",
  municipalityName: "大阪市北区",
} as const;

/**
 * 「テスト用のマスター」 of `spec/testcases/ports/areaCatalog.md`, T1–T10
 * in table order. Not real postal data: it pins down orderings and the
 * many-towns-per-area cases. Absent on purpose: postal code 1008111 (a
 * business-specific code), prefecture 47, municipalities 13103 and 47201.
 */
export const TEST_AREA_MASTER: readonly AreaMasterRow[] = [
  { ...chiyoda, areaCode: "1000000", name: "", kana: "" },
  { ...chiyoda, areaCode: "1000004", name: "大手町", kana: "オオテマチ" },
  { ...chiyoda, areaCode: "1000001", name: "千代田", kana: "チヨダ" },
  { ...chuo, areaCode: "1040061", name: "銀座", kana: "ギンザ" },
  { ...kita, areaCode: "5300001", name: "梅田", kana: "ウメダ" },
  { ...kita, areaCode: "9990001", name: "甲町", kana: "コウマチ" },
  { ...kita, areaCode: "9990001", name: "乙町", kana: "オツマチ" },
  { ...kita, areaCode: "9990003", name: "みどり", kana: "ミドリ" },
  { ...kita, areaCode: "9990002", name: "みどり東", kana: "ミドリ" },
  { ...kita, areaCode: "9990002", name: "あさひ", kana: "ミドリ" },
];

/** The base path the test master's asset files live under. */
export const TEST_AREA_MASTER_BASE_PATH = "/area";

/**
 * The production adapter over the test master's files held in memory,
 * with a cache of its own — what usecase tests and the Node conformance
 * run use.
 */
export function createTestAreaCatalog(): AssetAreaCatalog {
  return new AssetAreaCatalog(
    InMemoryAreaAssets.fromRows(TEST_AREA_MASTER, TEST_AREA_MASTER_BASE_PATH),
    { basePaths: [TEST_AREA_MASTER_BASE_PATH] },
  );
}
