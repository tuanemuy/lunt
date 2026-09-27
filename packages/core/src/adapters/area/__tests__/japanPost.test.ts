import { describe, expect, it } from "vitest";
import { parseCsv, parseJapanPostCsv } from "../japanPost";

const line = (
  municipalityCode: string,
  postal: string,
  prefectureKana: string,
  municipalityKana: string,
  townKana: string,
  prefecture: string,
  municipality: string,
  town: string,
): string =>
  `${municipalityCode},"${postal.slice(0, 3)}  ","${postal}","${prefectureKana}","${municipalityKana}","${townKana}","${prefecture}","${municipality}","${town}",0,0,0,0,0,0`;

const tokyo = (
  municipalityCode: string,
  municipalityKana: string,
  municipality: string,
) => ({
  row: (postal: string, townKana: string, town: string) =>
    line(
      municipalityCode,
      postal,
      "トウキョウト",
      municipalityKana,
      townKana,
      "東京都",
      municipality,
      town,
    ),
});

const chiyoda = tokyo("13101", "チヨダク", "千代田区");
const mikurajima = tokyo("13382", "ミクラジマムラ", "御蔵島村");

describe("parseJapanPostCsv (spec/domains/area.md import rules)", () => {
  it("turns 「以下に掲載がない場合」 into the whole-municipality town", () => {
    const rows = parseJapanPostCsv(
      [
        chiyoda.row(
          "1000000",
          "イカニケイサイガナイバアイ",
          "以下に掲載がない場合",
        ),
        chiyoda.row("1000005", "マルノウチ", "丸の内"),
      ].join("\r\n"),
    );
    expect(rows).toEqual([
      {
        areaCode: "1000000",
        prefectureCode: "13",
        prefectureName: "東京都",
        municipalityCode: "13101",
        municipalityName: "千代田区",
        name: "",
        kana: "",
      },
      {
        areaCode: "1000005",
        prefectureCode: "13",
        prefectureName: "東京都",
        municipalityCode: "13101",
        municipalityName: "千代田区",
        name: "丸の内",
        kana: "マルノウチ",
      },
    ]);
  });

  it("takes a municipality's only 「〇〇村一円」 row as its whole-municipality town", () => {
    const rows = parseJapanPostCsv(
      `${mikurajima.row("1001301", "ミクラジマムライチエン", "御蔵島村一円")}\n`,
    );
    expect(rows).toMatchObject([
      { areaCode: "1001301", municipalityCode: "13382", name: "", kana: "" },
    ]);
  });

  it("keeps a 「一円」 place name in a municipality with other rows", () => {
    const taga = (postal: string, kana: string, town: string) =>
      line(
        "25443",
        postal,
        "シガケン",
        "イヌカミグンタガチョウ",
        kana,
        "滋賀県",
        "犬上郡多賀町",
        town,
      );
    const rows = parseJapanPostCsv(
      [
        taga("5220300", "イカニケイサイガナイバアイ", "以下に掲載がない場合"),
        taga("5220317", "イチエン", "一円"),
      ].join("\n"),
    );
    expect(rows.map((row) => row.name)).toEqual(["", "一円"]);
  });

  it("keeps per-floor rows of a building as towns", () => {
    const rows = parseJapanPostCsv(
      [
        chiyoda.row(
          "1007090",
          "マルノウチジェイピータワー（チカイ・カイソウフメイ）",
          "丸の内ＪＰタワー（地階・階層不明）",
        ),
        chiyoda.row(
          "1007001",
          "マルノウチジェイピータワー（１カイ）",
          "丸の内ＪＰタワー（１階）",
        ),
      ].join("\n"),
    );
    expect(rows.map((row) => [row.areaCode, row.name])).toEqual([
      ["1007090", "丸の内ＪＰタワー（地階・階層不明）"],
      ["1007001", "丸の内ＪＰタワー（１階）"],
    ]);
  });

  it("keeps only the first of rows differing only in the reading", () => {
    const rows = parseJapanPostCsv(
      [
        chiyoda.row("1000001", "チヨダ", "千代田"),
        chiyoda.row("1000001", "センダイ", "千代田"),
        chiyoda.row("1000002", "チヨダ", "千代田"),
      ].join("\n"),
    );
    expect(rows.map((row) => [row.areaCode, row.kana])).toEqual([
      ["1000001", "チヨダ"],
      ["1000002", "チヨダ"],
    ]);
  });

  it("widens half-width katakana readings and leaves other characters alone", () => {
    const [row] = parseJapanPostCsv(
      chiyoda.row("1000005", "ﾏﾙﾉｳﾁ（ﾂｷﾞﾉﾋﾞﾙｦﾉｿﾞｸ）", "丸の内（次のビルを除く）"),
    );
    expect(row?.kana).toBe("マルノウチ（ツギノビルヲノゾク）");
    expect(row?.name).toBe("丸の内（次のビルを除く）");
  });

  it("refuses a record that is not the 15-column UTF-8 format, naming the line", () => {
    expect(() =>
      parseJapanPostCsv(
        `${chiyoda.row("1000005", "マルノウチ", "丸の内")}\n13101,"100"`,
      ),
    ).toThrow(/Line 2/);
  });
});

describe("parseCsv", () => {
  it("handles quoted commas, doubled quotes, a BOM, CRLF and a missing final newline", () => {
    expect(parseCsv('\uFEFFa,"b,c","d""e"\r\n\r\nf,g')).toEqual([
      ["a", "b,c", 'd"e'],
      ["f", "g"],
    ]);
  });
});
