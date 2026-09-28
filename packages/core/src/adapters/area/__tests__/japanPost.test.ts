import { describe, expect, it } from "vitest";
import { buildAreaAssets } from "../assetFormat";
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

  it("turns 「…の次に番地がくる場合」 into an unnamed town beside the whole-municipality town", () => {
    const okaya = (postal: string, kana: string, town: string) =>
      line(
        "20204",
        postal,
        "ナガノケン",
        "オカヤシ",
        kana,
        "長野県",
        "岡谷市",
        town,
      );
    const rows = parseJapanPostCsv(
      [
        okaya("3940000", "イカニケイサイガナイバアイ", "以下に掲載がない場合"),
        okaya(
          "3940091",
          "オカヤシノツギニバンチガクルバアイ",
          "岡谷市の次に番地がくる場合",
        ),
        okaya("3940002", "アカハネ", "赤羽"),
      ].join("\n"),
    );
    expect(rows.map((row) => [row.areaCode, row.name, row.kana])).toEqual([
      ["3940000", "", ""],
      ["3940091", "", ""],
      ["3940002", "赤羽", "アカハネ"],
    ]);
  });

  it("turns 「…の次に{番地の範囲}番地がくる場合」 into unnamed towns told apart by postal code, notes and all", () => {
    const kosuge = (postal: string, kana: string, town: string) =>
      line(
        "19443",
        postal,
        "ヤマナシケン",
        "キタツルグンコスゲムラ",
        kana,
        "山梨県",
        "北都留郡小菅村",
        town,
      );
    const kotohira = (postal: string, kana: string, town: string) =>
      line(
        "37403",
        postal,
        "カガワケン",
        "ナカタドグンコトヒラチョウ",
        kana,
        "香川県",
        "仲多度郡琴平町",
        town,
      );
    const rows = parseJapanPostCsv(
      [
        kosuge("4090200", "イカニケイサイガナイバアイ", "以下に掲載がない場合"),
        kosuge(
          "4090142",
          "コスゲムラノツギニ1-663バンチガクルバアイ",
          "小菅村の次に１〜６６３番地がくる場合",
        ),
        kosuge(
          "4090211",
          "コスゲムラノツギニ664バンチイコウガクルバアイ",
          "小菅村の次に６６４番地以降がくる場合",
        ),
        kotohira(
          "7660002",
          "コトヒラチョウノツギニ1-426バンチガクルバアイ(カワヒガシ)",
          "琴平町の次に１〜４２６番地がくる場合（川東）",
        ),
        kotohira(
          "7660001",
          "コトヒラチョウノツギニ427バンチイコウガクルバアイ(カワニシ)",
          "琴平町の次に４２７番地以降がくる場合（川西）",
        ),
      ].join("\n"),
    );
    expect(
      rows.map((row) => [
        row.areaCode,
        row.municipalityCode,
        row.name,
        row.kana,
      ]),
    ).toEqual([
      ["4090200", "19443", "", ""],
      ["4090142", "19443", "", ""],
      ["4090211", "19443", "", ""],
      ["7660002", "37403", "", ""],
      ["7660001", "37403", "", ""],
    ]);
    expect(() => buildAreaAssets(rows)).not.toThrow();
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
    expect(row?.kana).toBe("マルノウチ");
    expect(row?.name).toBe("丸の内");
  });

  it("drops the notes completing a place name's range, in the name and the reading", () => {
    const rows = parseJapanPostCsv(
      [
        chiyoda.row(
          "1000005",
          "マルノウチ（ツギノビルヲノゾク）",
          "丸の内（次のビルを除く）",
        ),
        chiyoda.row("1000003", "ヒトツバシ（１チョウメ）", "一ツ橋（１丁目）"),
        chiyoda.row(
          "1120001",
          "ハクサン（２−５チョウメ）",
          "白山（２〜５丁目）",
        ),
        chiyoda.row("1000099", "テスト（ソノタ）", "試験（その他）"),
        chiyoda.row("1000098", "テスト（バンチ）", "試験町（番地）"),
        chiyoda.row(
          "1000097",
          "オオエ（１チョウメ、２チョウメ「６５１、６６２バンチ」イガイ）",
          "大江（１丁目、２丁目「６５１、６６２番地」以外）",
        ),
      ].join("\n"),
    );
    expect(rows.map((row) => [row.areaCode, row.name, row.kana])).toEqual([
      ["1000005", "丸の内", "マルノウチ"],
      ["1000003", "一ツ橋", "ヒトツバシ"],
      ["1120001", "白山", "ハクサン"],
      ["1000099", "試験", "テスト"],
      ["1000098", "試験町", "テスト"],
      ["1000097", "大江", "オオエ"],
    ]);
  });

  it("keeps a building's floor note while dropping a range note", () => {
    const rows = parseJapanPostCsv(
      [
        chiyoda.row(
          "1007001",
          "マルノウチジェイピータワー（１カイ）",
          "丸の内ＪＰタワー（１階）",
        ),
        chiyoda.row(
          "1007090",
          "ﾏﾙﾉｳﾁｼﾞｪｲﾋﾟｰﾀﾜｰ(ﾁｶｲ･ｶｲｿｳﾌﾒｲ)",
          "丸の内ＪＰタワー（地階・階層不明）",
        ),
      ].join("\n"),
    );
    expect(rows.map((row) => row.name)).toEqual([
      "丸の内ＪＰタワー（１階）",
      "丸の内ＪＰタワー（地階・階層不明）",
    ]);
  });

  it("joins a name split over records before dropping its note", () => {
    const rows = parseJapanPostCsv(
      [
        chiyoda.row("0600042", "オオドオリニシ（１−", "大通西（１〜"),
        chiyoda.row("0600042", "１９チョウメ）", "１９丁目）"),
        chiyoda.row("1000005", "マルノウチ", "丸の内"),
      ].join("\n"),
    );
    expect(rows.map((row) => [row.areaCode, row.name, row.kana])).toEqual([
      ["0600042", "大通西", "オオドオリニシ"],
      ["1000005", "丸の内", "マルノウチ"],
    ]);
  });

  it("merges rows that become the same place name once their notes are dropped", () => {
    const rows = parseJapanPostCsv(
      [
        chiyoda.row("1000003", "ヒトツバシ（１チョウメ）", "一ツ橋（１丁目）"),
        chiyoda.row("1000003", "ヒトツバシ（ソノタ）", "一ツ橋（その他）"),
        chiyoda.row("1010003", "ヒトツバシ（２チョウメ）", "一ツ橋（２丁目）"),
      ].join("\n"),
    );
    expect(rows.map((row) => [row.areaCode, row.name])).toEqual([
      ["1000003", "一ツ橋"],
      ["1010003", "一ツ橋"],
    ]);
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
