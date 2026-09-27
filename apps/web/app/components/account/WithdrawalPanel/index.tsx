"use client";

import { AuthorityErrorCode } from "@repo/core/domain/authority/errorCode";
import type { StewardedKind } from "@repo/core/domain/common/refs";
import { useState, useTransition } from "react";
import {
  ManageBackLink,
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageSection,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { type WithdrawalView, withdrawFn } from "@/presentation/withdrawal";

/** What the last attempt to withdraw ended in; `null` before any. */
type Outcome =
  | Readonly<{ kind: "failed"; error: ErrorState }>
  | Readonly<{ kind: "cannot" }>
  | Readonly<{ kind: "withdrawn" }>
  | Readonly<{ kind: "sessionLost" }>;

const KIND_LABELS = {
  place: "店舗",
  region: "地域",
  occasion: "イベント",
} as const satisfies Record<StewardedKind, string>;

/** `spec/scenario/index.md` 「管理者不在」, per kind of target. */
const VACANCY_CONSEQUENCES = {
  place:
    "公開は続きます。掲載は下書きを含めてサービス運営者の管理下に入り、店舗管理者として行った確認中・差し戻しの申請は失効します。",
  region:
    "公開は続きます。サービス運営者が地域の運営者になり、所属の申請を判断します。",
  occasion:
    "公開は続きます。サービス運営者がイベントの運営者になり、参加の申請を判断します。",
} as const satisfies Record<StewardedKind, string>;

const UNNAMED = "名称未設定";

function Title({ back }: { back: boolean }) {
  return (
    <ManageTitle>
      {back ? <ManageBackLink to="/me">マイページ</ManageBackLink> : null}
      <ManageHeading>退会</ManageHeading>
    </ManageTitle>
  );
}

function Finished({ phase }: { phase: "withdrawn" | "sessionLost" }) {
  return (
    <ManagePage title={<Title back={false} />}>
      {phase === "withdrawn" ? (
        <DonePanel
          title="退会しました"
          actions={<ButtonLink to="/">みつけるへ</ButtonLink>}
        >
          アカウントはなくなり、ログインしていない状態になりました。これまでのご利用、ありがとうございました。同じメールアドレスでログインすると、新しいアカウントとして始まります。
        </DonePanel>
      ) : (
        <DonePanel
          title="ログインしていない状態になっていました"
          actions={<ButtonLink to="/">みつけるへ</ButtonLink>}
        >
          退会の操作は行っていません。別の端末で退会が先に済んでいたか、ログインが切れています。同じメールアドレスでログインすると、新しいアカウントとして始まります。
        </DonePanel>
      )}
    </ManagePage>
  );
}

function Cannot() {
  return (
    <ManagePage title={<Title back />}>
      <ManageBody>
        <div role="alert">
          <EmptyPanel
            title="いまは退会できません"
            actions={
              <>
                <ButtonLink to="/ops/roles" search={{ from: "withdraw" }}>
                  役割の管理へ
                </ButtonLink>
                <ButtonLink variant="secondary" to="/me">
                  マイページへ戻る
                </ButtonLink>
              </>
            }
          >
            あなたは Lunt
            のただ1人のサービス運営者です。サービス運営者がいなくなると、申請の判断や申立ての対応を行う人がいなくなるため、退会できません。別の利用者にサービス運営者の役割を付与してから、退会してください。
          </EmptyPanel>
        </div>
      </ManageBody>
    </ManagePage>
  );
}

function failureMessage(error: ErrorState): string {
  return error.kind === "failed"
    ? "通信エラーのため、退会は成立していません。アカウントは変わっていません。通信を確かめて、もう一度退会してください。"
    : error.kind === "conflict"
      ? "退会の途中で、管理権限や役割が変わりました。退会は成立していません。内容を確かめて、もう一度退会してください。"
      : `${error.message}。退会は成立していません。`;
}

/**
 * MY-07 退会: what withdrawing does, the confirmation (CS-12), and the
 * states after it. A successful withdrawal ends the session; the screen
 * then stays on its completion instead of reloading into CS-04.
 */
export function WithdrawalPanel({ view }: { view: WithdrawalView }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (outcome?.kind === "withdrawn" || outcome?.kind === "sessionLost") {
    return <Finished phase={outcome.kind} />;
  }
  if (!view.canWithdraw || outcome?.kind === "cannot") return <Cannot />;

  const confirm = () =>
    startTransition(async () => {
      try {
        const { kind } = await withdrawFn();
        setConfirming(false);
        setOutcome({ kind });
      } catch (error) {
        const classified = classifyError(error);
        setConfirming(false);
        setOutcome(
          classified.code === AuthorityErrorCode.LastOperator
            ? { kind: "cannot" }
            : { kind: "failed", error: classified },
        );
      }
    });

  const vacatedNames = view.vacates.map((target) => target.name ?? UNNAMED);

  return (
    <ManagePage
      title={<Title back />}
      actions={
        <>
          <Button onClick={() => setConfirming(true)} disabled={pending}>
            退会する
          </Button>
          <ButtonLink variant="secondary" to="/me">
            やめる
          </ButtonLink>
        </>
      }
    >
      <ManageBody>
        {outcome?.kind === "failed" ? (
          <Alert title="退会できませんでした">
            {failureMessage(outcome.error)}
          </Alert>
        ) : null}
        <p className="my-lead">
          {view.email}{" "}
          のアカウントを退会します。退会すると、次のことが起きます。
        </p>
        <ManageSection id="withdraw-lose" title="なくなるもの">
          <ul className="my-points">
            <li>アカウントの保存（保存した掲載・店舗）</li>
            <li>店舗・地域・イベントの管理権限</li>
            <li>編集担当者とサービス運営者の役割</li>
          </ul>
        </ManageSection>
        <ManageSection id="withdraw-applications" title="申請と公開済みの内容">
          <ul className="my-points">
            <li>
              個人として行った確認中・差し戻しの申請は、取り下げになります。
            </li>
            <li>
              店舗管理者として行った申請は取り下げにならず、その店舗のほかの店舗管理者が引き続き扱います。
            </li>
            <li>
              公開済みの掲載・店舗情報・読みものなどは、そのまま残ります。
            </li>
            <li>
              <span className="my-strong">退会は取り消せません。</span>
              同じメールアドレスでログインすると、新しいアカウントとして始まります。
            </li>
          </ul>
        </ManageSection>
        {view.vacates.length === 0 ? null : (
          <ManageSection id="withdraw-vacates" title="管理者がいなくなる対象">
            <p className="my-lead">
              あなたが最後の管理者です。後任の承諾を待たずに退会でき、承諾前の招待は退会の後も有効です。
            </p>
            <div className="my07-orphans">
              {view.vacates.map((target) => (
                <div
                  className="my07-orphan"
                  key={`${target.kind}:${target.id}`}
                >
                  <p className="my07-orphan__head">
                    <Badge>{KIND_LABELS[target.kind]}</Badge>
                    <span className="my07-orphan__name">
                      {target.name ?? UNNAMED}
                    </span>
                  </p>
                  <p className="my07-orphan__body">
                    {VACANCY_CONSEQUENCES[target.kind]}
                  </p>
                </div>
              ))}
            </div>
          </ManageSection>
        )}
      </ManageBody>
      <ConfirmDialog
        open={confirming}
        title="退会しますか"
        confirmLabel={pending ? "退会しています…" : "退会する"}
        pending={pending}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      >
        <p>退会は取り消せません。確定すると、次のようになります。</p>
        <ul>
          <li>保存、管理権限、役割がなくなります</li>
          <li>個人として行った確認中・差し戻しの申請は取り下げになります</li>
          {vacatedNames.length === 0 ? null : (
            <li>{vacatedNames.join(" と ")} は、管理者がいなくなります</li>
          )}
          <li>ログインしていない状態になります</li>
        </ul>
      </ConfirmDialog>
    </ManagePage>
  );
}
