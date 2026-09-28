"use client";

import type { ApplicationStatusKind } from "@repo/core/domain/application/status";
import {
  type ReactNode,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
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
import { Button, buttonClassName } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { TextLink } from "@/components/ui/TextButton";
import type { StatusData } from "@/presentation/applicationContent";
import {
  APPLICATION_KIND_TITLE,
  monthDayText,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/presentation/applicationWords";
import { classifyError } from "@/presentation/errorState";
import {
  type MyApplicationData,
  type NextStep,
  withdrawApplicationFn,
} from "@/presentation/myApplicationDetail";
import { useReconcile } from "@/presentation/reconcile";
import { ContentSections, SubjectValue } from "../ApplicationParts";

/** What the last withdrawal ended in; `null` before any. */
type Outcome =
  | Readonly<{ kind: "withdrawn" }>
  | Readonly<{ kind: "failed" | "forbidden" }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "changed"; message: string }>;

function ReasonNotice({
  title,
  label,
  texts,
  tone,
  children,
}: {
  title: string;
  label: string;
  texts: readonly string[];
  tone: "light" | "paper";
  children?: ReactNode;
}) {
  return (
    <div
      className="notice notice--manage my05-notice"
      data-tone={tone === "paper" ? "paper" : undefined}
    >
      <p className="notice__title">{title}</p>
      <div className="my05-reason">
        <p className="my05-reason__label">{label}</p>
        {texts.map((text) => (
          <p key={text} className="my05-reason__text">
            {text}
          </p>
        ))}
      </div>
      {children}
    </div>
  );
}

function dateLine(data: MyApplicationData, status: StatusData): string {
  if (status.kind === "underReview" && status.answering !== null) {
    return `${monthDayText(status.since)}に再提出`;
  }
  return `${monthDayText(data.submittedAt)}に提出`;
}

/** The notice that says where the application stands (「申請の状態」). */
function StatusNotice({ data }: { data: MyApplicationData }) {
  const { status } = data;
  switch (status.kind) {
    case "underReview":
      return (
        <>
          <Notice variant="manage" title="承認者の確認を待っています">
            {`${data.approver}が内容を確かめています。結果は通知とメールでお知らせします。確認中の申請は修正できません。`}
          </Notice>
          {status.answering === null ? null : (
            <ReasonNotice
              title="再提出した申請です"
              label="差し戻しで求められた確認"
              texts={[status.answering.request]}
              tone="paper"
            >
              <div className="my05-reason">
                <p className="my05-reason__label">再提出に添えた回答</p>
                <p className="my05-reason__text">
                  {status.answering.reply ?? "回答は添えていません"}
                </p>
              </div>
            </ReasonNotice>
          )}
        </>
      );
    case "returned":
      return (
        <ReasonNotice
          title="追加の確認が求められています"
          label={`${data.approver}からの確認`}
          texts={[status.request]}
          tone="light"
        />
      );
    case "approved":
      return (
        <Notice
          variant="manage"
          title="承認されました"
          {...(data.reflected === null
            ? {}
            : {
                actions: (
                  <TextLink to={data.reflected.href}>
                    {data.reflected.title}
                  </TextLink>
                ),
              })}
        >
          {data.kind === "stewardship"
            ? "申請者は店舗管理者になりました。店舗の管理へ進めます。"
            : "申請の内容が反映されました。反映先が閲覧できなくなっていれば、開いた先で閲覧できないことが示されます。"}
        </Notice>
      );
    case "rejected":
      return (
        <ReasonNotice
          title="否認されました"
          label="否認の理由"
          texts={[status.reason]}
          tone="paper"
        />
      );
    case "withdrawn":
      return (
        <Notice variant="manage" tone="paper" title="取り下げました">
          同じ内容から、あらためて申請できます。
        </Notice>
      );
    case "lapsed":
      return (
        <ReasonNotice
          title="失効しました"
          label="成り立たなくなった前提"
          texts={[
            ...status.premises,
            "申請の内容は反映されていません。失効は元に戻せません。",
          ]}
          tone="paper"
        />
      );
  }
}

function StepList({ steps }: { steps: readonly NextStep[] }) {
  return (
    <LinkList>
      {steps.map((step) => (
        <li key={step.href}>
          <ListRowLink to={step.href} title={step.title} meta={step.meta} />
        </li>
      ))}
    </LinkList>
  );
}

/** A plain anchor drawn as a button: RQ-02〜RQ-04 take their mode from the query. */
function ButtonAnchor({
  href,
  variant,
  children,
}: {
  href: string;
  variant: "primary" | "secondary";
  children: ReactNode;
}) {
  return (
    <a className={buttonClassName(variant)} href={href}>
      {children}
    </a>
  );
}

/**
 * MY-05 申請の詳細: the application's kind, subjects, applicant, content
 * and status, with the withdrawal (CS-12), 再提出 and 再申請 (RQ-02〜RQ-04),
 * the companion application and, for a lapsed one, where to go next.
 */
export function MyApplicationView({ data }: { data: MyApplicationData }) {
  const reconcile = useReconcile();
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [withdrawing, startWithdraw] = useTransition();
  // The status shows 取り下げ while the withdrawal is on its way.
  const [status, markWithdrawn] = useOptimistic<StatusData, "withdrawn">(
    data.status,
    () => ({ kind: "withdrawn" }),
  );
  const outcomeRef = useRef<HTMLDivElement>(null);
  // The outcome replaces what the viewer was acting on: move focus (and
  // the view) to it once it is on screen.
  useEffect(() => {
    if (outcome !== null) outcomeRef.current?.focus();
  }, [outcome]);
  const view = { ...data, status };
  const kindTitle = APPLICATION_KIND_TITLE[data.kind];
  const active = status.kind === "underReview" || status.kind === "returned";
  const firstSubject = data.subjects[0];
  // A listing revision is named by its listing, the rest by their first subject.
  const named =
    data.subjects.find((subject) => subject.label === "掲載") ?? firstSubject;
  const subjectText =
    named === undefined ? kindTitle : `${kindTitle}（${named.name}）`;
  const companionLapses =
    data.kind === "registration" &&
    data.pair !== null &&
    (data.pair.status === "underReview" || data.pair.status === "returned");

  const withdraw = () => {
    startWithdraw(async () => {
      markWithdrawn("withdrawn");
      try {
        await withdrawApplicationFn({
          data: { applicationId: data.id, version: data.version },
        });
        setOutcome({ kind: "withdrawn" });
        setConfirming(false);
        await reconcile();
      } catch (error) {
        setConfirming(false);
        const state = classifyError(error);
        switch (state.kind) {
          case "conflict":
            setOutcome({ kind: "conflict" });
            break;
          case "premiseChanged":
            setOutcome({ kind: "changed", message: state.message });
            await reconcile();
            break;
          case "forbidden":
            setOutcome({ kind: "forbidden" });
            break;
          default:
            setOutcome({ kind: "failed" });
        }
      }
    });
  };

  const actions = actionsOf(view, {
    onWithdraw: () => setConfirming(true),
    withdrawing,
  });

  return (
    <>
      <ManagePage
        title={
          <ManageTitle>
            <ManageBackLink to="/me/applications">自分の申請</ManageBackLink>
            <ManageHeading>{kindTitle}</ManageHeading>
            <p className="my-state">
              <Badge tone={STATUS_TONE[status.kind]}>
                {STATUS_LABEL[status.kind]}
              </Badge>
              {dateLine(data, status)}
            </p>
          </ManageTitle>
        }
        {...(actions === null ? {} : { actions })}
      >
        <ManageBody>
          <div ref={outcomeRef} tabIndex={-1}>
            <OutcomeView
              outcome={outcome}
              asSteward={data.asSteward}
              reload={async () => {
                await reconcile();
                setOutcome(null);
              }}
            />
          </div>
          {outcome?.kind === "withdrawn" ? null : <StatusNotice data={view} />}
          {status.kind === "lapsed" && data.nextSteps.length > 0 ? (
            <ManageSection id="my05-next" title="次に行えること">
              <StepList steps={data.nextSteps} />
            </ManageSection>
          ) : null}
          <Summary data={data} />
          {data.pair === null ? null : (
            <ManageSection
              id="my05-pair"
              title={
                data.kind === "registration"
                  ? "併せて出した申請"
                  : "併せて出した登録申請"
              }
            >
              <LinkList>
                <li>
                  <ListRowLink
                    to="/me/applications/$applicationId"
                    params={{ applicationId: data.pair.id }}
                    title={`${APPLICATION_KIND_TITLE[data.pair.kind]}${firstSubject === undefined ? "" : ` · ${firstSubject.name}`}`}
                    meta={
                      data.pair.status === null
                        ? "この管理権限の申請を併せた店舗の登録申請"
                        : `${STATUS_LABEL[data.pair.status]} · この登録申請に併せて提出`
                    }
                  />
                </li>
              </LinkList>
            </ManageSection>
          )}
          <ContentSections
            content={data.content}
            variant="my"
            idPrefix="my05"
            approved={data.status.kind === "approved"}
          />
        </ManageBody>
      </ManagePage>
      <ConfirmDialog
        open={confirming && active}
        title="申請を取り下げますか"
        confirmLabel={withdrawing ? "取り下げています…" : "取り下げる"}
        pending={withdrawing}
        onConfirm={withdraw}
        onCancel={() => setConfirming(false)}
      >
        <p>取り下げは元に戻せません。確定すると、次のようになります。</p>
        <ul>
          <li>
            {subjectText}
            は取り下げになり、承認者の確認は止まります。申請の内容は反映されません
          </li>
          {companionLapses ? (
            <li>{`併せて出した管理権限の申請${firstSubject === undefined ? "" : `（${firstSubject.name}）`}は失効します`}</li>
          ) : null}
          {data.asSteward ? (
            <li>この店舗のほかの店舗管理者にも、取り下げたことが示されます</li>
          ) : null}
          <li>同じ内容から、あとで再申請できます</li>
        </ul>
      </ConfirmDialog>
    </>
  );
}

function Summary({ data }: { data: MyApplicationData }) {
  const single = data.subjects.length === 1;
  return (
    <ManageSection id="my05-summary" title="申請の概要">
      <dl className="my-dl">
        <div className="my-dl__row">
          <dt>種類</dt>
          <dd>{APPLICATION_KIND_TITLE[data.kind]}</dd>
        </div>
        {data.subjects.map((subject) => (
          <div key={`${subject.label}:${subject.name}`} className="my-dl__row">
            <dt>{single ? "対象" : `対象の${subject.label}`}</dt>
            <dd>
              <SubjectValue subject={subject} />
            </dd>
          </div>
        ))}
        <div className="my-dl__row">
          <dt>申請者</dt>
          <dd>
            {data.applicant}
            {data.asSteward ? (
              <span className="m-row__sub">
                店舗管理者として行った申請です。この店舗のどの店舗管理者も、同じ内容を見て扱えます。
              </span>
            ) : null}
          </dd>
        </div>
        <div className="my-dl__row">
          <dt>提出</dt>
          <dd>{monthDayText(data.submittedAt)}</dd>
        </div>
        <div className="my-dl__row">
          <dt>承認者</dt>
          <dd>{data.approver}</dd>
        </div>
      </dl>
    </ManageSection>
  );
}

function OutcomeView({
  outcome,
  reload,
  asSteward,
}: {
  outcome: Outcome | null;
  asSteward: boolean;
  reload: () => Promise<void>;
}) {
  const [reloading, startReload] = useTransition();
  if (outcome === null) return null;
  switch (outcome.kind) {
    case "withdrawn":
      return (
        <div role="status">
          <Notice variant="manage" title="申請を取り下げました">
            承認者の確認は止まりました。同じ内容から、あらためて申請できます。
          </Notice>
        </div>
      );
    case "conflict":
      return (
        <Alert
          title="申請の内容が変わっています"
          actions={
            <Button
              variant="secondary"
              disabled={reloading}
              onClick={() => startReload(reload)}
            >
              最新の内容を読み込む
            </Button>
          }
        >
          {`開いてから取り下げるまでの間に、${asSteward ? "この店舗の別の店舗管理者によって" : "別の画面から"}申請が再提出されていました。取り下げは行っていません。最新の内容を確かめてから、もう一度操作してください。`}
        </Alert>
      );
    case "changed":
      return (
        <Alert
          title={outcome.message}
          actions={
            <TextLink to="/me/applications">自分の申請の一覧へ戻る</TextLink>
          }
        >
          取り下げは行っていません。現在の状態を表示しています。
        </Alert>
      );
    case "forbidden":
      return (
        <Alert
          title="この申請は扱えなくなりました"
          actions={
            <TextLink to="/me/applications">自分の申請の一覧へ戻る</TextLink>
          }
        >
          この店舗の管理権限がなくなったため、取り下げは行っていません。
        </Alert>
      );
    case "failed":
      return (
        <Alert title="取り下げできませんでした">
          通信エラーのため、取り下げは成立していません。申請はそのままです。通信を確かめて、もう一度取り下げてください。
        </Alert>
      );
  }
}

function actionsOf(
  data: MyApplicationData,
  handlers: Readonly<{ onWithdraw: () => void; withdrawing: boolean }>,
): ReactNode | null {
  const withdrawButton = (
    <Button
      variant="secondary"
      onClick={handlers.onWithdraw}
      disabled={handlers.withdrawing}
    >
      {handlers.withdrawing ? "取り下げています…" : "申請を取り下げる"}
    </Button>
  );
  const reapply =
    data.reapplyHref === null ? null : (
      <ButtonAnchor
        href={data.reapplyHref}
        variant={data.nextSteps.length > 0 ? "secondary" : "primary"}
      >
        再申請する
      </ButtonAnchor>
    );
  const kind: ApplicationStatusKind = data.status.kind;
  switch (kind) {
    case "underReview":
      return withdrawButton;
    case "returned":
      return (
        <>
          {data.resubmitHref === null ? null : (
            <ButtonAnchor href={data.resubmitHref} variant="primary">
              修正して再提出する
            </ButtonAnchor>
          )}
          {withdrawButton}
        </>
      );
    case "approved":
      return data.reflected === null ? null : (
        <ButtonAnchor href={data.reflected.href} variant="primary">
          {data.reflected.title}
        </ButtonAnchor>
      );
    case "lapsed": {
      const first = data.nextSteps[0];
      return (
        <>
          {first === undefined ? null : (
            <ButtonAnchor href={first.href} variant="primary">
              {first.title}
            </ButtonAnchor>
          )}
          {reapply}
        </>
      );
    }
    case "rejected":
    case "withdrawn":
      return reapply;
  }
}
