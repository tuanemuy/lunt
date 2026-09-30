"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { devAppointPlaceStewardFn } from "@/presentation/devStewards";
import { classifyError } from "@/presentation/errorState";

type State =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "done"; email: string }>
  | Readonly<{ kind: "failed"; message: string }>;

/**
 * Development tool: give a store a steward the way approving a stewardship
 * claim does, without the application. The store id is the one in `/places/$placeId` or
 * `/manage/places/$placeId`.
 */
export function DevStewards() {
  const [state, appoint, pending] = useActionState(
    async (_: State, form: FormData): Promise<State> => {
      const placeId = String(form.get("placeId") ?? "");
      const email = String(form.get("email") ?? "");
      try {
        await devAppointPlaceStewardFn({ data: { placeId, email } });
        return { kind: "done", email };
      } catch (error) {
        const state = classifyError(error);
        return {
          kind: "failed",
          message:
            state.code === null
              ? state.message
              : `${state.message}（${state.code}）`,
        };
      }
    },
    { kind: "idle" },
  );
  return (
    <form action={appoint} className="m-form" aria-label="店舗管理者を入れる">
      <Field id="dev-steward-place" label="店舗の ID">
        {(control) => (
          <Input
            {...control}
            name="placeId"
            required
            placeholder="例: 01a0e553-ba58-73ed-9cfd-785fc31a48f7"
          />
        )}
      </Field>
      <Field
        id="dev-steward-email"
        label="店舗管理者にするアカウントのメールアドレス"
      >
        {(control) => <Input {...control} name="email" type="email" required />}
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "入れています…" : "店舗管理者にする"}
      </Button>
      <div aria-live="polite">
        {state.kind === "done" ? (
          <p>{state.email} を店舗管理者にしました。</p>
        ) : null}
        {state.kind === "failed" ? <Alert title={state.message} /> : null}
      </div>
    </form>
  );
}
