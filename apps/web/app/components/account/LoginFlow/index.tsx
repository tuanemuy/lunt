"use client";

import { AccountErrorCode } from "@repo/core/domain/account/errorCode";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useActionState, useEffect, useRef, useState } from "react";
import { DevSignInForm } from "@/components/dev/DevSignInForm";
import {
  ManageBackLink,
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageSection,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink, buttonClassName } from "@/components/ui/Button";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Field, Input } from "@/components/ui/Field";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { TextButton } from "@/components/ui/TextButton";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  completeLoginByCodeFn,
  EXTERNAL_PROVIDER_LABELS,
  type ExternalLoginFailure,
  startEmailLoginFn,
} from "@/presentation/login";
import { rememberLoginReturn } from "@/presentation/loginReturn";
import { newId } from "@/presentation/newId";

/** A login mail this browser sent, whose code can still be entered here. */
type SentMail = Readonly<{ email: string; challengeId: string }>;

type Step =
  /** `focus`: the input replaces another step, so it takes the focus. */
  | Readonly<{ kind: "input"; email: string; focus: boolean }>
  | Readonly<{ kind: "code"; email: string; challengeId: string }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "success" }>;

type LoginFlowProps = {
  /** The raw `next` of the URL; the server re-checks it with `safeNextPath`. */
  next: string | undefined;
  external: ExternalLoginFailure | undefined;
  currentEmail: string | null;
  providers: readonly string[];
  devTools: boolean;
};

/**
 * MY-02 ログイン: the mail login (address → code), the external logins, and
 * the states between them. Returns to `next` once logged in (CS-04).
 */
export function LoginFlow(props: LoginFlowProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({
    kind: "input",
    email: "",
    focus: false,
  });
  const [lastSent, setLastSent] = useState<SentMail | null>(null);
  // Leaving without logging in returns to the screen the login started from
  // (TC-ACC-030). `next` is where a *finished* login goes — often a screen
  // that needs the login and would send the visitor straight back here — so
  // the way back is the browser history, or MY-01's guest state when this
  // page was opened directly.
  const leave = (event: { preventDefault: () => void }) => {
    if (!router.history.canGoBack()) return;
    event.preventDefault();
    router.history.back();
  };
  return (
    <ManagePage
      title={
        <ManageTitle>
          {step.kind === "success" ? null : (
            <ManageBackLink to="/me" onClick={leave}>
              ログインせずに戻る
            </ManageBackLink>
          )}
          <ManageHeading>ログイン</ManageHeading>
        </ManageTitle>
      }
    >
      {step.kind === "input" ? (
        <InputStep
          {...props}
          initialEmail={step.email}
          focusOnMount={step.focus}
          lastSent={lastSent}
          onSent={(sent) => {
            setLastSent(sent);
            setStep({ kind: "code", ...sent });
            // An external login's failure is history once a mail is sent;
            // drop it from the URL so it does not come back with the input.
            if (props.external !== undefined) {
              void navigate({
                to: "/login",
                search: props.next === undefined ? {} : { next: props.next },
                replace: true,
              });
            }
          }}
        />
      ) : step.kind === "code" ? (
        <CodeStep
          key={step.challengeId}
          email={step.email}
          challengeId={step.challengeId}
          next={props.next}
          devTools={props.devTools}
          onRestart={() =>
            setStep({ kind: "input", email: step.email, focus: true })
          }
          onInvalid={() => setStep({ kind: "invalid" })}
          onSuccess={() => setStep({ kind: "success" })}
        />
      ) : step.kind === "invalid" ? (
        <ManageBody>
          <FocusOnMount role="alert">
            <EmptyPanel
              title="このリンク・コードではログインできません"
              actions={
                <Button
                  onClick={() =>
                    setStep({ kind: "input", email: "", focus: true })
                  }
                >
                  メールアドレスを入力し直す
                </Button>
              }
            >
              有効期間が過ぎたか、もう一方を使って無効になったか、コードの誤入力が上限に達したため、リンクとコードはどちらも使えません。メールアドレスの入力からやり直すと、新しいリンクとコードを送ります。
            </EmptyPanel>
          </FocusOnMount>
        </ManageBody>
      ) : (
        <LoginSucceeded />
      )}
    </ManagePage>
  );
}

