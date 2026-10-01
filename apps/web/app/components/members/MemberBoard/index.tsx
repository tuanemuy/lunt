"use client";

import { AuthorityErrorCode } from "@repo/core/domain/authority/errorCode";
import { useRouter } from "@tanstack/react-router";
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { ManageBody } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/ChipButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { classifyError } from "@/presentation/errorState";
import {
  cancelInvitationFn,
  type InvitationItem,
  MEMBER_WORDS,
  type MemberBoardData,
  type MemberItem,
  resignStewardshipFn,
  revokeStewardFn,
} from "@/presentation/members";
import { useReconcile } from "@/presentation/reconcile";
import { useEndMembership } from "../MembersEnding";
import { GrantForm } from "./GrantForm";
import { InviteForm } from "./InviteForm";

type Lists = Readonly<{
  stewards: readonly MemberItem[];
  invitations: readonly InvitationItem[];
}>;

type OptimisticAction =
  | Readonly<{ type: "invite"; invitation: InvitationItem }>
  | Readonly<{ type: "cancel"; invitationId: string }>
  | Readonly<{ type: "revoke"; accountId: string }>
  | Readonly<{ type: "grant"; member: MemberItem }>;

function applyAction(current: Lists, action: OptimisticAction): Lists {
  switch (action.type) {
    case "invite":
      // A reconcile may land the real row under a still-pending add.
      return current.invitations.some(
        (invitation) =>
          invitation.invitationId === action.invitation.invitationId,
      )
        ? current
        : {
            ...current,
            invitations: [...current.invitations, action.invitation],
          };
    case "cancel":
      return {
        ...current,
        invitations: current.invitations.filter(
          (invitation) => invitation.invitationId !== action.invitationId,
        ),
      };
    case "revoke":
      return {
        ...current,
        stewards: current.stewards.filter(
          (steward) => steward.accountId !== action.accountId,
        ),
      };
    case "grant":
      return current.stewards.some(
        (steward) =>
          steward.email.toLowerCase() === action.member.email.toLowerCase(),
      )
        ? current
        : { ...current, stewards: [...current.stewards, action.member] };
  }
}

/** The outcome of the last operation, shown above the lists (CS-13 / CS-08 / CS-15…). */
type Outcome =
  | Readonly<{ kind: "invited"; email: string }>
  | Readonly<{ kind: "cancelled"; email: string }>
  | Readonly<{ kind: "invitationGone"; email: string }>
  | Readonly<{ kind: "stewardArrived" }>
  | Readonly<{ kind: "revoked"; email: string }>
  | Readonly<{ kind: "granted"; email: string }>
  | Readonly<{ kind: "notSteward"; email: string }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "failed"; title: string; message: string }>;

/** Completions, announced through the board's live region; the rest are alerts. */
const isNotice = (outcome: Outcome): boolean =>
  outcome.kind === "invited" ||
  outcome.kind === "cancelled" ||
  outcome.kind === "revoked" ||
  outcome.kind === "granted";

/** A state that replaces the board: the viewer no longer manages the target. */
type Ending = "resigned" | "notSteward";

type Confirming =
  | Readonly<{ type: "resign" }>
  | Readonly<{ type: "revoke"; member: MemberItem }>;

