import { BusinessRuleError } from "@repo/core/domain/error";
import { expect } from "vitest";

export function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to throw");
}

export function expectBusinessError(fn: () => unknown, code: string): void {
  const error = catchError(fn);
  expect(error).toBeInstanceOf(BusinessRuleError);
  expect((error as BusinessRuleError<string>).code).toBe(code);
}
