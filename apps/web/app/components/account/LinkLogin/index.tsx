"use client";

import { AccountErrorCode } from "@repo/core/domain/account/errorCode";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { classifyError } from "@/presentation/errorState";
import { completeLoginByLinkFn } from "@/presentation/login";
import {
  readLoginReturn,
  rememberLoginReturn,
} from "@/presentation/loginReturn";
import { LoginSucceeded } from "../LoginFlow";

type LinkState =
  | Readonly<{ kind: "checking" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "success" }>;

/**
 * MY-02, landing from the login mail's link. The token is redeemed only
 * once the page runs in the browser — a mail scanner fetching the link
 * without script leaves it usable — and without a click, so opening the
 * link is what logs in. Returns to where the login started when this
 * browser remembers it, MY-01 otherwise.
 */
export function LinkLogin({ token }: { token: string | undefined }) {
  const router = useRouter();
  const [state, setState] = useState<LinkState>(
    token === undefined ? { kind: "invalid" } : { kind: "checking" },
  );
  const started = useRef(false);
  const returnTo = useRef<string | undefined>(undefined);

  const redeem = useCallback(
    async (linkToken: string) => {
      setState({ kind: "checking" });
      const next = returnTo.current;
      try {
        const result = await completeLoginByLinkFn({
          data: { token: linkToken, ...(next === undefined ? {} : { next }) },
        });
        rememberLoginReturn(undefined);
        setState({ kind: "success" });
        await router.invalidate({ sync: true });
        router.history.replace(result.next);
      } catch (error) {
        const classified = classifyError(error);
        const invalid =
          classified.code === AccountErrorCode.LoginChallengeInvalid ||
          classified.code === AccountErrorCode.InvalidLoginSecret ||
          classified.kind === "invalidInput";
        setState({ kind: invalid ? "invalid" : "failed" });
      }
    },
    [router],
  );

  useEffect(() => {
    if (token === undefined || started.current) return;
    started.current = true;
    returnTo.current = readLoginReturn();
    void redeem(token);
  }, [token, redeem]);

  return (
    <ManagePage
      title={
        <ManageTitle>
          <ManageHeading>ログイン</ManageHeading>
        </ManageTitle>
      }
    >
      {state.kind === "success" ? (
        <LoginSucceeded />
      ) : (
        <ManageBody aria-busy={state.kind === "checking"}>
          {state.kind === "checking" ? (
            <>
              <EmptyPanel title="ログインを確かめています">
                メールのリンクを確かめています。このままお待ちください。
              </EmptyPanel>
              <div className="m-skeleton" aria-hidden="true">
                <Skeleton variant="manage" className="h-64 w-full" />
              </div>
            </>
          ) : state.kind === "failed" ? (
            <Alert
              title="ログインを確かめられませんでした"
              actions={
                token === undefined ? undefined : (
                  <Button variant="secondary" onClick={() => redeem(token)}>
                    もう一度確かめる
                  </Button>
                )
              }
            >
              通信を確かめて、もう一度お試しください。リンクはまだ使えます。
            </Alert>
          ) : (
            <div role="alert">
              <EmptyPanel
                title="このリンク・コードではログインできません"
                actions={
                  <ButtonLink to="/login">
                    メールアドレスを入力し直す
                  </ButtonLink>
                }
              >
                有効期間が過ぎたか、もう一方を使って無効になったか、コードの誤入力が上限に達したため、リンクとコードはどちらも使えません。メールアドレスの入力からやり直すと、新しいリンクとコードを送ります。
              </EmptyPanel>
            </div>
          )}
        </ManageBody>
      )}
    </ManagePage>
  );
}
