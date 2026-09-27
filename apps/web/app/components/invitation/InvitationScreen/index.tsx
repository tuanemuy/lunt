"use client";

import { AuthorityErrorCode } from "@repo/core/domain/authority/errorCode";
import type { StewardedKind } from "@repo/core/domain/common/refs";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
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
import { Button, ButtonLink } from "@/components/ui/Button";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { classifyError } from "@/presentation/errorState";
import {
  acceptInvitationFn,
  type InvitationTarget,
  type InvitationView,
  managementHomePath,
} from "@/presentation/invitation";

type KindWords = Readonly<{
  target: string;
  role: string;
  home: string;
  can: readonly string[];
  premise: string;
}>;

const WORDS: Readonly<Record<StewardedKind, KindWords>> = {
  place: {
    target: "店舗",
    role: "店舗管理者",
    home: "店舗ホームへ",
    can: [
      "店舗情報と営業状況を更新する",
      "掲載を追加・編集し、公開する",
      "店舗として地域への所属と、イベントへの参加を申請する",
      "ほかの人を店舗の管理メンバーに招待する",
    ],
    premise:
      "承諾すると、すぐに店舗管理者になります。この店舗に出している管理権限の申請は、承諾すると失効します。承諾しない間、招待はこのまま残ります。",
  },
  region: {
    target: "地域",
    role: "地域運営者",
    home: "地域の運営へ",
    can: [
      "地域情報を編集し、公開する",
      "店舗の所属・離脱の申請を判断する",
      "関連づけられたイベントを確かめる",
      "ほかの人を地域の管理メンバーに招待する",
    ],
    premise:
      "承諾すると、すぐに地域運営者になります。承諾しない間、招待はこのまま残ります。",
  },
  occasion: {
    target: "イベント",
    role: "イベント運営者",
    home: "イベントの運営へ",
    can: [
      "イベント情報を編集し、公開する",
      "店舗の参加の申請を判断する",
      "開催地域を関連づける",
      "ほかの人をイベントの管理メンバーに招待する",
    ],
    premise:
      "承諾すると、すぐにイベント運営者になります。承諾しない間、招待はこのまま残ります。",
  },
};

const displayName = (target: InvitationTarget): string =>
  target.name ?? "名称未設定";

/** The state of this visit: what the load said, or what accepting found. */
type Shown =
  | InvitationView
  | Readonly<{ status: "accepted"; target: InvitationTarget }>;

function Title() {
  return (
    <ManageTitle>
      <ManageBackLink to="/me/notifications">通知</ManageBackLink>
      <ManageHeading>管理メンバーへの招待</ManageHeading>
    </ManageTitle>
  );
}

function LoginAgain({ label }: { label: string }) {
  const here = useLocation({ select: (location) => location.href });
  return (
    <ButtonLink to="/login" search={{ next: here }}>
      {label}
    </ButtonLink>
  );
}

/**
 * MY-06 招待の承諾: the invitation's target and what its managers do, and
 * the acceptance (CS-13) — or why it cannot be accepted: another account
 * is signed in (log in with the invited address and come back), the
 * invitation was cancelled (CS-08), or the account already manages the
 * target (CS-08, onward to its management). There is no declining.
 */