/** ログイン成立: shown while the browser returns to where the login started. */
export function LoginSucceeded() {
  return (
    <DonePanel
      title="ログインしました"
      actions={
        <ButtonLink variant="secondary" to="/me">
          マイページへ
        </ButtonLink>
      }
    >
      元の画面に戻ります。戻る画面がないときは、マイページを開きます。
    </DonePanel>
  );
}

const EXTERNAL_FAILURE_ALERTS = {
  no_email: {
    title: "メールアドレスを受け取れませんでした",
    body: "外部アカウントから、確認済みのメールアドレスを受け取れなかったため、ログインできませんでした。アカウントは作られていません。Lunt のログインには、確認済みのメールアドレスが必要です。メールアドレスでログインするか、別の外部アカウントを選んでください。",
  },
  failed: {
    title: "外部アカウントでログインできませんでした",
    body: "認証または承認が途中で終わったか、提供元で障害が起きています。もう一度選ぶか、メールアドレスでログインしてください。",
  },
} as const satisfies Record<
  ExternalLoginFailure,
  Readonly<{ title: string; body: string }>
>;

type SendState = Readonly<{
  email: string;
  error: ErrorState | null;
  submitted: boolean;
}>;

function emailFieldError(error: ErrorState | null): string | undefined {
  if (error?.kind !== "invalidInput") return undefined;
  const fromTransport = error.fieldErrors.email?.[0];
  if (fromTransport !== undefined) return fromTransport;
  if (error.code === CommonErrorCode.InvalidEmailAddress) {
    return "メールアドレスの形式が正しくありません。メールは送っていません。";
  }
  return error.message;
}

function externalLoginHref(provider: string, next: string | undefined) {
  const path = `/login/external/${encodeURIComponent(provider)}`;
  return next === undefined
    ? path
    : `${path}?${new URLSearchParams({ next }).toString()}`;
}

