import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  SystemError,
  UnauthorizedError,
} from "@repo/core/application/errors";
import { Publication } from "@repo/core/domain/common/publication";
import { Suspension } from "@repo/core/domain/common/suspension";
import { BusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { businessErrorCatalog } from "../businessErrorCatalog";
import {
  AppServerError,
  redactForClient,
  serializeError,
} from "../errorResponse";
import { classifyError } from "../errorState";

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
}

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
      missing: [],
    });
  });

  it("maps an unmet publish condition to CS-10 and hands the missing items to the screen", () => {
    const error = catchError(() =>
      Publication.publish(
        { publication: Publication.draft(), suspension: Suspension.none },
        ["photos", "name"],
        new Date("2026-09-28T00:00:00.000Z"),
        "LISTING",
      ),
    );
    expect(classifyError(error)).toEqual({
      kind: "invalidInput",
      code: "LISTING_PUBLISH_CONDITION_UNMET",
      message: "公開に必要な項目が足りません",
      fieldErrors: {},
      missing: ["photos", "name"],
    });
  });

  it("keeps the missing items across the wire (serialized, then redacted, then read back)", () => {
    const error = catchError(() =>
      Publication.assertConditionMet(["photos"], "REGION"),
    );
    const wire = new AppServerError(redactForClient(serializeError(error)));
    expect(classifyError(wire)).toMatchObject({
      kind: "invalidInput",
      code: "REGION_PUBLISH_CONDITION_UNMET",
      missing: ["photos"],
    });
  });

  it("maps an already-changed publication to CS-08, not to an input error", () => {
    const error = catchError(() =>
      Publication.publish(
        {
          publication: { status: "published", firstPublishedAt: new Date(0) },
          suspension: Suspension.none,
        },
        [],
        new Date("2026-09-28T00:00:00.000Z"),
        "LISTING",
      ),
    );
    expect(classifyError(error)).toEqual({
      kind: "premiseChanged",
      code: "COMMON_PUBLICATION_INVALID_TRANSITION",
      message: "公開状態が変わっています。最新の状態を確かめてください",
    });
  });

  it("gives every business error code a common state and a Japanese message", () => {
    for (const [code, entry] of Object.entries(businessErrorCatalog)) {
      expect(["invalidInput", "premiseChanged"]).toContain(entry.state);
      expect(entry.message).toMatch(/[ぁ-んァ-ン一-龯]/);
      expect(classifyError(new BusinessRuleError(code, "x")).kind).toBe(
        entry.state,
      );
    }
    expect(Object.keys(businessErrorCatalog)).not.toContain(
      "PLACE_PUBLISH_CONDITION_UNMET",
    );
  });

  it("reads an unknown business code as CS-08", () => {
    expect(
      classifyError(new BusinessRuleError("SOMETHING_NEW", "x")).kind,
    ).toBe("premiseChanged");
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