export function InvitationScreen({
  invitationId,
  view,
}: {
  invitationId: string;
  view: InvitationView;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const here = useLocation({ select: (location) => location.href });
  const [shown, setShown] = useState<Shown>(view);
  const [failure, setFailure] = useState<string | null>(null);
  const [accepting, startAccept] = useTransition();

  const accept = (target: InvitationTarget) => {
    setFailure(null);
    startAccept(async () => {
      try {
        await acceptInvitationFn({
          data: { invitationId, kind: target.kind, id: target.id },
        });
        // Not `reconcile()`: reloading would read the invitation as
        // accepted (「すでに管理者」) instead of this completion. MY-01's
        // entries are read afresh on the next visit.
        router.clearCache();
        setShown({ status: "accepted", target });
      } catch (error) {
        const state = classifyError(error);
        if (state.code === AuthorityErrorCode.InvitationNotFound) {
          setShown({ status: "not_found" });
        } else if (state.code === AuthorityErrorCode.AlreadySteward) {
          setShown({ status: "already_steward", target });
        } else if (state.code === AuthorityErrorCode.InvitationEmailMismatch) {
          setShown({ status: "addressed_to_other", email: "" });
        } else if (state.kind === "loginRequired") {
          await navigate({ to: "/login", search: { next: here } });
        } else {
          setFailure(
            state.kind === "failed"
              ? "通信エラーのため、承諾は成立していません。通信を確かめて、もう一度承諾してください。"
              : state.message,
          );
        }
      }
    });
  };

  switch (shown.status) {
    case "acceptable": {
      const { target } = shown;
      const words = WORDS[target.kind];
      return (
        <ManagePage
          title={<Title />}
          actions={
            <Button disabled={accepting} onClick={() => accept(target)}>
              {accepting ? "承諾しています…" : `承諾して${words.role}になる`}
            </Button>
          }
        >
          <ManageBody aria-busy={accepting}>
            {failure === null ? null : (
              <Alert title="承諾できませんでした">{failure}</Alert>
            )}
            <p className="my-lead">
              {`あなた（${shown.email}）は、次の${words.target}の管理メンバーに招待されています。`}
            </p>
            <div className="my06-target">
              <span className="my06-kind">{words.target}</span>
              <span className="my06-name">{displayName(target)}</span>
            </div>
            <ManageSection
              id="my06-can"
              title={`${words.role}として行えること`}
            >
              <ul className="my-points">
                {words.can.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </ManageSection>
            <Notice variant="manage" tone="paper" title="承諾について">
              {words.premise}
            </Notice>
          </ManageBody>
        </ManagePage>
      );
    }
    case "addressed_to_other":
      return (
        <ManagePage title={<Title />}>
          <ManageBody>
            <FocusOnMount role="alert">
              <Alert
                title="このアカウントでは承諾できません"
                actions={
                  <LoginAgain label="招待されたメールアドレスでログインする" />
                }
              >
                {`この招待は、別のメールアドレス宛てです。${
                  shown.email === ""
                    ? ""
                    : `いまは ${shown.email} でログインしています。`
                }招待されたメールアドレスでログインし直すと、この画面に戻ります。`}
              </Alert>
            </FocusOnMount>
          </ManageBody>
        </ManagePage>
      );
    case "not_found":
      return (
        <ManagePage title={<Title />}>
          <ManageBody>
            <FocusOnMount role="alert">
              <EmptyPanel
                title="この招待は取り消されました"
                actions={
                  <ButtonLink variant="secondary" to="/me/notifications">
                    通知へ戻る
                  </ButtonLink>
                }
              >
                招待は、管理者またはサービス運営者によって取り消されています。承諾はできません。
              </EmptyPanel>
            </FocusOnMount>
          </ManageBody>
        </ManagePage>
      );
    case "already_steward": {
      const words = WORDS[shown.target.kind];
      return (
        <ManagePage title={<Title />}>
          <ManageBody>
            <FocusOnMount role="status">
              <EmptyPanel
                title={`すでにこの${words.target}の${words.role}です`}
                actions={
                  <ButtonLink
                    to={managementHomePath(shown.target.kind, shown.target.id)}
                  >
                    {words.home}
                  </ButtonLink>
                }
              >
                {`この招待を承諾しなくても、${words.target}の${
                  shown.target.kind === "place" ? "管理" : "運営"
                }を行えます。`}
              </EmptyPanel>
            </FocusOnMount>
          </ManageBody>
        </ManagePage>
      );
    }
    case "accepted": {
      const { target } = shown;
      const words = WORDS[target.kind];
      return (
        <ManagePage title={<Title />}>
          <FocusOnMount>
            <DonePanel
              title={`${displayName(target)} の${words.role}になりました`}
              actions={
                <ButtonLink to={managementHomePath(target.kind, target.id)}>
                  {words.home}
                </ButtonLink>
              }
            >
              {target.kind === "place"
                ? "店舗の管理を始められます。この店舗に出していた管理権限の申請があれば、失効しています。通知で確かめられます。"
                : `${words.target}の運営を始められます。`}
            </DonePanel>
          </FocusOnMount>
        </ManagePage>
      );
    }
  }
}