function OutcomeBand({
  outcome,
  data,
}: {
  outcome: Outcome;
  data: MemberBoardData;
}) {
  const words = MEMBER_WORDS[data.kind];
  switch (outcome.kind) {
    case "invited":
      return (
        <Notice variant="manage" title="招待を送りました">
          {`${outcome.email} に招待を送りました。承諾されると、${data.name}の${words.role}になります。承諾されるまで、承諾前の招待として並びます。`}
        </Notice>
      );
    case "cancelled":
      return (
        <Notice variant="manage" title="招待を取り消しました">
          {`${outcome.email} への招待は、承諾できなくなりました。`}
        </Notice>
      );
    case "invitationGone":
      return (
        <Alert title="招待を取り消せませんでした">
          {`${outcome.email} への招待は、先に承諾されたか取り消されていました。最新の管理者と招待を示しています。`}
        </Alert>
      );
    case "stewardArrived":
      return (
        <Alert
          title={`この${words.target}は代行できません`}
          {...(data.kind === "place"
            ? {
                actions: (
                  <ButtonLink
                    variant="secondary"
                    to="/ops/subjects/$kind/$id"
                    params={{ kind: data.kind, id: data.id }}
                  >
                    {`${words.target}の運営へ戻る`}
                  </ButtonLink>
                ),
              }
            : {})}
        >
          {`${data.name}には、${words.role}が就いていました。招待は取り消していません。${words.target}の運営の画面で、管理者がいることを確かめてください。`}
        </Alert>
      );
    case "revoked":
      return (
        <Notice variant="manage" title="管理権限を解除しました">
          {`${outcome.email} は、${data.name}の${words.role}ではなくなりました。本人に通知が届きます。`}
        </Notice>
      );
    case "granted":
      return (
        <Notice variant="manage" title="管理権限を付与しました">
          {`${outcome.email} は、${data.name}の${words.role}になりました。本人に通知が届きます。`}
        </Notice>
      );
    case "notSteward":
      return (
        <Alert title="管理権限を解除できませんでした">
          {`${outcome.email} は、すでに${words.role}ではありませんでした（辞任・退会、または別のサービス運営者による解除）。最新の${words.role}を示しています。`}
        </Alert>
      );
    case "forbidden":
      return (
        <Alert
          title="この操作を行う権限がありません"
          actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
        >
          {`${data.name}の${words.role}、またはサービス運営者ではなくなっていました。操作は反映していません。`}
        </Alert>
      );
    case "failed":
      return <Alert title={outcome.title}>{outcome.message}</Alert>;
  }
}

function failedMessage(error: ReturnType<typeof classifyError>): string {
  return error.kind === "failed"
    ? "通信を確かめて、もう一度お試しください。"
    : error.message;
}

/**
 * CM-02 メンバーの管理's body: the target's managers and pending
 * invitations, with the operations of the viewer's standings — invite,
 * cancel and resign for a manager; revoke (and cancel while vacant) for
 * an operator. Owns both lists, since every operation changes their
 * membership: each dispatches into one optimistic state and reconciles
 * with the server. An operator also grants a region's / event's
 * stewardship to an existing account.
 */
