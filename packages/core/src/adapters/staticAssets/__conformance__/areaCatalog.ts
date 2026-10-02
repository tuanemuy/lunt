import {
  AreaSelection,
  type AreaSelectionInput,
} from "@repo/core/domain/area/areaSelection";
import { MunicipalityCode, PrefectureCode } from "@repo/core/domain/area/codes";
import type { AreaCatalog } from "@repo/core/domain/area/ports/areaCatalog";
import { PostalCode } from "@repo/core/domain/area/postalCode";
import type { Town } from "@repo/core/domain/area/town";
import { TownRef } from "@repo/core/domain/area/townRef";
import { describe, expect, it } from "vitest";
import { TEST_AREA_MASTER } from "../testing/testAreaMaster";

/** A fresh catalog over 「テスト用のマスター」 (`TEST_AREA_MASTER`). */
export type AreaCatalogFactory = () => Promise<AreaCatalog>;

// T1…T10 by their identifying triple, as the spec table names them.
const TOWN_IDS = new Map(
  TEST_AREA_MASTER.map((row, i) => [
    `${row.areaCode}|${row.municipalityCode}|${row.name}`,
    `T${i + 1}`,
  ]),
);

const ids = (towns: readonly Town[]): readonly string[] =>
  towns.map(
    (town) =>
      TOWN_IDS.get(`${town.areaCode}|${town.municipality.code}|${town.name}`) ??
      `unknown ${town.areaCode} ${town.name}`,
  );

const selections = (
  inputs: readonly AreaSelectionInput[],
): readonly AreaSelection[] => inputs.map(AreaSelection.create);

const ref = (areaCode: string, municipalityCode: string, name: string) =>
  TownRef.create({ areaCode, municipalityCode, name });

const sorted = (codes: ReadonlySet<string>): readonly string[] =>
  [...codes].sort();

/**
 * `spec/testcases/ports/areaCatalog.md`, over any backend of the asset
 * files: in memory (Node) or the Workers static-assets binding.
 */
