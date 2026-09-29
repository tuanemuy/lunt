"use client";

import { AuthorityErrorCode } from "@repo/core/domain/authority/errorCode";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { grantStewardshipFn, MEMBER_WORDS } from "@/presentation/members";
import { useReconcile } from "@/presentation/reconcile";

type Refusal =
  | Readonly<{ kind: "alreadySteward"; email: string }>
  | Readonly<{ kind: "error"; email: string; error: ErrorState }>;

type FormState = Readonly<{ email: string; refusal: Refusal | null }>;

const sameAddress = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase();

function fieldErrorOf(
  refusal: Refusal | null,
  targetName: string,
  role: string,
): string | undefined {
  if (refusal === null) return undefined;
  if (refusal.kind === "alreadySteward") {
    return `${refusal.email} は、すでに${targetName}の${role}です。付与しません。`;
  }
  const { error } = refusal;
  if (error.code === AuthorityErrorCode.AlreadySteward) {
    return `${refusal.email} は、すでに${targetName}の${role}です。付与しません。`;
  }
  if (error.code === "ACCOUNT_NOT_FOUND") {
    return `${refusal.email} のアカウントはありません。付与は、Lunt のアカウントを持つ利用者にだけ行えます。`;
  }
  if (error.kind !== "invalidInput") return undefined;
  if (error.code === CommonErrorCode.InvalidEmailAddress) {
    return "メールアドレスの形式が正しくありません。「name@example.com」の形で入力してください。";
  }
  return error.fieldErrors.email?.[0] ?? error.message;
}

/**
 * CM-02's 付与 (regions and events only): an operator names an existing
 * account by its address and it becomes a manager at once, without
 * consent. The new manager shows at once in the owner's list
 * (`onOptimisticAdd`) and gives way to the server's row on reconcile. An
 * address that already manages the target is refused without sending.
 */
export function GrantForm({
  kind,
  targetId,
  targetName,
  stewardEmails,
  onAttempt,
  onOptimisticAdd,
  onGranted,
  onForbidden,
}: {
  kind: "region" | "occasion";
  targetId: string;
  targetName: string;
  stewardEmails: readonly string[];
  onAttempt: () => void;
  onOptimisticAdd: (email: string) => void;
  onGranted: (email: string) => void;
  onForbidden: () => void;
}) {
  const words = MEMBER_WORDS[kind];
  const reconcile = useReconcile();
  const [email, setEmail] = useState("");
  const [state, grant, granting] = useActionState(
    async (_previous: FormState, form: FormData): Promise<FormState> => {
      const typed = String(form.get("email") ?? "").trim();
      onAttempt();
      if (stewardEmails.some((known) => sameAddress(known, typed))) {
        return {
          email: typed,
          refusal: { kind: "alreadySteward", email: typed },
        };
      }
      try {
        if (typed !== "") onOptimisticAdd(typed);
        await grantStewardshipFn({
          data: { kind, id: targetId, email: typed },
        });
        setEmail("");
        onGranted(typed);
        await reconcile();
        return { email: typed, refusal: null };
      } catch (error) {
        const classified = classifyError(error);
        if (classified.kind === "forbidden") onForbidden();
        return {
          email: typed,
          refusal: { kind: "error", email: typed, error: classified },
        };
      }
    },
    { email: "", refusal: null },
  );

  const fieldError = fieldErrorOf(state.refusal, targetName, words.role);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (fieldErrorOf(state.refusal, targetName, words.role) !== undefined) {
      input.current?.focus();
    }
  }, [state, targetName, words.role]);
  const bandError =
    state.refusal?.kind === "error" &&
    fieldError === undefined &&
    state.refusal.error.kind !== "forbidden"
      ? state.refusal.error
      : null;

  return (
    <form action={grant} className="m-section" noValidate>
      {bandError === null ? null : (
        <Alert title="管理権限を付与できませんでした">
          {bandError.kind === "failed"
            ? "通信を確かめて、もう一度付与してください。入力したメールアドレスは残っています。"
            : bandError.message}
        </Alert>
      )}
      <Field
        id="cm02-grant"
        label="管理権限を付与するアカウントのメールアドレス"
        help={`Lunt のアカウントを持つ利用者を指定します。承諾を待たずに、${targetName}の${words.role}になります。`}
        {...(fieldError === undefined ? {} : { error: fieldError })}
      >
        {(control) => (
          <div className="m-inline">
            <Input
              {...control}
              ref={input}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="例: name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type="submit" disabled={granting}>
              {granting ? "付与しています…" : "付与する"}
            </Button>
          </div>
        )}
      </Field>
    </form>
  );
}
