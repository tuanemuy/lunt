"use client";

import { useRouter } from "@tanstack/react-router";
import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { devSignInFn } from "@/presentation/devSession";
import { classifyError, type ErrorState } from "@/presentation/errorState";

type FormState = Readonly<{ email: string; error: ErrorState | null }>;

/**
 * Development tool (design.md D-07): logs in as the account of the typed
 * email address — creating it if needed — and returns to `next`. Stands
 * in for MY-02's mail and external logins until they exist.
 */
export function DevSignInForm({ next }: { next: string | undefined }) {
  const router = useRouter();
  const [state, submit, pending] = useActionState(
    async (_previous: FormState, form: FormData): Promise<FormState> => {
      const email = String(form.get("email") ?? "");
      try {
        const result = await devSignInFn({
          data: { email, ...(next === undefined ? {} : { next }) },
        });
        await router.invalidate({ sync: true });
        router.history.push(result.next);
        return { email, error: null };
      } catch (error) {
        return { email, error: classifyError(error) };
      }
    },
    { email: "", error: null },
  );

  const fieldError =
    state.error?.kind === "invalidInput"
      ? (state.error.fieldErrors.email?.[0] ?? state.error.message)
      : undefined;

  return (
    <form action={submit} className="m-form" noValidate>
      {state.error !== null && state.error.kind !== "invalidInput" ? (
        <Alert title={state.error.message} />
      ) : null}
      <Field
        id="dev-sign-in-email"
        label="メールアドレス"
        requirement="required"
        help="このアドレスのアカウントでログインします。なければ作ります。"
        {...(fieldError === undefined ? {} : { error: fieldError })}
      >
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.email}
          />
        )}
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "ログインしています…" : "開発用にログインする"}
      </Button>
    </form>
  );
}
