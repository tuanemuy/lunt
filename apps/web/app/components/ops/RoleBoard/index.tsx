"use client";

import { AuthorityErrorCode } from "@repo/core/domain/authority/errorCode";
import type { Role } from "@repo/core/domain/authority/role";
import { useOptimistic, useState, useTransition } from "react";
import { ManageBody } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/ChipButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError } from "@/presentation/errorState";
import { useReconcile } from "@/presentation/reconcile";
import {
  type RoleHolderItem,
  type RoleHoldersView,
  revokeRoleFn,
} from "@/presentation/roles";
import { GrantRoleForm } from "./GrantRoleForm";
import { ROLE_WORDS } from "./words";

type Holder = RoleHolderItem & Readonly<{ pending?: boolean }>;
type Holders = Readonly<Record<Role, readonly Holder[]>>;

type OptimisticAction =
  | Readonly<{ type: "add"; role: Role; holder: Holder }>
  | Readonly<{ type: "remove"; role: Role; accountId: string }>;

function applyAction(current: Holders, action: OptimisticAction): Holders {
  const list = current[action.role];
  switch (action.type) {
    case "add":
      // A reconcile may land the real row under a still-pending add.
      return list.some((holder) => holder.email === action.holder.email)
        ? current
        : { ...current, [action.role]: [...list, action.holder] };
    case "remove":
      return {
        ...current,
        [action.role]: list.filter(
          (holder) => holder.accountId !== action.accountId,
        ),
      };
  }
}

/** The outcome of the last operation, shown above the lists (CS-13 / CS-08…). */
type Outcome =
  | Readonly<{ kind: "granted"; role: Role; email: string }>
  | Readonly<{ kind: "revoked"; role: Role; email: string }>
  | Readonly<{ kind: "notHeld"; role: Role; email: string }>
  | Readonly<{ kind: "lastOperator" }>
  | Readonly<{ kind: "failed"; role: Role; message: string }>;

type Revocation = Readonly<{ role: Role; holder: Holder; last: boolean }>;

function RevokeDialogBody({ revocation }: { revocation: Revocation }) {
  const { role, holder, last } = revocation;
  if (role === "operator" && holder.isSelf) {
    return (
      <ul>
        <li>あなたは、サービス運営の操作を行えなくなります</li>
        <li>マイページに、運営の入口が示されなくなります</li>
        <li>
          店舗・地域・イベントの管理権限と、編集担当者の任命は変わりません
        </li>
      </ul>
    );
  }
  if (role === "operator") {
    return (
      <ul>
        <li>この利用者は、サービス運営の操作を行えなくなります</li>
        <li>
          この利用者の店舗・地域・イベントの管理権限と、編集担当者の任命は変わりません
        </li>
      </ul>
    );
  }
  if (last) {
    return (
      <>
        <p>{holder.email} は、最後の編集担当者です。</p>
        <ul>
          <li>この利用者は、読みもの編集を行えなくなります</li>
          <li>読みものは、いまの公開状態のまま残ります</li>
          <li>編集担当者がいない間は、誰も読みものを扱えません</li>
          <li>紹介先の変化の通知は、誰にも届きません</li>
        </ul>
      </>
    );
  }
  return (
    <ul>
      <li>
        この利用者は、読みものの作成・編集・公開・取り下げを行えなくなります
      </li>
      <li>この利用者が作成した読みものは、そのまま残ります</li>
    </ul>
  );
}

function revokeTitle({ role, holder, last }: Revocation): string {
  if (role === "operator") {
    return holder.isSelf
      ? "自分のサービス運営者の役割を解除しますか"
      : `${holder.email} のサービス運営者の役割を解除しますか`;
  }
  return last
    ? "最後の編集担当者の任命を解きますか"
    : `${holder.email} の任命を解きますか`;
}

function OutcomeBand({ outcome }: { outcome: Outcome }) {
  switch (outcome.kind) {
    case "granted":
      return (
        <div role="status">
          <Notice
            variant="manage"
            title={ROLE_WORDS[outcome.role].granted(outcome.email)}
          >
            {ROLE_WORDS[outcome.role].grantedBody}
          </Notice>
        </div>
      );
    case "revoked":
      return (
        <div role="status">
          <Notice
            variant="manage"
            title={ROLE_WORDS[outcome.role].revoked(outcome.email)}
          >
            {ROLE_WORDS[outcome.role].revokedBody}
          </Notice>
        </div>
      );
    case "notHeld":
      return (
        <Alert
          title={`${outcome.email} は、すでに${ROLE_WORDS[outcome.role].name}ではありません`}
        >
          別のサービス運営者が先に解除していたか、退会していました。操作は反映していません。最新の一覧を示しています。
        </Alert>
      );
    case "failed":
      return (
        <Alert title={ROLE_WORDS[outcome.role].revokeFailed}>
          {outcome.message}
        </Alert>
      );
    case "lastOperator":
      return null;
  }
}

/**
 * OM-07 役割の管理: the editors and operators, with appointment, grant and
 * revocation. Owns both lists, since granting and revoking change their
 * membership: the forms and the revocations dispatch into one optimistic
 * state, and every change reconciles with the server.
 */
