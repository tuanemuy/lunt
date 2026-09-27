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
