"use client";

import { AuthorityErrorCode } from "@repo/core/domain/authority/errorCode";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import type { StewardedKind } from "@repo/core/domain/common/refs";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { inviteMemberFn, MEMBER_WORDS } from "@/presentation/members";
import { newId } from "@/presentation/newId";
import { useReconcile } from "@/presentation/reconcile";

/** Why an address was not invited, known before or after sending. */
type Refusal =
  | Readonly<{ kind: "alreadySteward"; email: string }>
  | Readonly<{ kind: "alreadyInvited"; email: string }>
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
  switch (refusal.kind) {
    case "alreadySteward":
      return `${refusal.email} は、すでに${targetName}の${role}です。招待は送りません。`;
    case "alreadyInvited":
      return `${refusal.email} には、承諾前の招待がすでにあります。招待は重ねて送りません。`;
    case "error": {
      const { error } = refusal;
      if (error.code === AuthorityErrorCode.AlreadySteward) {
        return `${refusal.email} は、すでに${targetName}の${role}です。招待は送りません。`;
      }
      if (error.code === AuthorityErrorCode.InvitationAlreadyPending) {
        return `${refusal.email} には、承諾前の招待がすでにあります。招待は重ねて送りません。`;
      }
      if (error.kind !== "invalidInput") return undefined;
      if (error.code === CommonErrorCode.InvalidEmailAddress) {
        return "メールアドレスの形式が正しくありません。「name@example.com」の形で入力してください。";
      }
      return error.fieldErrors.email?.[0] ?? error.message;
    }
  }
}

/**
 * CM-02's 招待する: the pending invitation shows at once in the owner's
 * list (`onOptimisticAdd`) and gives way to the server's row when the
 * invitation reconciles. An address that already manages the target or
 * already has a pending invitation is refused without sending.
 */
export function InviteForm({
  kind,
  targetId,
  targetName,
  stewardEmails,
  invitedEmails,
  onAttempt,
  onOptimisticAdd,
  onInvited,
  onForbidden,
}: {
  kind: StewardedKind;
  targetId: string;
  targetName: string;
  stewardEmails: readonly string[];
  invitedEmails: readonly string[];
  /** A send starts: the previous outcome no longer describes the board. */
  onAttempt: () => void;
  onOptimisticAdd: (invitationId: string, email: string) => void;
  onInvited: (email: string) => void;
  onForbidden: () => void;
}) {
  const words = MEMBER_WORDS[kind];
  const reconcile = useReconcile();
  const [email, setEmail] = useState("");
  // The send whose outcome is not known to be final. A failed send may have
  // been stored with only its answer lost, so sending the same address
  // again reuses the id and `inviteMember` answers it as a replay.
  const attempt = useRef<{ id: string; email: string } | null>(null);
  const [state, invite, inviting] = useActionState(
    async (_previous: FormState, form: FormData): Promise<FormState> => {
      const typed = String(form.get("email") ?? "").trim();
      onAttempt();
      if (stewardEmails.some((known) => sameAddress(known, typed))) {
        return {
          email: typed,
          refusal: { kind: "alreadySteward", email: typed },
        };
      }
      if (invitedEmails.some((known) => sameAddress(known, typed))) {
        return {
          email: typed,
          refusal: { kind: "alreadyInvited", email: typed },
        };
      }
      if (attempt.current?.email !== typed) {
        attempt.current = { id: newId(), email: typed };
      }
      const { id } = attempt.current;
      try {
        if (typed !== "") onOptimisticAdd(id, typed);
        await inviteMemberFn({
          data: { kind, id: targetId, invitationId: id, email: typed },
        });
        attempt.current = null;
        setEmail("");
        onInvited(typed);
        await reconcile();
        return { email: typed, refusal: null };
      } catch (error) {
        const classified = classifyError(error);
        if (classified.kind !== "failed") attempt.current = null;
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
  // A refused address takes the focus back, so the message wired with
  // `aria-describedby` is read out.
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
    <form action={invite} className="m-section" noValidate>
      {bandError === null ? null : (
        <Alert title="招待を送れませんでした">
          {bandError.kind === "failed"
            ? "通信を確かめて、もう一度送ってください。入力したメールアドレスは残っています。"
            : bandError.message}
        </Alert>
      )}
      <Field
        id="cm02-invite"
        label="招待する相手のメールアドレス"
        help={`招待にサービス運営者の承認は要りません。相手が承諾すると、${targetName}の${words.role}になります。承諾前の招待があるメールアドレスには、重ねて送りません。`}
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
            <Button type="submit" disabled={inviting}>
              {inviting ? "送っています…" : "招待を送る"}
            </Button>
          </div>
        )}
      </Field>
    </form>
  );
}