function InputStep({
  next,
  external,
  currentEmail,
  providers,
  devTools,
  initialEmail,
  focusOnMount,
  lastSent,
  onSent,
}: LoginFlowProps & {
  initialEmail: string;
  focusOnMount: boolean;
  lastSent: SentMail | null;
  onSent: (sent: SentMail) => void;
}) {
  // The send whose outcome is not known to be final. A failed send may have
  // gone out with only its answer lost, so sending the same address again
  // reuses the id and `startEmailLogin` answers it as a replay.
  const attempt = useRef<{ id: string; email: string } | null>(null);
  const [state, send, sending] = useActionState(
    async (_previous: SendState, form: FormData): Promise<SendState> => {
      const email = String(form.get("email") ?? "");
      const key = email.trim();
      if (attempt.current?.email !== key) {
        attempt.current = { id: newId(), email: key };
      }
      const { id } = attempt.current;
      try {
        await startEmailLoginFn({ data: { challengeId: id, email } });
        attempt.current = null;
        rememberLoginReturn(next);
        onSent({ email: key, challengeId: id });
        return { email, error: null, submitted: true };
      } catch (error) {
        const classified = classifyError(error);
        if (classified.kind === "conflict") attempt.current = null;
        return { email, error: classified, submitted: true };
      }
    },
    { email: initialEmail, error: null, submitted: false },
  );

  const fieldError = emailFieldError(state.error);
  const emailInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusOnMount) emailInput.current?.focus();
  }, [focusOnMount]);
  // A rejected address takes the focus back, so its message (wired with
  // `aria-describedby`) is read out.
  useEffect(() => {
    if (state.error?.kind === "invalidInput") emailInput.current?.focus();
  }, [state]);
  const failed = state.error?.kind === "failed";
  const capped = state.error?.code === AccountErrorCode.LoginRequestsExceeded;
  const otherError =
    state.error !== null && fieldError === undefined && !failed && !capped
      ? state.error.message
      : null;
  const resumable =
    capped && lastSent !== null && lastSent.email === state.email.trim()
      ? lastSent
      : null;
  const externalAlert =
    external === undefined || state.submitted
      ? null
      : EXTERNAL_FAILURE_ALERTS[external];

  return (
    <>
      <form action={send} className="m-body" noValidate>
        {currentEmail === null ? null : (
          <Notice
            variant="manage"
            tone="paper"
            title={`${currentEmail} でログイン中です`}
          >
            別のメールアドレスや外部アカウントでログインすると、このブラウザのアカウントが切り替わります。
          </Notice>
        )}
        {externalAlert === null ? null : (
          <Alert title={externalAlert.title}>{externalAlert.body}</Alert>
        )}
        {failed ? (
          <Alert title="メールを送れませんでした">
            通信を確かめて、もう一度送ってください。入力したメールアドレスは残っています。
          </Alert>
        ) : null}
        {capped ? (
          <Alert
            title="ログイン用のメールを送りませんでした"
            actions={
              resumable === null ? undefined : (
                <TextButton onClick={() => onSent(resumable)}>
                  届いたコードを入力する
                </TextButton>
              )
            }
          >
            このメールアドレスへのログイン用メールが上限に達しています。届いているメールのリンクかコードでログインするか、時間をおいて送り直してください。有効期間を過ぎたメールの分だけ、また送れるようになります。
          </Alert>
        ) : null}
        {otherError === null ? null : <Alert title={otherError} />}
        <div className="my02-block">
          <p className="my-lead">
            メールアドレスに、ログイン用のリンクとコードを送ります。パスワードは要りません。はじめての方は、ログインするとアカウントが作られます。
          </p>
          <Field
            id="login-email"
            label="メールアドレス"
            requirement="required"
            {...(fieldError === undefined ? {} : { error: fieldError })}
          >
            {(control) => (
              <Input
                {...control}
                ref={emailInput}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="例: name@example.jp"
                defaultValue={state.email}
              />
            )}
          </Field>
          <Button type="submit" disabled={sending}>
            {sending
              ? "送っています…"
              : failed
                ? "もう一度送る"
                : "ログイン用のメールを送る"}
          </Button>
        </div>
        {providers.length === 0 ? null : (
          <>
            <p className="my02-or">または</p>
            <div className="my02-block">
              {providers.map((provider) => (
                <a
                  key={provider}
                  className={buttonClassName("secondary")}
                  href={externalLoginHref(provider, next)}
                >
                  {EXTERNAL_PROVIDER_LABELS[provider] ?? provider} でログイン
                </a>
              ))}
              <p className="m-field__help">
                外部アカウントでは、提供元での認証のあと、確認済みのメールアドレスを
                Lunt
                に渡すことを承認します。同じメールアドレスなら、どの方法でも同じアカウントです。
              </p>
            </div>
          </>
        )}
      </form>
      {devTools ? (
        <ManageBody>
          <ManageSection id="login-dev" title="開発用のログイン">
            <Notice variant="manage">
              開発環境だけで使えます。メールを送らずに、入力したアドレスのアカウントでログインします。
            </Notice>
            <DevSignInForm next={next} />
          </ManageSection>
        </ManageBody>
      ) : null}
    </>
  );
}

type CodeState = Readonly<{ code: string; error: ErrorState | null }>;

function codeFieldError(error: ErrorState | null): string | undefined {
  if (error?.kind !== "invalidInput") return undefined;
  if (error.code === AccountErrorCode.LoginCodeMismatch) {
    return "コードが正しくありません。メールのコードを確かめて、入力し直してください。誤りが続くと、リンクとコードは使えなくなります。";
  }
  return error.fieldErrors.code?.[0] ?? error.message;
}