export function MemberBoard({ data }: { data: MemberBoardData }) {
  const words = MEMBER_WORDS[data.kind];
  const router = useRouter();
  const endMembership = useEndMembership();
  const reconcile = useReconcile();
  const [lists, applyOptimistic] = useOptimistic<Lists, OptimisticAction>(
    { stewards: data.stewards, invitations: data.invitations },
    applyAction,
  );
  const [working, startWork] = useTransition();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [ending, setEnding] = useState<Ending | null>(null);
  const membersSection = useRef<HTMLElement>(null);
  const invitesSection = useRef<HTMLElement>(null);
  // A removal takes away the chip that had the focus; its section takes it
  // instead, once that commit is done.
  const focusAfter = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    focusAfter.current = null;
    target.focus();
  });

  if (ending === "resigned") {
    return (
      <FocusOnMount>
        <DonePanel
          title="辞任しました"
          actions={<ButtonLink to="/me">マイページへ</ButtonLink>}
        >
          {`${data.name}の${words.role}ではなくなりました。残る管理する店舗・地域・イベントは、マイページから開けます。`}
        </DonePanel>
      </FocusOnMount>
    );
  }
  if (ending === "notSteward") {
    return (
      <ManageBody>
        <FocusOnMount role="alert">
          <EmptyPanel
            title={`すでに${words.role}ではありません`}
            actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
          >
            {`${data.name}の${words.role}ではなくなっていました。管理権限が解除されたか、別の画面で辞任しています。この辞任は反映していません。`}
          </EmptyPanel>
        </FocusOnMount>
      </ManageBody>
    );
  }

  const canCancel = data.steward || (data.operator && data.vacant);
  const others = lists.stewards.filter((member) => !member.isSelf);

  const cancel = (invitation: InvitationItem) => {
    setOutcome(null);
    focusAfter.current = invitesSection.current;
    startWork(async () => {
      applyOptimistic({
        type: "cancel",
        invitationId: invitation.invitationId,
      });
      try {
        await cancelInvitationFn({
          data: {
            kind: data.kind,
            id: data.id,
            invitationId: invitation.invitationId,
          },
        });
        setOutcome({ kind: "cancelled", email: invitation.email });
        await reconcile();
      } catch (error) {
        const classified = classifyError(error);
        if (classified.code === AuthorityErrorCode.InvitationNotFound) {
          setOutcome({ kind: "invitationGone", email: invitation.email });
          await reconcile();
        } else if (classified.kind === "forbidden") {
          // An operator standing in for absent managers finds one has
          // taken office (CS-15); a manager finds they no longer are (CS-05).
          setOutcome(
            !data.steward && data.operator
              ? { kind: "stewardArrived" }
              : { kind: "forbidden" },
          );
          await reconcile();
        } else {
          setOutcome({
            kind: "failed",
            title: "招待を取り消せませんでした",
            message: failedMessage(classified),
          });
        }
      }
    });
  };

  const confirm = () => {
    const current = confirming;
    if (current === null) return;
    setConfirming(null);
    setOutcome(null);
    if (current.type === "resign") {
      startWork(async () => {
        try {
          await resignStewardshipFn({ data: { kind: data.kind, id: data.id } });
          // Not `reconcile()`: reloading would re-run the screen's access
          // check and replace this state with CS-05. Cached screens (MY-01's
          // entries among them) are read afresh on the next visit.
          router.clearCache();
          setEnding("resigned");
          endMembership();
        } catch (error) {
          const classified = classifyError(error);
          if (classified.kind === "forbidden") {
            router.clearCache();
            setEnding("notSteward");
            endMembership();
          } else {
            setOutcome({
              kind: "failed",
              title: "辞任できませんでした",
              message: failedMessage(classified),
            });
          }
        }
      });
      return;
    }
    const { member } = current;
    focusAfter.current = membersSection.current;
    startWork(async () => {
      applyOptimistic({ type: "revoke", accountId: member.accountId });
      try {
        await revokeStewardFn({
          data: { kind: data.kind, id: data.id, accountId: member.accountId },
        });
        setOutcome({ kind: "revoked", email: member.email });
        await reconcile();
      } catch (error) {
        const classified = classifyError(error);
        if (classified.code === AuthorityErrorCode.NotASteward) {
          setOutcome({ kind: "notSteward", email: member.email });
          await reconcile();
        } else if (classified.kind === "forbidden") {
          setOutcome({ kind: "forbidden" });
        } else {
          setOutcome({
            kind: "failed",
            title: "管理権限を解除できませんでした",
            message: failedMessage(classified),
          });
        }
      }
    });
  };

  const pendingInvitations = lists.invitations
    .map((invitation) => invitation.email)
    .join("、");

  return (
    <ManageBody aria-busy={working}>
      <div role="status">
        {outcome !== null && isNotice(outcome) ? (
          <OutcomeBand outcome={outcome} data={data} />
        ) : null}
      </div>
      {outcome === null || isNotice(outcome) ? null : (
        <OutcomeBand outcome={outcome} data={data} />
      )}
      {lists.stewards.length === 0 ? (
        <Notice variant="manage" tone="paper" title={`${words.role}がいません`}>
          {data.kind === "place"
            ? `${data.name}は、管理権限の申請の承認か、残っている招待の承諾で店舗管理者が就きます。管理者がいない間は、承諾前の招待をサービス運営者が取り消せます。`
            : `${data.name}は、サービス運営者が${words.target}の運営者として運営しています。残っている招待が承諾されると、${words.role}が就きます。`}
        </Notice>
      ) : null}

      <section
        ref={membersSection}
        tabIndex={-1}
        className="m-section outline-none"
        aria-labelledby="cm02-members"
      >
        <SectionTitle variant="manage" id="cm02-members">
          {words.role}
        </SectionTitle>
        {lists.stewards.length === 0 ? (
          <p className="m-field__help">いません</p>
        ) : (
          <ul className="m-list cm02-members">
            {lists.stewards.map((member) => (
              <li className="m-list__item" key={member.accountId}>
                <span className="m-list__text">
                  <span className="m-list__title cm02-who">
                    {member.email}
                    {member.isSelf ? <Badge tone="accent">あなた</Badge> : null}
                  </span>
                  <span className="m-list__meta">{words.role}</span>
                </span>
                {data.operator ? (
                  <ChipButton
                    disabled={working}
                    aria-label={`${member.email} の管理権限を解除する`}
                    onClick={() => {
                      setOutcome(null);
                      setConfirming({ type: "revoke", member });
                    }}
                  >
                    解除
                  </ChipButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        ref={invitesSection}
        tabIndex={-1}
        className="m-section outline-none"
        aria-labelledby="cm02-invites"
      >
        <SectionTitle variant="manage" id="cm02-invites">
          承諾前の招待
        </SectionTitle>
        {lists.invitations.length === 0 ? (
          <Notice
            variant="manage"
            tone="paper"
            title="承諾前の招待はありません"
          >
            {data.steward
              ? "招待を送ると、承諾されるまでここに宛先が並びます。"
              : undefined}
          </Notice>
        ) : (
          <ul className="m-list cm02-members">
            {lists.invitations.map((invitation) => (
              <li className="m-list__item" key={invitation.invitationId}>
                <span className="m-list__text">
                  <span className="m-list__title">{invitation.email}</span>
                  <span className="m-list__meta">
                    {invitation.invitedOn === null
                      ? "送っています…"
                      : `${invitation.invitedOn} · 承諾前`}
                  </span>
                </span>
                {canCancel ? (
                  <ChipButton
                    disabled={working || invitation.pending === true}
                    aria-label={`${invitation.email} への招待を取り消す`}
                    onClick={() => cancel(invitation)}
                  >
                    取り消す
                  </ChipButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!canCancel && lists.invitations.length > 0 ? (
          <p className="m-field__help">
            {`${words.role}のいる${words.target}の招待は、${words.role}が取り消します。`}
          </p>
        ) : null}
      </section>

      {data.steward ? (
        <section className="m-section" aria-labelledby="cm02-invite-title">
          <SectionTitle variant="manage" id="cm02-invite-title">
            招待する
          </SectionTitle>
          <InviteForm
            kind={data.kind}
            targetId={data.id}
            targetName={data.name}
            stewardEmails={lists.stewards.map((member) => member.email)}
            invitedEmails={lists.invitations.map(
              (invitation) => invitation.email,
            )}
            onOptimisticAdd={(invitationId, email) => {
              setOutcome(null);
              applyOptimistic({
                type: "invite",
                invitation: {
                  invitationId,
                  email,
                  invitedOn: null,
                  pending: true,
                },
              });
            }}
            onAttempt={() => setOutcome(null)}
            onInvited={(email) => setOutcome({ kind: "invited", email })}
            onForbidden={() => setOutcome({ kind: "forbidden" })}
          />
        </section>
      ) : null}

      {data.operator && data.kind !== "place" ? (
        <section className="m-section" aria-labelledby="cm02-grant-title">
          <SectionTitle variant="manage" id="cm02-grant-title">
            管理権限を付与する
          </SectionTitle>
          <GrantForm
            kind={data.kind}
            targetId={data.id}
            targetName={data.name}
            stewardEmails={lists.stewards.map((member) => member.email)}
            onAttempt={() => setOutcome(null)}
            onOptimisticAdd={(email) =>
              applyOptimistic({
                type: "grant",
                member: {
                  accountId: `pending:${email}`,
                  email,
                  isSelf: false,
                  pending: true,
                },
              })
            }
            onGranted={(email) => setOutcome({ kind: "granted", email })}
            onForbidden={() => setOutcome({ kind: "forbidden" })}
          />
        </section>
      ) : null}

      {!data.steward && data.operator && data.kind === "place" ? (
        <Notice
          variant="manage"
          tone="paper"
          title="店舗では管理権限を付与しません"
        >
          店舗管理者は、管理権限の申請の承認か、店舗管理者からの招待の承諾で就きます。
        </Notice>
      ) : null}

      {data.steward ? (
        <>
          <hr className="m-divider" />
          <section className="m-section" aria-labelledby="cm02-resign">
            <SectionTitle variant="manage" id="cm02-resign">
              辞任する
            </SectionTitle>
            <p className="my-lead">
              {`辞任すると、${data.name}を${words.verb}できなくなります。後任の招待が承諾される前でも辞任できます。`}
              {others.length === 0
                ? `あなたは最後の${words.role}です。辞任の前に、辞任した後の扱いを確かめます。`
                : null}
            </p>
            <div>
              <Button
                variant="secondary"
                disabled={working}
                onClick={() => {
                  setOutcome(null);
                  setConfirming({ type: "resign" });
                }}
              >
                {`${words.role}を辞任する`}
              </Button>
            </div>
          </section>
        </>
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming === null
            ? ""
            : confirming.type === "resign"
              ? others.length === 0
                ? `最後の${words.role}として辞任しますか`
                : `${data.name}の${words.role}を辞任しますか`
              : `${confirming.member.email} の管理権限を解除しますか`
        }
        confirmLabel={confirming?.type === "revoke" ? "解除する" : "辞任する"}
        pending={working}
        onConfirm={confirm}
        onCancel={() => setConfirming(null)}
      >
        {confirming === null ? null : confirming.type === "resign" ? (
          others.length === 0 ? (
            <>
              <p>
                {`ほかに${words.role}はいません。辞任すると、${data.name}は管理者のいない${words.target}になります。辞任は取り消せません。`}
              </p>
              <ul>
                {words.vacancy.map((line) => (
                  <li key={line}>{line}</li>
                ))}
                <li>{vacancyInvitationLine(pendingInvitations, words.role)}</li>
              </ul>
            </>
          ) : (
            <>
              <p>
                {`辞任すると、${data.name}を${words.verb}できなくなります。辞任は取り消せません。`}
              </p>
              <ul>
                <li>{`ほかの${words.role}: ${others.map((member) => member.email).join("、")}`}</li>
                {pendingInvitations === "" ? null : (
                  <li>{`承諾前の招待（${pendingInvitations}）は、有効のまま残ります`}</li>
                )}
                <li>
                  もう一度管理するには、招待を受けるか、管理権限を申請します
                </li>
              </ul>
            </>
          )
        ) : (
          <RevokeBody
            member={confirming.member}
            remaining={lists.stewards.filter(
              (member) => member.accountId !== confirming.member.accountId,
            )}
            data={data}
            pendingInvitations={pendingInvitations}
          />
        )}
      </ConfirmDialog>
    </ManageBody>
  );
}

/**
 * The vacancy's consequence for pending invitations (`spec/scenario/index.md`
 * 「管理者不在」), stated whether or not any is pending.
 */
function vacancyInvitationLine(pending: string, role: string): string {
  return pending === ""
    ? `承諾前の招待は有効のまま残り、承諾されると${role}が就きます（いま承諾前の招待はありません）`
    : `承諾前の招待（${pending}）は有効のまま残り、承諾されると${role}が就きます`;
}

function RevokeBody({
  member,
  remaining,
  data,
  pendingInvitations,
}: {
  member: MemberItem;
  remaining: readonly MemberItem[];
  data: MemberBoardData;
  pendingInvitations: string;
}) {
  const words = MEMBER_WORDS[data.kind];
  if (remaining.length === 0) {
    return (
      <>
        <p>
          {`${member.email} は、${data.name}の最後の${words.role}です。解除すると、${data.name}は管理者のいない${words.target}になります。解除は取り消せません。`}
        </p>
        <ul>
          {words.vacancy.map((line) => (
            <li key={line}>{line}</li>
          ))}
          <li>{vacancyInvitationLine(pendingInvitations, words.role)}</li>
        </ul>
      </>
    );
  }
  return (
    <>
      <p>
        {`${data.name}の${words.role}から外します。本人に通知が届きます。解除は取り消せません。`}
      </p>
      <ul>
        <li>{`解除する${words.role}: ${member.email}`}</li>
        <li>{`残る${words.role}: ${remaining.map((other) => other.email).join("、")}`}</li>
      </ul>
    </>
  );
}
