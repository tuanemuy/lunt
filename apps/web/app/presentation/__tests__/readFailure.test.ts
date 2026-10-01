import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  SystemError,
  UnauthorizedError,
} from "@repo/core/application/errors";
import type { Logger, LogMeta } from "@repo/core/application/ports/logger";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { AppServerError } from "../errorResponse";
import { readStateOf } from "../readFailure";

function recordingLogger() {
  const errors: { message: string; meta: LogMeta | undefined }[] = [];
  const logger: Logger = {
    info: () => {},
    warn: () => {},
    error: (message, meta) => {
      errors.push({ message, meta });
    },
  };
  return { logger, errors };
}

describe("readStateOf", () => {
  it("records a SystemError with its raw code and message, and shows CS-02", () => {
    const { logger, errors } = recordingLogger();
    const error = new SystemError("DATABASE_ERROR", "state object unavailable");

    const state = readStateOf(error, logger);

    expect(state.kind).toBe("failed");
    expect(errors).toEqual([
      {
        message: "Server component read failed",
        meta: {
          kind: "system",
          code: "DATABASE_ERROR",
          message: "state object unavailable",
          cause: error,
        },
      },
    ]);
  });

  it("records anything outside the shared error contracts as unknown, and shows CS-02", () => {
    const { logger, errors } = recordingLogger();
    const error = new TypeError("Cannot read properties of undefined");

    const state = readStateOf(error, logger);

    expect(state.kind).toBe("failed");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.meta).toMatchObject({ kind: "unknown", cause: error });
  });

  it.each([
    ["not found", new NotFoundError("PLACE_NOT_FOUND", "gone"), "notFound"],
    ["forbidden", new ForbiddenError("FORBIDDEN", "no"), "forbidden"],
    [
      "login required",
      new UnauthorizedError("LOGIN_REQUIRED", "login"),
      "loginRequired",
    ],
    [
      "a conflict",
      new ConflictError("OPTIMISTIC_LOCK_FAILURE", "stale"),
      "conflict",
    ],
    [
      "a business rule",
      new BusinessRuleError("COMMON_INVALID_EMAIL_ADDRESS", "bad"),
      "invalidInput",
    ],
  ] as const)(
    "does not record %s, an expected screen state",
    (_, error, kind) => {
      const { logger, errors } = recordingLogger();

      expect(readStateOf(error, logger).kind).toBe(kind);
      expect(errors).toEqual([]);
    },
  );

  it("does not record again a failure the server-function boundary already recorded", () => {
    const { logger, errors } = recordingLogger();
    const error = new AppServerError({
      kind: "system",
      code: null,
      message: "System error",
    });

    expect(readStateOf(error, logger).kind).toBe("failed");
    expect(errors).toEqual([]);
  });
});
