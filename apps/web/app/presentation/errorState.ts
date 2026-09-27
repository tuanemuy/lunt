import type { FieldErrors } from "@repo/core/lib/error";
import type { SerializedError } from "./errorResponse";
import { extractSerializedError } from "./errorResponse";

/**
 * How a failed load or operation is shown — the common states of
 * `spec/pages/index.md` that an error maps onto. Screens pick the
 * presentation (inline alert, empty panel, field messages); this only
 * decides which state it is.
 *
 * - `invalidInput` CS-10: the request was well-formed but a value broke a
 *   rule (value-object codes `*_INVALID_*`) or failed the transport check.
 * - `premiseChanged` CS-08: any other business rule — the state changed
 *   under the operation.
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

const INVALID_VALUE_CODE = /(^|_)INVALID(_|$)/;

/** User-facing wording of codes shared by every domain. */
const MESSAGES: Readonly<Record<string, string>> = {
  COMMON_INVALID_EMAIL_ADDRESS: "メールアドレスの形式が正しくありません",
  COMMON_INVALID_AREA_CODE: "郵便番号の形式が正しくありません",
  COMMON_INVALID_DATE_RANGE: "終了日は開始日以降にしてください",
  COMMON_INVALID_LOCAL_DATE: "日付が正しくありません",
  COMMON_INVALID_GEO_POINT: "位置が正しくありません",
  COMMON_INVALID_GEO_BOUNDS: "範囲が正しくありません",
  COMMON_INVALID_TAGLINE: "キャッチコピーは1〜60文字で入力してください",
  COMMON_INVALID_SEARCH_KEYWORD: "キーワードは100文字以内で入力してください",
  COMMON_INVALID_FIELD_PATCH: "変更した項目がありません",
  COMMON_INVALID_INPUT: "入力内容が正しくありません",
  COMMON_PUBLICATION_INVALID_TRANSITION:
    "公開状態が変わっています。最新の状態を確かめてください",
  OPTIMISTIC_LOCK_FAILURE:
    "ほかの人が先に保存しました。最新の内容を読み直してから、もう一度操作してください",
  UNIQUE_VIOLATION: "すでに登録されています",
  LOGIN_REQUIRED: "ログインが必要です",
  DEV_TOOLS_DISABLED: "この機能は使えません",
};

const FALLBACK: Readonly<Record<ErrorState["kind"], string>> = {
  invalidInput: "入力内容を確かめてください",
  premiseChanged: "状態が変わったため、操作できませんでした",
  conflict: MESSAGES.OPTIMISTIC_LOCK_FAILURE ?? "",
  loginRequired: "ログインが必要です",
  forbidden: "この操作を行う権限がありません",
  notFound: "表示できません",
  failed: "通信エラーが発生しました。時間をおいて、もう一度お試しください",
};

function messageFor(kind: ErrorState["kind"], code: string | null): string {
  return (code !== null ? MESSAGES[code] : undefined) ?? FALLBACK[kind];
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
      };
    case "business":
      if (code !== null && INVALID_VALUE_CODE.test(code)) {
        return {
          kind: "invalidInput",
          code,
          message: messageFor("invalidInput", code),
          fieldErrors: {},
        };
      }
      return {
        kind: "premiseChanged",
        code,
        message: messageFor("premiseChanged", code),
      };
    case "conflict":
      return { kind: "conflict", code, message: messageFor("conflict", code) };
    case "unauthorized":
      return {
        kind: "loginRequired",
        code,
        message: messageFor("loginRequired", code),
      };
    case "forbidden":
      return {
        kind: "forbidden",
        code,
        message: messageFor("forbidden", code),
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
