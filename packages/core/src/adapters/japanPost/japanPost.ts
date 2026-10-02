/**
 * Turns Japan Post's postal code data (「住所の郵便番号（1レコード1行、
 * UTF-8形式）」, `utf_ken_all.csv`) into area master rows, applying the
 * import rules of `spec/domains/area.md` 「ユビキタス言語」:
 *
 * - The file has no business-specific postal codes (those are a separate
 *   file), so every row is a town.
 * - 「以下に掲載がない場合」 is the whole-municipality town: empty name and
 *   reading.
 * - 「{…}の次に番地がくる場合」 and 「{…}の次に{番地の範囲}番地がくる場合」
 *   (an address where the block number follows the municipality's name,
 *   e.g. `小菅村の次に１〜６６３番地がくる場合`) is a town without a place
 *   name of its own: empty name and reading, told apart from the
 *   whole-municipality town and from each other by the postal code.
 * - A municipality without that row whose only row is `〇〇一円` (e.g.
 *   `御蔵島村一円`) takes that row as its whole-municipality town.
 * - Per-floor rows of buildings (`（１階）`, `（地階・階層不明）`) stay towns,
 *   and keep that note: it tells the building's towns apart.
 * - Every other parenthesized note completing the place name's range
 *   (`（次のビルを除く）`, `（その他）`, `（丁目）`, `（番地）`, lists of blocks
 *   or districts) is dropped: `丸の内（次のビルを除く）` is `丸の内`. A name
 *   the file splits over several records (an unclosed `（`) is joined
 *   first.
 * - Rows repeating postal code, municipality and name (differing only in
 *   the reading, or only in a dropped note) keep the first.
 */
import type { AreaMasterRow } from "../staticAssets/assetFormat";

/** Column positions of the 15-column UTF-8 file. */
const Column = {
  municipalityCode: 0,
  postalCode: 2,
  townKana: 5,
  prefectureName: 6,
  municipalityName: 7,
  townName: 8,
} as const;

const COLUMN_COUNT = 15;
const WHOLE_MUNICIPALITY = "以下に掲載がない場合";
const WHOLE_MUNICIPALITY_SUFFIX = "一円";
/** Tested after the range notes are dropped (`…がくる場合（川東）`). */
const NUMBER_FOLLOWS = /の次に.*番地.*がくる場合$/u;
const HALF_WIDTH_KATAKANA = /[｡-ﾟ]+/gu;

/** An innermost parenthesized group (full- or half-width parentheses). */
const INNERMOST_GROUP = /[（(][^（）()]*[）)]/gu;
/** Notes naming a building's floor, in the name or in the reading. */
const FLOOR_NOTE =
  /^[（(](?:[０-９0-9]+(?:階|カイ)|地階・階層不明|チカイ・カイソウフメイ)[）)]$/u;

function dropRangeNotes(text: string): string {
  let current = text;
  for (;;) {
    const next = current.replace(INNERMOST_GROUP, (group) =>
      FLOOR_NOTE.test(group) ? group : "",
    );
    if (next === current) return current.trim();
    current = next;
  }
}

/**
 * The town name without its range notes (`spec/domains/area.md`
 * 「ユビキタス言語」). A name that would be left empty is kept as published.
 */
export function townNameOf(name: string): string {
  const dropped = dropRangeNotes(name);
  return dropped === "" ? name : dropped;
}

/** The reading, with the notes dropped the same way as the name's. */
export function townKanaOf(kana: string): string {
  const dropped = dropRangeNotes(kana);
  return dropped === "" ? kana : dropped;
}

const unclosed = (text: string): boolean =>
  (text.match(/[（(]/gu)?.length ?? 0) > (text.match(/[）)]/gu)?.length ?? 0);

/**
 * Joins records the file split in the middle of a town name: while the
 * name so far has an unclosed parenthesis, the next record of the same
 * postal code and municipality continues it (name and reading).
 */
function joinSplitNames(records: readonly string[][]): string[][] {
  const joined: string[][] = [];
  for (const cells of records) {
    const previous = joined.at(-1);
    if (
      previous !== undefined &&
      unclosed(previous[Column.townName] ?? "") &&
      previous[Column.postalCode] === cells[Column.postalCode] &&
      previous[Column.municipalityCode] === cells[Column.municipalityCode]
    ) {
      previous[Column.townName] =
        `${previous[Column.townName] ?? ""}${cells[Column.townName] ?? ""}`;
      previous[Column.townKana] =
        `${previous[Column.townKana] ?? ""}${cells[Column.townKana] ?? ""}`;
      continue;
    }
    joined.push([...cells]);
  }
  return joined;
}

/** Splits CSV text into records (RFC 4180 quoting, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    if (record.length > 1 || record[0] !== "") records.push(record);
    record = [];
  };
  for (; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\n") {
      endRecord();
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (quoted) throw new Error("The CSV ends inside a quoted field");
  if (field !== "" || record.length > 0) endRecord();
  return records;
}

type ParsedRow = {
  line: number;
  row: AreaMasterRow;
};

/**
 * The master rows of a `utf_ken_all.csv`, in file order. Throws on a record
 * that is not the 15-column UTF-8 format, naming its line.
 */
export function parseJapanPostCsv(text: string): AreaMasterRow[] {
  const records = parseCsv(text);
  records.forEach((cells, index) => {
    if (cells.length !== COLUMN_COUNT) {
      throw new Error(
        `Line ${index + 1}: expected ${COLUMN_COUNT} columns of utf_ken_all.csv, got ${cells.length}`,
      );
    }
  });
  const parsed: ParsedRow[] = joinSplitNames(records).map((cells, index) => {
    const line = index + 1;
    const cell = (column: number): string => (cells[column] ?? "").trim();
    const municipalityCode = cell(Column.municipalityCode);
    const name = cell(Column.townName);
    const whole =
      name === WHOLE_MUNICIPALITY || NUMBER_FOLLOWS.test(dropRangeNotes(name));
    return {
      line,
      row: {
        areaCode: cell(Column.postalCode),
        prefectureCode: municipalityCode.slice(0, 2),
        prefectureName: cell(Column.prefectureName),
        municipalityCode,
        municipalityName: cell(Column.municipalityName),
        name: whole ? "" : townNameOf(name),
        kana: whole
          ? ""
          : townKanaOf(
              cell(Column.townKana).replace(HALF_WIDTH_KATAKANA, (run) =>
                run.normalize("NFKC"),
              ),
            ),
      },
    };
  });

  const byMunicipality = new Map<string, ParsedRow[]>();
  for (const entry of parsed) {
    const group = byMunicipality.get(entry.row.municipalityCode);
    if (group === undefined) {
      byMunicipality.set(entry.row.municipalityCode, [entry]);
    } else {
      group.push(entry);
    }
  }
  const wholeByOneRow = new Set<ParsedRow>();
  for (const group of byMunicipality.values()) {
    const [only] = group;
    if (
      group.length === 1 &&
      only !== undefined &&
      only.row.name.endsWith(WHOLE_MUNICIPALITY_SUFFIX)
    ) {
      wholeByOneRow.add(only);
    }
  }

  const seen = new Set<string>();
  const rows: AreaMasterRow[] = [];
  for (const entry of parsed) {
    const row = wholeByOneRow.has(entry)
      ? { ...entry.row, name: "", kana: "" }
      : entry.row;
    const key = `${row.areaCode}\u0000${row.municipalityCode}\u0000${row.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}
