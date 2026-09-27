import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  SystemError,
  UnauthorizedError,
} from "@repo/core/application/errors";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import {
  AppServerError,
  redactForClient,
  serializeError,
} from "../errorResponse";
import { classifyError } from "../errorState";

describe("classifyError", () => {
  it("maps a value-object failure to CS-10 with a Japanese message", () => {
    const state = classifyError(
      new BusinessRuleError("COMMON_INVALID_EMAIL_ADDRESS", "Invalid email"),
    );
    expect(state).toEqual({
      kind: "invalidInput",
      code: "COMMON_INVALID_EMAIL_ADDRESS",
      message: "メールアドレスの形式が正しくありません",
      fieldErrors: {},
    });
  });

  it("maps any other business rule to CS-08 without leaking the domain message", () => {
    const state = classifyError(
      new BusinessRuleError("LISTING_SUSPENDED", "Suspended by the operator"),
    );
    expect(state.kind).toBe("premiseChanged");
    expect(state.message).not.toContain("Suspended");
  });

  it("maps a transport validation failure to CS-10 with its field errors", () => {
    const state = classifyError(
      new AppServerError({
        kind: "validation",
        code: "INVALID_INPUT",
        message: "Invalid input",
        fieldErrors: { email: ["メールアドレスを入力してください"] },
      }),
    );
    expect(state).toMatchObject({
      kind: "invalidInput",
      fieldErrors: { email: ["メールアドレスを入力してください"] },
    });
  });

  it("maps the application errors to their common states", () => {
    expect(
      classifyError(new ConflictError("OPTIMISTIC_LOCK_FAILURE", "x")).kind,
    ).toBe("conflict");
    expect(
      classifyError(new UnauthorizedError("LOGIN_REQUIRED", "x")),
    ).toMatchObject({
      kind: "loginRequired",
      message: "ログインが必要です",
    });
    expect(classifyError(new ForbiddenError("X", "x")).kind).toBe("forbidden");
    expect(classifyError(new NotFoundError("X", "x")).kind).toBe("notFound");
  });

  it("maps system failures and network errors to CS-02 without internal detail", () => {
    const system = redactForClient(
      serializeError(
        new SystemError("DATABASE_ERROR", "table accounts is locked"),
      ),
    );
    expect(classifyError(new AppServerError(system))).toEqual({
      kind: "failed",
      code: null,
      message: "通信エラーが発生しました。時間をおいて、もう一度お試しください",
    });
    expect(classifyError(new TypeError("Failed to fetch")).kind).toBe("failed");
  });
});
