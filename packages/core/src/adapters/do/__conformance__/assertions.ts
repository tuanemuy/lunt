import type { PaginationResult } from "@repo/core/domain/common/pagination";
import type { ScanResult } from "@repo/core/domain/common/scan";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { expect } from "vitest";

/** Awaits `promise` and asserts it rejects with a `BusinessRuleError` of `code`. */
export async function expectBusinessRuleError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(isBusinessRuleError(error)).toBe(true);
  expect((error as { code?: unknown }).code).toBe(code);
}

/**
 * A scanned page whose rows were all written through the ports: asserts
 * none is reported unreadable and returns the page as `{ items, count }`.
 */
export async function readableScan<T>(
  scan: Promise<ScanResult<T>>,
): Promise<PaginationResult<T>> {
  const { items, count, unreadable } = await scan;
  expect(unreadable).toEqual([]);
  return { items, count };
}
