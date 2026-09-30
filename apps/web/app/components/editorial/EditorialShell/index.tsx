"use client";

import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useTransition } from "react";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageShell,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { TextLink } from "@/components/ui/TextButton";
import { EDITORIAL_HOME } from "@/presentation/editorialView";
import type { ErrorState } from "@/presentation/errorState";

/**
 * The frame of the editorial screens (AM-01, AM-02, CM-03 of an article):
 * the brand band labelled 読みもの編集, no management nav — the area starts
 * from AM-01 and every screen leads back to it
 * (「読みもの編集とサービス運営のナビゲーション」).
 */
export function EditorialShell({ children }: { children: ReactNode }) {
  return (
    <ManageShell context="読みもの編集" homeTo={EDITORIAL_HOME} solo>
      {children}
    </ManageShell>
  );
}

/** AM-02's and CM-03's way back to AM-01, in the title band. */
export function BackToList() {
  return (
    <TextLink to={EDITORIAL_HOME} className="am02-back">
      読みものの一覧へ戻る
    </TextLink>
  );
}

/** A title band with the way back to AM-01 and the heading. */
export function EditorialTitle({
  heading,
  back = true,
  children,
}: {
  heading: string;
  back?: boolean;
  children?: ReactNode;
}) {
  return (
    <ManageTitle>
      {back ? <BackToList /> : null}
      <ManageHeading>{heading}</ManageHeading>
      {children}
    </ManageTitle>
  );
}

/**
 * CS-05 of the editorial area: not an editor — on opening, or at the
 * moment of saving once the role was revoked (then nothing was applied).
 */
export function NotEditorPanel({
  heading = "読みもの",
  lost = false,
}: {
  heading?: string;
  lost?: boolean;
}) {
  return (
    <ManagePage title={<EditorialTitle heading={heading} back={false} />}>
      <ManageBody>
        <FocusOnMount {...(lost ? { role: "alert" as const } : {})}>
          <EmptyPanel
            title="編集担当者ではありません"
            actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
          >
            {lost
              ? "読みもの編集は、編集担当者に任命された人だけが行えます。編集担当者の任命が解除されたため、保存していない変更は反映していません。"
              : "読みもの編集は、編集担当者に任命された人だけが行えます。"}
          </EmptyPanel>
        </FocusOnMount>
      </ManageBody>
    </ManagePage>
  );
}

/** CS-17 of AM-02 and CM-03: the article opened does not exist. */
export function MissingArticlePanel({
  applied,
}: {
  /** What was not done, when an operation found it missing. */
  applied?: string;
}) {
  return (
    <ManagePage title={<EditorialTitle heading="読みもの" />}>
      <ManageBody>
        <FocusOnMount
          {...(applied === undefined ? {} : { role: "alert" as const })}
        >
          <EmptyPanel
            title="この読みものはありません"
            actions={
              <ButtonLink to={EDITORIAL_HOME}>読みものの一覧へ戻る</ButtonLink>
            }
          >
            {`開いた読みものは存在しません。${applied ?? ""}読みものの一覧から選び直してください。`}
          </EmptyPanel>
        </FocusOnMount>
      </ManageBody>
    </ManagePage>
  );
}

function Retry() {
  const router = useRouter();
  const [pending, startRetry] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startRetry(async () => {
          await router.invalidate({ sync: true });
        })
      }
    >
      {pending ? "読み込んでいます…" : "もう一度読み込む"}
    </Button>
  );
}

/**
 * A body that could not be read: CS-05 (the role was revoked after the
 * area's guard), CS-17 (the article does not exist), or CS-02 with a
 * retry.
 */
export function EditorialProblem({
  kind,
  heading,
}: {
  kind: ErrorState["kind"];
  heading: string;
}) {
  if (kind === "forbidden") return <NotEditorPanel heading={heading} />;
  if (kind === "notFound") return <MissingArticlePanel />;
  return (
    <ManagePage title={<EditorialTitle heading={heading} />}>
      <ManageBody>
        <div role="alert">
          <Alert title="読みものを読み込めませんでした" actions={<Retry />}>
            通信を確かめて、もう一度読み込んでください。
          </Alert>
        </div>
      </ManageBody>
    </ManagePage>
  );
}
