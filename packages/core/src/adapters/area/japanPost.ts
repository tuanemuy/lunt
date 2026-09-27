/**
 * Turns Japan Post's postal code data (「住所の郵便番号（1レコード1行、
 * UTF-8形式）」, `utf_ken_all.csv`) into area master rows, applying the
 * import rules of `spec/domains/area.md` 「ユビキタス言語」:
 *
 * - The file has no business-specific postal codes (those are a separate
 *   file), so every row is a town.
 * - 「以下に掲載がない場合」 is the whole-municipality town: empty name and
 *   reading.
 * - A municipality without that row whose only row is `〇〇一円` (e.g.
 *   `御蔵島村一円`) takes that row as its whole-municipality town.
 * - Per-floor rows of buildings (`（１階）`, `（地階・階層不明）`) stay towns.
 * - Rows repeating postal code, municipality and name (differing only in
 *   the reading) keep the first.
 *
 * Every other name is kept as published.
 */
import type { AreaMasterRow } from "./assetFormat";

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
const HALF_WIDTH_KATAKANA = /[｡-ﾟ]+/gu;

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
  const parsed: ParsedRow[] = parseCsv(text).map((cells, index) => {
    const line = index + 1;
    if (cells.length !== COLUMN_COUNT) {
      throw new Error(
        `Line ${line}: expected ${COLUMN_COUNT} columns of utf_ken_all.csv, got ${cells.length}`,
      );
    }
    const cell = (column: number): string => (cells[column] ?? "").trim();
    const municipalityCode = cell(Column.municipalityCode);
    const name = cell(Column.townName);
    const whole = name === WHOLE_MUNICIPALITY;
    return {
      line,
      row: {
        areaCode: cell(Column.postalCode),
        prefectureCode: municipalityCode.slice(0, 2),
        prefectureName: cell(Column.prefectureName),
        municipalityCode,
        municipalityName: cell(Column.municipalityName),
        name: whole ? "" : name,
        kana: whole
          ? ""
          : cell(Column.townKana).replace(HALF_WIDTH_KATAKANA, (run) =>
              run.normalize("NFKC"),
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