function CodeStep({
  email,
  challengeId,
  next,
  devTools,
  onRestart,
  onInvalid,
  onSuccess,
}: {
  email: string;
  challengeId: string;
  next: string | undefined;
  devTools: boolean;
  onRestart: () => void;
  onInvalid: () => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [state, verify, verifying] = useActionState(
    async (_previous: CodeState, form: FormData): Promise<CodeState> => {
      const code = String(form.get("code") ?? "");
      try {
        const result = await completeLoginByCodeFn({
          data: {
            challengeId,
            code,
            ...(next === undefined ? {} : { next }),
          },
        });
        rememberLoginReturn(undefined);
        onSuccess();
        await router.invalidate({ sync: true });
        router.history.push(result.next);
        return { code, error: null };
      } catch (error) {
        const classified = classifyError(error);
        if (
          classified.kind === "premiseChanged" &&
          classified.code === AccountErrorCode.LoginChallengeInvalid
        ) {
          onInvalid();
        }
        return { code, error: classified };
      }
    },
    { code: "", error: null },
  );

  const fieldError = codeFieldError(state.error);
  const failed =
    state.error?.kind === "failed" || state.error?.kind === "conflict";
  const otherError =
    state.error !== null &&
    fieldError === undefined &&
    !failed &&
    state.error.code !== AccountErrorCode.LoginChallengeInvalid
      ? state.error.message
      : null;
  const codeInput = useRef<HTMLInputElement>(null);
  // The code step replaces the address step: the code input takes the
  // focus, and takes it back after a rejected code.
  useEffect(() => {
    if (state.error === null || state.error.kind === "invalidInput") {
      codeInput.current?.focus();
    }
  }, [state]);

  return (
    <form action={verify} className="m-body" noValidate>
      <Notice variant="manage" title="メールを送りました">
        <span className="my02-sent">{email}</span>{" "}
        に、ログイン用のリンクとコードを送りました。
      </Notice>
      {failed ? (
        <Alert title="コードを確かめられませんでした">
          通信を確かめて、もう一度「ログインする」を選んでください。入力したコードは残っています。
        </Alert>
      ) : null}
      {otherError === null ? null : <Alert title={otherError} />}
      <div className="my02-block">
        <Field
          id="login-code"
          label="メールのコード"
          requirement="required"
          help="リンクとコードには有効期間があります。どちらか一方を使うと、もう一方は使えなくなります。"
          {...(fieldError === undefined ? {} : { error: fieldError })}
        >
          {(control) => (
            <Input
              {...control}
              ref={codeInput}
              name="code"
              className="my02-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6桁の数字"
              defaultValue={state.code}
            />
          )}
        </Field>
        <Button type="submit" disabled={verifying}>
          {verifying ? "確かめています…" : "ログインする"}
        </Button>
      </div>
      <ManageSection id="login-link" title="メールのリンクでもログインできます">
        <ul className="my-points">
          <li>メールのリンクを開くと、開いたブラウザでログインします。</li>
          <li>
            リンクをこのブラウザとは別のブラウザで開くと、そのブラウザでログインします。このブラウザで保存した掲載と店舗は、アカウントに引き継がれません。
          </li>
        </ul>
      </ManageSection>
      <div className="my-links">
        <TextButton onClick={onRestart}>
          メールアドレスを確かめて送り直す
        </TextButton>
        <TextButton onClick={onRestart}>
          外部アカウントでログインする
        </TextButton>
        {devTools ? (
          <a
            className="text-button"
            href={`/__dev/inbox?${new URLSearchParams({ to: email }).toString()}`}
            target="_blank"
            rel="noreferrer"
          >
            開発用の受信箱を開く
          </a>
        ) : null}
      </div>
    </form>
  );
}