export function describeAreaCatalogContract(
  name: string,
  makeCatalog: AreaCatalogFactory,
): void {
  describe(`AreaCatalog contract (${name})`, () => {
    describe("ケース", () => {
      it("areaCatalog#1 テスト用のマスター / listPrefectures()", async () => {
        const catalog = await makeCatalog();
        expect(await catalog.listPrefectures()).toEqual([
          { code: "13", name: "東京都" },
          { code: "27", name: "大阪府" },
        ]);
      });

      it('areaCatalog#2 テスト用のマスター / listMunicipalities("13")', async () => {
        const catalog = await makeCatalog();
        expect(
          await catalog.listMunicipalities(PrefectureCode.create("13")),
        ).toEqual([
          { code: "13101", prefectureCode: "13", name: "千代田区" },
          { code: "13102", prefectureCode: "13", name: "中央区" },
        ]);
      });

      it('areaCatalog#3 テスト用のマスター / listMunicipalities("27")', async () => {
        const catalog = await makeCatalog();
        expect(
          await catalog.listMunicipalities(PrefectureCode.create("27")),
        ).toEqual([
          { code: "27127", prefectureCode: "27", name: "大阪市北区" },
        ]);
      });

      it('areaCatalog#4 テスト用のマスター / listMunicipalities("47")（マスターにない都道府県）', async () => {
        const catalog = await makeCatalog();
        expect(
          await catalog.listMunicipalities(PrefectureCode.create("47")),
        ).toEqual([]);
      });

      it('areaCatalog#5 テスト用のマスター / listTowns("13101")', async () => {
        const catalog = await makeCatalog();
        const towns = await catalog.listTowns(MunicipalityCode.create("13101"));
        expect(ids(towns)).toEqual(["T1", "T2", "T3"]);
        expect(towns[0]?.name).toBe("");
        for (const town of towns) {
          expect(town.prefecture).toEqual({ code: "13", name: "東京都" });
          expect(town.municipality).toEqual({
            code: "13101",
            prefectureCode: "13",
            name: "千代田区",
          });
        }
        expect(towns[1]).toMatchObject({
          areaCode: "1000004",
          name: "大手町",
          kana: "オオテマチ",
        });
      });

      it('areaCatalog#6 テスト用のマスター / listTowns("27127")', async () => {
        const catalog = await makeCatalog();
        const towns = await catalog.listTowns(MunicipalityCode.create("27127"));
        expect(ids(towns)).toEqual(["T5", "T7", "T6", "T10", "T9", "T8"]);
      });

      it('areaCatalog#7 テスト用のマスター / listTowns("13102")', async () => {
        const catalog = await makeCatalog();
        expect(
          ids(await catalog.listTowns(MunicipalityCode.create("13102"))),
        ).toEqual(["T4"]);
      });

      it('areaCatalog#8 テスト用のマスター / listTowns("13103")（マスターにない市区町村）', async () => {
        const catalog = await makeCatalog();
        expect(
          await catalog.listTowns(MunicipalityCode.create("13103")),
        ).toEqual([]);
      });

      it('areaCatalog#9 テスト用のマスター / findTownsByPostalCode("1040061")', async () => {
        const catalog = await makeCatalog();
        const towns = await catalog.findTownsByPostalCode(
          PostalCode.create("1040061"),
        );
        expect(ids(towns)).toEqual(["T4"]);
        expect(towns[0]?.areaCode).toBe("1040061");
      });

      it('areaCatalog#10 テスト用のマスター / findTownsByPostalCode("9990001")（複数の町域が対応する郵便番号）', async () => {
        const catalog = await makeCatalog();
        expect(
          ids(
            await catalog.findTownsByPostalCode(PostalCode.create("9990001")),
          ),
        ).toEqual(["T7", "T6"]);
      });

      it('areaCatalog#11 テスト用のマスター / findTownsByPostalCode("1000000")（市区町村の全域を指す郵便番号）', async () => {
        const catalog = await makeCatalog();
        const towns = await catalog.findTownsByPostalCode(
          PostalCode.create("1000000"),
        );
        expect(ids(towns)).toEqual(["T1"]);
        expect(towns[0]?.name).toBe("");
      });

      it('areaCatalog#12 テスト用のマスター / findTownsByPostalCode("1008111")（事業所固有の郵便番号）', async () => {
        const catalog = await makeCatalog();
        expect(
          await catalog.findTownsByPostalCode(PostalCode.create("1008111")),
        ).toEqual([]);
      });

      it('areaCatalog#13 テスト用のマスター / findTownsByPostalCode("0000000")（どの町域にも対応しない郵便番号）', async () => {
        const catalog = await makeCatalog();
        expect(
          await catalog.findTownsByPostalCode(PostalCode.create("0000000")),
        ).toEqual([]);
      });

      it('areaCatalog#14 テスト用のマスター / findTown({ areaCode: "9990001", municipalityCode: "27127", name: "甲町" })', async () => {
        const catalog = await makeCatalog();
        const town = await catalog.findTown(ref("9990001", "27127", "甲町"));
        expect(town === null ? null : ids([town])).toEqual(["T6"]);
      });

      it('areaCatalog#15 テスト用のマスター / findTown({ areaCode: "1000000", municipalityCode: "13101", name: "" })', async () => {
        const catalog = await makeCatalog();
        const town = await catalog.findTown(ref("1000000", "13101", ""));
        expect(town === null ? null : ids([town])).toEqual(["T1"]);
      });

      it('areaCatalog#16 テスト用のマスター / findTown({ areaCode: "9990001", municipalityCode: "27127", name: "丙町" })（name だけが一致しない）', async () => {
        const catalog = await makeCatalog();
        expect(await catalog.findTown(ref("9990001", "27127", "丙町"))).toBe(
          null,
        );
      });

      it('areaCatalog#17 テスト用のマスター / findTown({ areaCode: "1040061", municipalityCode: "13101", name: "銀座" })（municipalityCode だけが一致しない）', async () => {
        const catalog = await makeCatalog();
        expect(await catalog.findTown(ref("1040061", "13101", "銀座"))).toBe(
          null,
        );
      });

      it('areaCatalog#18 テスト用のマスター / findTown({ areaCode: "1000004", municipalityCode: "13101", name: "千代田" })（areaCode だけが一致しない）', async () => {
        const catalog = await makeCatalog();
        expect(await catalog.findTown(ref("1000004", "13101", "千代田"))).toBe(
          null,
        );
      });

      it("areaCatalog#19 テスト用のマスター / expand([])", async () => {
        const catalog = await makeCatalog();
        expect((await catalog.expand([])).size).toBe(0);
      });

      it('areaCatalog#20 テスト用のマスター / expand([{ unit: "prefecture", prefectureCode: "13" }])', async () => {
        const catalog = await makeCatalog();
        const codes = await catalog.expand(
          selections([{ unit: "prefecture", prefectureCode: "13" }]),
        );
        expect(sorted(codes)).toEqual([
          "1000000",
          "1000001",
          "1000004",
          "1040061",
        ]);
      });

      it('areaCatalog#21 テスト用のマスター / expand([{ unit: "municipality", municipalityCode: "27127" }])', async () => {
        const catalog = await makeCatalog();
        const codes = await catalog.expand(
          selections([{ unit: "municipality", municipalityCode: "27127" }]),
        );
        expect(sorted(codes)).toEqual([
          "5300001",
          "9990001",
          "9990002",
          "9990003",
        ]);
      });

      it('areaCatalog#22 テスト用のマスター / expand([{ unit: "area", areaCode: "1040061" }])', async () => {
        const catalog = await makeCatalog();
        const codes = await catalog.expand(
          selections([{ unit: "area", areaCode: "1040061" }]),
        );
        expect(sorted(codes)).toEqual(["1040061"]);
      });

      it('areaCatalog#23 テスト用のマスター / expand([{ unit: "area", areaCode: "1008111" }])（マスターにない値）', async () => {
        const catalog = await makeCatalog();
        const codes = await catalog.expand(
          selections([{ unit: "area", areaCode: "1008111" }]),
        );
        expect(codes.size).toBe(0);
      });

      it('areaCatalog#24 テスト用のマスター / expand([{ unit: "prefecture", prefectureCode: "47" }, { unit: "municipality", municipalityCode: "47201" }])（マスターにないコード）', async () => {
        const catalog = await makeCatalog();
        const codes = await catalog.expand(
          selections([
            { unit: "prefecture", prefectureCode: "47" },
            { unit: "municipality", municipalityCode: "47201" },
          ]),
        );
        expect(codes.size).toBe(0);
      });

      it('areaCatalog#25 テスト用のマスター / expand([{ unit: "municipality", municipalityCode: "13102" }, { unit: "area", areaCode: "5300001" }])（単位の異なる選択）', async () => {
        const catalog = await makeCatalog();
        const codes = await catalog.expand(
          selections([
            { unit: "municipality", municipalityCode: "13102" },
            { unit: "area", areaCode: "5300001" },
          ]),
        );
        expect(sorted(codes)).toEqual(["1040061", "5300001"]);
      });

      it('areaCatalog#26 テスト用のマスター / expand([{ unit: "prefecture", prefectureCode: "13" }, { unit: "area", areaCode: "1000004" }])（広い単位の選択に含まれる狭い単位の選択）', async () => {
        const catalog = await makeCatalog();
        const both = await catalog.expand(
          selections([
            { unit: "prefecture", prefectureCode: "13" },
            { unit: "area", areaCode: "1000004" },
          ]),
        );
        const prefectureOnly = await catalog.expand(
          selections([{ unit: "prefecture", prefectureCode: "13" }]),
        );
        expect(sorted(both)).toEqual(sorted(prefectureOnly));
      });

      it("areaCatalog#27 テスト用のマスター / labelSelections([])", async () => {
        const catalog = await makeCatalog();
        expect(await catalog.labelSelections([])).toEqual([]);
      });

      it('areaCatalog#28 テスト用のマスター / labelSelections([{ unit: "prefecture", prefectureCode: "13" }])', async () => {
        const catalog = await makeCatalog();
        const chosen = selections([
          { unit: "prefecture", prefectureCode: "13" },
        ]);
        expect(await catalog.labelSelections(chosen)).toEqual([
          { selection: chosen[0], label: "東京都" },
        ]);
      });

      it('areaCatalog#29 テスト用のマスター / labelSelections([{ unit: "municipality", municipalityCode: "13101" }])', async () => {
        const catalog = await makeCatalog();
        const chosen = selections([
          { unit: "municipality", municipalityCode: "13101" },
        ]);
        expect(await catalog.labelSelections(chosen)).toEqual([
          { selection: chosen[0], label: "東京都千代田区" },
        ]);
      });

      it('areaCatalog#30 テスト用のマスター / labelSelections([{ unit: "area", areaCode: "1040061" }])', async () => {
        const catalog = await makeCatalog();
        const chosen = selections([{ unit: "area", areaCode: "1040061" }]);
        expect(await catalog.labelSelections(chosen)).toEqual([
          { selection: chosen[0], label: "104-0061 東京都中央区銀座" },
        ]);
      });

      it('areaCatalog#31 テスト用のマスター / labelSelections([{ unit: "area", areaCode: "9990001" }])（同じエリアに複数の町域）', async () => {
        const catalog = await makeCatalog();
        const [label] = await catalog.labelSelections(
          selections([{ unit: "area", areaCode: "9990001" }]),
        );
        expect(label?.label).toBe("999-0001 大阪府大阪市北区乙町");
      });

      it('areaCatalog#32 テスト用のマスター / labelSelections([{ unit: "area", areaCode: "9990002" }])（同じエリアに、同じ kana の町域が複数）', async () => {
        const catalog = await makeCatalog();
        const [label] = await catalog.labelSelections(
          selections([{ unit: "area", areaCode: "9990002" }]),
        );
        expect(label?.label).toBe("999-0002 大阪府大阪市北区あさひ");
      });

      it('areaCatalog#33 テスト用のマスター / labelSelections([{ unit: "area", areaCode: "1000000" }])（name が空の町域のエリア）', async () => {
        const catalog = await makeCatalog();
        const [label] = await catalog.labelSelections(
          selections([{ unit: "area", areaCode: "1000000" }]),
        );
        expect(label?.label).toBe("100-0000 東京都千代田区");
      });

      it('areaCatalog#34 テスト用のマスター / labelSelections([{ unit: "area", areaCode: "5300001" }, { unit: "prefecture", prefectureCode: "13" }, { unit: "municipality", municipalityCode: "27127" }])', async () => {
        const catalog = await makeCatalog();
        const chosen = selections([
          { unit: "area", areaCode: "5300001" },
          { unit: "prefecture", prefectureCode: "13" },
          { unit: "municipality", municipalityCode: "27127" },
        ]);
        const labels = await catalog.labelSelections(chosen);
        expect(labels).toEqual([
          { selection: chosen[0], label: "530-0001 大阪府大阪市北区梅田" },
          { selection: chosen[1], label: "東京都" },
          { selection: chosen[2], label: "大阪府大阪市北区" },
        ]);
        labels.forEach((label, i) => {
          const argument = chosen[i];
          expect(
            argument !== undefined &&
              AreaSelection.equals(label.selection, argument),
          ).toBe(true);
        });
      });

      it('areaCatalog#35 テスト用のマスター / labelSelections([{ unit: "prefecture", prefectureCode: "13" }, { unit: "area", areaCode: "1008111" }, { unit: "municipality", municipalityCode: "47201" }])（マスターにないコードを含む）', async () => {
        const catalog = await makeCatalog();
        const chosen = selections([
          { unit: "prefecture", prefectureCode: "13" },
          { unit: "area", areaCode: "1008111" },
          { unit: "municipality", municipalityCode: "47201" },
        ]);
        expect(await catalog.labelSelections(chosen)).toEqual([
          { selection: chosen[0], label: "東京都" },
        ]);
      });

      it('areaCatalog#36 テスト用のマスター / 同じ引数で listTowns("27127") を2回呼ぶ', async () => {
        const catalog = await makeCatalog();
        const code = MunicipalityCode.create("27127");
        const first = await catalog.listTowns(code);
        const second = await catalog.listTowns(code);
        expect(second).toEqual(first);
        expect(ids(second)).toEqual(["T5", "T7", "T6", "T10", "T9", "T8"]);
      });
    });
  });
}
