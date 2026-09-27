"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Field, Input } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  answerFakeIdpFn,
  type FakeIdpChoiceInput,
  type FakeIdpRequestView,
} from "@/presentation/fakeIdp";

type FormState = Readonly<{ email: string; error: ErrorState | null }>;

function choiceOf(kind: string, email: string): FakeIdpChoiceInput {
  switch (kind) {
    case "verified":
      return { kind: "verified", email };
    case "unverified":
      return { kind: "unverified", email };
    case "no_email":
      return { kind: "no_email" };
    default:
      return { kind: "cancel" };
  }
}

/**
 * Development tool (design.md D-07): the fake external provider's screen.
 * The tester picks what the provider answers; the browser then returns to
 * the app's callback exactly as it would from Google.
 */
export function FakeIdpScreen({
  query,
  view,
}: {
  query: string;
  view: FakeIdpRequestView;
}) {
  const [state, answer, answering] = useActionState(
    async (_previous: FormState, form: FormData): Promise<FormState> => {
      const email = String(form.get("email") ?? "");
      const kind = String(form.get("kind") ?? "cancel");
      try {
        const { location } = await answerFakeIdpFn({
          data: { query, choice: choiceOf(kind, email) },
        });
        window.location.assign(location);
        return { email, error: null };
      } catch (error) {
        return { email, error: classifyError(error) };
      }
    },
    { email: "", error: null },
  );

  if (view.kind === "invalid") {
    return (
      <EmptyPanel title="認可のリクエストが正しくありません">
        この画面は、MY-02 の「Google
        でログイン」から開きます。ログイン画面からやり直してください。
      </EmptyPanel>
    );
  }

  const fieldError =
    state.error?.kind === "invalidInput"
      ? (state.error.fieldErrors["choice.email"]?.[0] ?? state.error.message)
      : undefined;

  return (
    <form action={answer} className="m-form" noValidate>
      <Notice variant="manage" tone="paper" title="開発用の外部アカウント">
        Google の代わりに、この画面が提供元の答えを返します。答えたあと、
        {view.returnsTo} へ戻ります。
      </Notice>
      {state.error !== null && fieldError === undefined ? (
        <Alert title={state.error.message} />
      ) : null}
      <Field
        id="fake-idp-email"
        label="提供元が渡すメールアドレス"
        help="確認済み・未確認のどちらで渡すかを、下のボタンで選びます。"
        {...(fieldError === undefined ? {} : { error: fieldError })}
      >
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="例: name@example.jp"
            defaultValue={state.email}
          />
        )}
      </Field>
      <Button type="submit" name="kind" value="verified" disabled={answering}>
        確認済みのメールアドレスを渡す
      </Button>
      <Button
        type="submit"
        name="kind"
        value="unverified"
        variant="secondary"
        disabled={answering}
      >
        未確認のメールアドレスを渡す
      </Button>
      <Button
        type="submit"
        name="kind"
        value="no_email"
        variant="secondary"
        disabled={answering}
      >
        メールアドレスを渡さない
      </Button>
      <Button
        type="submit"
        name="kind"
        value="cancel"
        variant="secondary"
        disabled={answering}
      >
        キャンセルする（承認しない）
      </Button>
    </form>
  );
}
