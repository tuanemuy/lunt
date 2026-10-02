import {
  ApplicationError,
  SystemError,
  SystemErrorCode,
} from "@repo/core/application/errors";
import type { ScanResult } from "@repo/core/domain/common/scan";

/**
 * Restores a scanned page row by row: a row whose restoration throws is
 * reported in `unreadable` under `keyOf(row)` instead of failing the
 * whole page (`ScanResult`).
 */
export function restoreScanPage<R, T>(
  page: Readonly<{ items: readonly R[]; count: number }>,
  keyOf: (row: R) => string,
  restore: (row: R) => T,
): ScanResult<T> {
  const items: T[] = [];
  const unreadable: { key: string; cause: unknown }[] = [];
  for (const row of page.items) {
    try {
      items.push(restore(row));
    } catch (error) {
      unreadable.push({
        key: keyOf(row),
        cause:
          error instanceof ApplicationError
            ? error
            : new SystemError(
                SystemErrorCode.DataIntegrityError,
                `Stored row ${keyOf(row)} cannot be restored`,
                error,
              ),
      });
    }
  }
  return { items, count: page.count, unreadable };
}
