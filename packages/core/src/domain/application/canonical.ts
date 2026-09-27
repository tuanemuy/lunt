/**
 * A deterministic string for plain data (objects, arrays, strings,
 * numbers, booleans, `null`): object keys sorted, `undefined` members
 * dropped. Two values have the same key exactly when they hold the same
 * data, so it serves as both an equality and a storage key (the slot key).
 */
export function canonicalKey(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalKey(item)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalKey(record[key])}`)
    .join(",")}}`;
}

/** Structural equality of plain data (see `canonicalKey`). */
export function sameData(a: unknown, b: unknown): boolean {
  return canonicalKey(a) === canonicalKey(b);
}
