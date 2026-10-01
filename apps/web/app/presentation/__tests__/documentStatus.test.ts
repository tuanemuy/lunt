import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  SystemError,
  UnauthorizedError,
} from "@repo/core/application/errors";
import { describe, expect, it } from "vitest";
import { documentStatusOf } from "../documentStatus";
import { AppServerError } from "../errorResponse";

const ok = { status: "success", error: undefined } as const;
const failedWith = (error: unknown) => ({ status: "error", error }) as const;

describe("documentStatusOf", () => {
  it("leaves the router's status when no route failed", () => {
    expect(documentStatusOf([ok, ok])).toBeNull();
    expect(
      documentStatusOf([ok, { status: "notFound", error: undefined }]),
    ).toBeNull();
  });

  it.each([
    ["forbidden (CS-05)", new ForbiddenError("FORBIDDEN", "x"), 403],
    ["not found (CS-17)", new NotFoundError("PLACE_NOT_FOUND", "x"), 404],
    ["login required", new UnauthorizedError("LOGIN_REQUIRED", "x"), 401],
    ["a conflict", new ConflictError("OPTIMISTIC_LOCK_FAILURE", "x"), 409],
    ["a system error", new SystemError("DATABASE_ERROR", "x"), 500],
    ["an unknown throw", new TypeError("x"), 500],
  ] as const)("answers a route that threw %s with %i", (_, error, status) => {
    expect(documentStatusOf([ok, failedWith(error)])).toBe(status);
  });

  it("reads the kind of an error that crossed a server function", () => {
    const error = new AppServerError({
      kind: "forbidden",
      code: "FORBIDDEN",
      message: "x",
    });
    expect(documentStatusOf([failedWith(error), ok])).toBe(403);
  });
});
