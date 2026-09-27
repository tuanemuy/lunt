"use client";

import { AuthorityErrorCode } from "@repo/core/domain/authority/errorCode";
import type { Role } from "@repo/core/domain/authority/role";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { useReconcile } from "@/presentation/reconcile";
import { grantRoleFn } from "@/presentation/roles";
import { ROLE_WORDS } from "./words";

type FormState = Readonly<{ email: string; error: ErrorState | null }>;

function fieldErrorOf(
  role: Role,
  email: string,
  error: ErrorState | null,
): string | undefined {
  if (error === null) return undefined;
  if (error.kind === "notFound") return ROLE_WORDS[role].noAccount;
  if (error.kind !== "invalidInput") return undefined;
  if (error.code === AuthorityErrorCode.RoleAlreadyHeld) {
    return `${email} は、すでに${ROLE_WORDS[role].name}です。何も変わっていません。`;
  }
  if (error.code === CommonErrorCode.InvalidEmailAddress) {
    return "メールアドレスの形式が正しくありません。";
  }
  return error.fieldErrors.email?.[0] ?? error.message;
}

/**
 * OM-07's appointment / grant by email address. The new holder shows at
 * once in the owner's list (`onOptimisticAdd`) and gives way to the
 * server's row when the grant reconciles.
 */
export function GrantRoleForm({
  role,
  onOptimisticAdd,
  onGranted,
}: {
  role: Role;
  onOptimisticAdd: (email: string) => void;
  onGranted: (email: string) => void;
}) {
  const words = ROLE_WORDS[role];
  const reconcile = useReconcile();
  const [email, setEmail] = useState("");
  const [state, grant, granting] = useActionState(
    async (_previous: FormState, form: FormData): Promise<FormState> => {
      const typed = String(form.get("email") ?? "").trim();
      try {
        onOptimisticAdd(typed);
        await grantRoleFn({ data: { role, email: typed } });
        setEmail("");
        onGranted(typed);
        await reconcile();
        return { email: typed, error: null };
      } catch (error) {
        return { email: typed, error: classifyError(error) };
      }
    },
    { email: "", error: null },
  );

  const fieldError = fieldErrorOf(role, state.email, state.error);
  const input = useRef<HTMLInputElement>(null);
  // A rejected address (CS-10, no account, already held) takes the focus
  // back, so the message wired with `aria-describedby` is read out.
  useEffect(() => {
    const { error } = state;
    if (error?.kind === "invalidInput" || error?.kind === "notFound") {
      input.current?.focus();
    }
  }, [state]);
  const bandError =
    state.error !== null && fieldError === undefined ? state.error : null;
  const inputId = `grant-${role}`;

  return (
    <form action={grant} className="om07-form" noValidate>
      {bandError === null ? null : (
        <Alert title={words.grantFailed}>
          {bandError.kind === "failed"
            ? words.grantFailedBody
            : bandError.message}
        </Alert>
      )}
      <Field
        id={inputId}
        label={words.grantLabel}
        help={words.grantHelp}
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
              autoComplete="off"
              placeholder="例: name@example.jp"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={granting}>
              {granting ? words.granting : words.grant}
            </Button>
          </div>
        )}
      </Field>
    </form>
  );
}