export function RoleBoard({
  holders,
  fromWithdrawal,
}: {
  holders: RoleHoldersView;
  fromWithdrawal: boolean;
}) {
  const reconcile = useReconcile();
  const [optimistic, applyOptimistic] = useOptimistic<
    Holders,
    OptimisticAction
  >(holders, applyAction);
  const [revoking, startRevoke] = useTransition();
  const [revocation, setRevocation] = useState<Revocation | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [selfRevoked, setSelfRevoked] = useState(false);

  if (selfRevoked) {
    return (
      <ManageBody>
        <EmptyPanel
          title="サービス運営者の役割を解除しました"
          actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
        >
          あなたはサービス運営者ではなくなったため、サービス運営の画面は操作できません。マイページには、運営の入口が示されなくなります。
        </EmptyPanel>
      </ManageBody>
    );
  }

  const startRevocation = (role: Role, holder: Holder) => {
    const list = optimistic[role];
    if (role === "operator" && list.length <= 1) {
      setOutcome({ kind: "lastOperator" });
      return;
    }
    setOutcome(null);
    setRevocation({ role, holder, last: list.length === 1 });
  };

  const confirmRevocation = () => {
    if (revocation === null) return;
    const { role, holder } = revocation;
    setRevocation(null);
    startRevoke(async () => {
      applyOptimistic({ type: "remove", role, accountId: holder.accountId });
      try {
        await revokeRoleFn({ data: { role, accountId: holder.accountId } });
        if (role === "operator" && holder.isSelf) {
          setSelfRevoked(true);
          return;
        }
        setOutcome({ kind: "revoked", role, email: holder.email });
        await reconcile();
      } catch (error) {
        const classified = classifyError(error);
        if (classified.code === AuthorityErrorCode.RoleNotHeld) {
          setOutcome({ kind: "notHeld", role, email: holder.email });
          await reconcile();
        } else if (classified.code === AuthorityErrorCode.LastOperator) {
          setOutcome({ kind: "lastOperator" });
          await reconcile();
        } else {
          setOutcome({ kind: "failed", role, message: classified.message });
        }
      }
    });
  };

  const justGranted = outcome?.kind === "granted" ? outcome : null;

  return (
    <ManageBody aria-busy={revoking}>
      <p className="my-lead">
        編集担当者とサービス運営者を、メールアドレスで示します。相手の承諾は要らず、確定した時点で効きます。店舗・地域・イベントの管理権限は、それぞれのメンバーの管理で扱います。
      </p>
      {fromWithdrawal ? (
        <Notice
          variant="manage"
          tone="paper"
          title="退会の前に、サービス運営者の役割を付与してください"
          actions={<TextLink to="/me/withdraw">退会へ戻る</TextLink>}
        >
          サービス運営者はあなた1人だけです。別の利用者にサービス運営者の役割を付与してから、退会へ戻って退会します。
        </Notice>
      ) : null}
      {outcome === null ? null : <OutcomeBand outcome={outcome} />}
      {(["editor", "operator"] as const).map((role, index) => {
        const words = ROLE_WORDS[role];
        const list = optimistic[role];
        return (
          <div key={role} className="contents">
            {index === 0 ? null : <hr className="m-divider" />}
            <section className="m-section" aria-labelledby={`role-${role}`}>
              <div className="om-count">
                <SectionTitle variant="manage" id={`role-${role}`}>
                  {words.name}
                </SectionTitle>
                <Badge tone={list.length === 0 ? "muted" : "neutral"}>
                  {list.length}人
                </Badge>
              </div>
              {role === "operator" && outcome?.kind === "lastOperator" ? (
                <Alert title="解除できません">
                  サービス運営者が1人だけのため、解除できません。別の利用者にサービス運営者の役割を付与してから、やり直してください。
                </Alert>
              ) : null}
              {list.length === 0 ? (
                <Notice
                  variant="manage"
                  tone="paper"
                  title="編集担当者はいません"
                  actions={
                    <a className="text-button" href={`#grant-${role}`}>
                      編集担当者を任命する
                    </a>
                  }
                >
                  編集担当者がいない間は、読みものを扱えず、紹介先の変化の通知も誰にも届きません。既存のアカウントのメールアドレスで任命します。
                </Notice>
              ) : (
                <ul className="om07-people">
                  {list.map((holder) => (
                    <li className="om07-person" key={holder.accountId}>
                      <span className="om07-person__mail">
                        {holder.email}
                        {holder.isSelf ? (
                          <Badge tone="accent">あなた</Badge>
                        ) : null}
                        {justGranted?.role === role &&
                        justGranted.email === holder.email ? (
                          <Badge tone="accent">{words.grantedBadge}</Badge>
                        ) : null}
                      </span>
                      <ChipButton
                        disabled={holder.pending === true || revoking}
                        onClick={() => startRevocation(role, holder)}
                      >
                        {words.revoke}
                      </ChipButton>
                    </li>
                  ))}
                </ul>
              )}
              {role === "operator" ? (
                <p className="m-field__help">
                  2人以上いる間は、自分自身も解除できます。1人だけの間は解除できません。
                </p>
              ) : null}
              <GrantRoleForm
                role={role}
                onOptimisticAdd={(email) => {
                  setOutcome(null);
                  applyOptimistic({
                    type: "add",
                    role,
                    holder: {
                      accountId: `pending:${email}`,
                      email,
                      isSelf: false,
                      pending: true,
                    },
                  });
                }}
                onGranted={(email) =>
                  setOutcome({ kind: "granted", role, email })
                }
              />
            </section>
          </div>
        );
      })}
      <ConfirmDialog
        open={revocation !== null}
        title={revocation === null ? "" : revokeTitle(revocation)}
        confirmLabel={
          revocation === null ? "" : ROLE_WORDS[revocation.role].revoke
        }
        onConfirm={confirmRevocation}
        onCancel={() => setRevocation(null)}
      >
        {revocation === null ? null : (
          <RevokeDialogBody revocation={revocation} />
        )}
      </ConfirmDialog>
    </ManageBody>
  );
}
