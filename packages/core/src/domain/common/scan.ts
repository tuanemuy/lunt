import type { PaginationResult } from "./pagination";

/** A stored row a scan could not restore: its id, and why it failed. */
export type UnreadableRow = Readonly<{ key: string; cause: unknown }>;

/**
 * A page of a scan the daily jobs page through (`spec/flows/index.md`
 * 「共通の前提」). A row that cannot be restored is reported in
 * `unreadable` by its id instead of failing the whole read, so it fails
 * as that one target and the rest of the page is still processed.
 * `count` is every matching row, unreadable ones included.
 */
export type ScanResult<T> = PaginationResult<T> &
  Readonly<{ unreadable: readonly UnreadableRow[] }>;
