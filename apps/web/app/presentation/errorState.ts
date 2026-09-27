import type { FieldErrors } from "@repo/core/lib/error";
import { presentBusinessError } from "./businessErrorCatalog";
import type { SerializedError } from "./errorResponse";
import { extractSerializedError } from "./errorResponse";

/**
 * How a failed load or operation is shown — the common states of
 * `spec/pages/index.md` that an error maps onto. Screens pick the
 * presentation (inline alert, empty panel, field messages); this only
 * decides which state it is.
 *
 * - `invalidInput` CS-10: the transport check failed (`fieldErrors`), or
 *   a business rule rejected what was entered — the catalog
 *   (`businessErrorCatalog.ts`) decides per code. `missing` lists the
 *   unmet publish conditions of `{SUBJECT}_PUBLISH_CONDITION_UNMET`.
 * - `premiseChanged` CS-08: a business rule says the state changed under
 *   the operation (per code, in the same catalog).
 * - `conflict` CS-07, `loginRequired` CS-04, `forbidden` CS-05,
 *   `notFound` CS-06 (CS-17 on management screens — the screen decides).
 * - `failed` CS-02: communication or server failure; retrying may help.
 */
export type ErrorState =
  | Readonly<{
      kind: "invalidInput";
      code: string | null;
      message: string;
      fieldErrors: FieldErrors;
      missing: readonly string[];
    }>
  | Readonly<{
      kind:
        | "premiseChanged"
        | "conflict"
        | "loginRequired"
        | "forbidden"
        | "notFound"
        | "failed";
      code: string | null;
      message: string;
    }>;

/** User-facing wording of the application-level codes. */
const APPLICATION_MESSAGES: Readonly<Record<string, string>> = {
  OPTIMISTIC_LOCK_FAILURE:
    "ほかの人が先に保存しました。最新の内容を読み直してから、もう一度操作してください",
  UNIQUE_VIOLATION: "すでに登録されています",
  LOGIN_REQUIRED: "ログインが必要です",
  DEV_TOOLS_DISABLED: "この機能は使えません",
};

const FALLBACK = {
  invalidInput: "入力内容を確かめてください",
  conflict:
    "ほかの人が先に保存しました。最新の内容を読み直してから、もう一度操作してください",
  loginRequired: "ログインが必要です",
  forbidden: "この操作を行う権限がありません",
  notFound: "表示できません",
  failed: "通信エラーが発生しました。時間をおいて、もう一度お試しください",
} as const;

function applicationMessage(
  code: string | null,
  fallback: keyof typeof FALLBACK,
): string {
  return (
    (code === null ? undefined : APPLICATION_MESSAGES[code]) ??
    FALLBACK[fallback]
  );
}

export function classifySerializedError(error: SerializedError): ErrorState {
  const { code } = error;
  switch (error.kind) {
    case "validation":
      return {
        kind: "invalidInput",
        code,
        message: FALLBACK.invalidInput,
        fieldErrors: error.fieldErrors ?? {},
        missing: [],
      };
    case "business": {
      const { state, message } = presentBusinessError(code);
      if (state === "invalidInput") {
        return {
          kind: "invalidInput",
          code,
          message,
          fieldErrors: {},
          missing: (error.missing ?? []).filter(
            (item): item is string => typeof item === "string",
          ),
        };
      }
      return { kind: "premiseChanged", code, message };
    }
    case "conflict":
      return {
        kind: "conflict",
        code,
        message: applicationMessage(code, "conflict"),
      };
    case "unauthorized":
      return {
        kind: "loginRequired",
        code,
        message: applicationMessage(code, "loginRequired"),
      };
    case "forbidden":
      return {
        kind: "forbidden",
        code,
        message: applicationMessage(code, "forbidden"),
      };
    case "notFound":
      return { kind: "notFound", code, message: FALLBACK.notFound };
    case "system":
    case "unknown":
      return { kind: "failed", code: null, message: FALLBACK.failed };
  }
}

/** Anything a server function or loader threw, as a display state. */
export function classifyError(error: unknown): ErrorState {
  return classifySerializedError(extractSerializedError(error));
}
