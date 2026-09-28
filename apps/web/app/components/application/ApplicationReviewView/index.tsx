"use client";

import type { ApplicationKind } from "@repo/core/domain/application/application";
import type { ApplicationStatusKind } from "@repo/core/domain/application/status";
import {
  type ReactNode,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageSection,
  ManageShell,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { OPS_HOME, OpsNav } from "@/components/ops/OpsShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DonePanel } from "@/components/ui/DonePanel";
import { Field, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { TextLink } from "@/components/ui/TextButton";
import type { StatusData } from "@/presentation/applicationContent";
import {
  type ApplicationReviewData,
  type ApprovalResult,
  approveApplicationFn,
  REVIEW_TEXT_MAX,
  rejectApplicationFn,
  sendBackApplicationFn,
} from "@/presentation/applicationReview";
import {
  monthDayText,
  REVIEW_KIND_TITLE,
  STATUS_LABEL,
} from "@/presentation/applicationWords";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { useReconcile } from "@/presentation/reconcile";
import {
  ContentList,
  ContentSections,
  SubjectValue,
} from "../ApplicationParts";
import { PlaceCandidates, PlaceMatchSearch } from "./PlaceMatchSearch";

const PHOTOS_UNAVAILABLE = "LISTING_PATCH_PHOTOS_UNAVAILABLE";

type Decision = "approve" | "reject" | "sendBack";

const DECISION_WORD: Readonly<Record<Decision, string>> = {
  approve: "承認",
  reject: "否認",
  sendBack: "差し戻し",
};

/** What the last decision ended in; `null` before any. */
type Outcome =
  | Readonly<{
      kind: "approved";
      result: Extract<ApprovalResult, { outcome: "approved" }>;
    }>
  | Readonly<{ kind: "lapsed"; premises: readonly string[] }>
  | Readonly<{ kind: "rejected"; overdueProxy: boolean }>
  | Readonly<{ kind: "returned" }>
  | Readonly<{ kind: "error"; decision: Decision; error: ErrorState }>;

/** What an approval did, per kind (CS-13). */
const APPROVED_TEXT: Readonly<Record<ApplicationKind, string>> = {
  registration: "店舗を登録して公開しました。",
  revision: "申請の項目を、店舗の内容に反映しました。",
  stewardship: "申請者が店舗管理者になりました。",
  listing: "掲載を公開中の掲載として作りました。",
  listingRevision: "申請の項目を、掲載の内容に反映しました。",
};

/** CM-01's review path: another application's CM-01. */
const reviewPath = (id: string): string =>
  `/manage/applications/${encodeURIComponent(id)}`;

/** The badge of the 状態 row: 確認中 (再提出), or the ended status. */
function statusBadge(status: StatusData): ReactNode {
  const label = STATUS_LABEL[status.kind];
  switch (status.kind) {
    case "underReview":
      return (
        <Badge tone="accent">
          {status.answering === null ? label : `${label} · 再提出`}
        </Badge>
      );
    case "approved":
    case "rejected":
      return (
        <Badge tone="muted">
          {status.overdueProxy ? `${label} · 期間超過の代行` : label}
        </Badge>
      );
    default:
      return (
        <Badge tone={status.kind === "returned" ? "alert" : "muted"}>
          {label}
        </Badge>
      );
  }
}

/** 確認中でない: the current status, and that no decision is needed. */
function ClosedNotice({ status }: { status: StatusData }) {
  switch (status.kind) {
    case "underReview":
      return null;
    case "returned":
      return (
        <Notice variant="manage" tone="paper" title="この申請は差し戻し中です">
          {`申請者の再提出を待っています。再提出されると、確認中に戻ります。求めた確認: ${status.request}`}
        </Notice>
      );
    case "approved":
      return (
        <Notice
          variant="manage"
          tone="paper"
          title="この申請は承認されています"
        >
          {status.overdueProxy
            ? "期間超過の代行として承認されました。判断は変えられません。"
            : "判断は変えられません。"}
        </Notice>
      );
    case "rejected":
      return (
        <Notice
          variant="manage"
          tone="paper"
          title="この申請は否認されています"
        >
          {`${status.overdueProxy ? "期間超過の代行として否認されました。" : ""}否認の理由: ${status.reason}`}
        </Notice>
      );
    case "withdrawn":
      return (
        <Notice
          variant="manage"
          tone="paper"
          title="この申請は取り下げられました"
        >
          申請者が取り下げました。判断は要りません。
        </Notice>
      );
    case "lapsed":
      return (
        <Notice variant="manage" tone="paper" title="この申請は失効しています">
          {`${status.premises.join("")}判断は要りません。`}
        </Notice>
      );
  }
}

function StanceNotice({ data }: { data: ApplicationReviewData }) {
  if (data.status.kind !== "underReview") return null;
  switch (data.stance) {
    case "approver":
      return null;
    case "overdueProxy":
      return (
        <Notice variant="manage" title="期間超過の代行">
          運営者が、一定の期間この申請を確認していません。サービス運営者が代わりに承認か否認を判断できます。判断は、期間超過の代行として記録されます。
        </Notice>
      );
    case "awaitingStewards":
      return (
        <Notice
          variant="manage"
          tone="paper"
          title="運営者の判断を待つ申請です"
        >
          運営者がいるため、一定の期間を過ぎるまでは運営者が判断します。期間を過ぎると、期間超過の代行ができます。
        </Notice>
      );
    case "registrationPending":
      return (
        <Notice
          variant="manage"
          tone="paper"
          title="店舗の登録の判断を待っています"
          {...(data.pair === null
            ? {}
            : {
                actions: (
                  <TextLink to={reviewPath(data.pair.id)}>
                    登録の申請を判断する
                  </TextLink>
                ),
              })}
        >
          この管理権限の申請は、店舗の新規登録の申請に併せて出されました。登録の申請が確認中・差し戻し中の間は判断できません。先に登録の申請を判断してください。
        </Notice>
      );
  }
}

function ApplicationSection({
  data,
  status,
}: {
  data: ApplicationReviewData;
  status: StatusData;
}) {
  return (
    <ManageSection id="cm01-app" title="申請">
      <dl className="cm01-dl">
        <div>
          <dt>種類</dt>
          <dd>{REVIEW_KIND_TITLE[data.kind]}</dd>
        </div>
        {data.subjects.map((subject) => (
          <div key={`${subject.label}:${subject.name}`}>
            <dt>
              {data.subjects.length === 1 ? "対象" : `対象の${subject.label}`}
            </dt>
            <dd>
              <SubjectValue subject={subject} />
            </dd>
          </div>
        ))}
        <div>
          <dt>申請者</dt>
          <dd>{data.applicant}</dd>
        </div>
        <div>
          <dt>状態</dt>
          <dd>{statusBadge(status)}</dd>
        </div>
        <div>
          <dt>提出日</dt>
          <dd>{monthDayText(data.submittedAt)}</dd>
        </div>
        {data.kind === "registration" ? (
          <div>
            <dt>管理権限の申請</dt>
            <dd>
              {data.pair === null ? (
                "併せていません"
              ) : (
                <>
                  {`併せています（${data.pair.status === null ? "" : STATUS_LABEL[data.pair.status]}）`}
                  <TextLink to={reviewPath(data.pair.id)}>
                    併せた管理権限の申請を見る
                  </TextLink>
                </>
              )}
            </dd>
          </div>
        ) : null}
        {data.kind === "stewardship" && data.pair !== null ? (
          <div>
            <dt>併せた登録の申請</dt>
            <dd>
              <TextLink to={reviewPath(data.pair.id)}>
                登録の申請を見る
              </TextLink>
            </dd>
          </div>
        ) : null}
        {data.facts.kind === "stewardship" ? (
          <div>
            <dt>既存の店舗管理者</dt>
            <dd>{data.facts.placeHasSteward ? "います" : "いません"}</dd>
          </div>
        ) : null}
      </dl>
      {status.kind === "underReview" && status.answering !== null ? (
        <div className="notice notice--manage my05-notice">
          <p className="notice__title">差し戻しで求めた確認</p>
          <p className="notice__text">{status.answering.request}</p>
          <p className="notice__title">再提出に添えた回答</p>
          <p className="notice__text">
            {status.answering.reply ?? "回答は添えられていません"}
          </p>
        </div>
      ) : null}
    </ManageSection>
  );
}

function OutcomeAlert({
  outcome,
  onRetry,
  reload,
  kindTitle,
}: {
  outcome: Outcome | null;
  onRetry: (decision: Decision) => void;
  reload: () => Promise<void>;
  kindTitle: string;
}) {
  const [reloading, startReload] = useTransition();
  if (outcome === null) return null;
  switch (outcome.kind) {
    case "lapsed":
      return (
        <Alert title="この申請は承認できませんでした">
          {`承認の時点で申請の前提が成り立たなくなっていたため、申請は失効しました。内容は反映していません。${outcome.premises.join("")}`}
        </Alert>
      );
    case "error": {
      const { error, decision } = outcome;
      const word = DECISION_WORD[decision];
      switch (error.kind) {
        case "conflict":
          return (
            <Alert
              title="申請の内容が変わっていました"
              actions={
                <Button
                  variant="secondary"
                  disabled={reloading}
                  onClick={() => startReload(reload)}
                >
                  最新の内容を読み直す
                </Button>
              }
            >
              開いた後に、この申請は差し戻され、再提出されていました。判断は反映していません。最新の内容を読み直してから、判断してください。
            </Alert>
          );
        case "premiseChanged":
          return error.code === PHOTOS_UNAVAILABLE ? (
            <Alert title="この申請は承認できません">
              申請の写真が、提出の後にすべて掲載から外されるか削除されました。反映できる写真がないため、承認できません。申請は確認中のままです。否認するか、差し戻して写真を求めてください。
            </Alert>
          ) : (
            <Alert
              title="この申請は判断できません"
              actions={
                <TextLink to={OPS_HOME}>対応が必要なものへ戻る</TextLink>
              }
            >
              {`${error.message}。${word}は反映していません。申請の現在の状態を示しています。`}
            </Alert>
          );
        case "forbidden":
          return (
            <Alert
              title={`${word}できませんでした`}
              actions={<TextLink to="/me">マイページへ戻る</TextLink>}
            >
              {`この申請を判断する立場がなくなったため、${word}は反映していません。`}
            </Alert>
          );
        default:
          return (
            <Alert
              title={`${word}を送れませんでした`}
              actions={
                <Button variant="secondary" onClick={() => onRetry(decision)}>
                  もう一度送る
                </Button>
              }
            >
              {`通信を確かめて、もう一度${word}してください。${kindTitle}の申請はまだ確認中です。`}
            </Alert>
          );
      }
    }
    default:
      return null;
  }
}

function Done({
  data,
  outcome,
}: {
  data: ApplicationReviewData;
  outcome: Extract<Outcome, { kind: "approved" | "rejected" | "returned" }>;
}) {
  const kindTitle = REVIEW_KIND_TITLE[data.kind];
  const back = (
    <ButtonLink
      variant={outcome.kind === "approved" ? "secondary" : "primary"}
      to={OPS_HOME}
    >
      対応が必要なものへ戻る
    </ButtonLink>
  );
  switch (outcome.kind) {
    case "approved": {
      const { result } = outcome;
      return (
        <DonePanel
          title={
            result.overdueProxy
              ? "期間超過の代行として承認しました"
              : `${kindTitle}を承認しました`
          }
          actions={
            <>
              {result.companionId === null ? null : (
                <ButtonLink to={reviewPath(result.companionId)}>
                  管理権限の申請を判断する
                </ButtonLink>
              )}
              {result.reflected === null ? null : (
                <ButtonLink
                  variant={
                    result.companionId === null ? "primary" : "secondary"
                  }
                  to={result.reflected.href}
                >
                  {result.reflected.title}
                </ButtonLink>
              )}
              {back}
            </>
          }
        >
          {result.companionId === null
            ? `${APPROVED_TEXT[data.kind]}申請者に通知が届きます。判断は変えられません。`
            : "店舗を登録して公開しました。併せて出された管理権限の申請を、続けて判断できます。"}
        </DonePanel>
      );
    }
    case "rejected":
      return (
        <DonePanel
          title={
            outcome.overdueProxy
              ? "期間超過の代行として否認しました"
              : `${kindTitle}を否認しました`
          }
          actions={back}
        >
          申請者に、理由とともに通知が届きます。判断は変えられません。
        </DonePanel>
      );
    case "returned":
      return (
        <DonePanel title={`${kindTitle}を差し戻しました`} actions={back}>
          申請者が追加の確認に答えて再提出すると、申請は確認中に戻ります。
        </DonePanel>
      );
  }
}

/**
 * CM-01 申請の判断, as an operator decides the stage-2 kinds: the
 * application, what approval reflects, and approve / reject with a reason
 * / send back with a request, each confirmed (CS-12), with the results
 * per state — CS-13, CS-07, CS-08 (including a lapse found on approval),
 * CS-10, CS-05, CS-02.
 */
export function ApplicationReviewView({
  data,
}: {
  data: ApplicationReviewData;
}) {
  const reconcile = useReconcile();
  const textId = useId();
  const [dialog, setDialog] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [request, setRequest] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [deciding, startDecision] = useTransition();
  const [status, applyDecision] = useOptimistic<
    StatusData,
    ApplicationStatusKind
  >(data.status, (current, kind) => {
    switch (kind) {
      case "approved":
        return {
          kind: "approved",
          overdueProxy: data.stance === "overdueProxy",
        };
      case "rejected":
        return {
          kind: "rejected",
          reason,
          overdueProxy: data.stance === "overdueProxy",
        };
      case "returned":
        return { kind: "returned", request };
      default:
        return current;
    }
  });
  const alertRef = useRef<HTMLDivElement>(null);
  // The outcome replaces what the viewer was acting on: move focus (and
  // the view) to it once it is on screen.
  useEffect(() => {
    if (outcome !== null) alertRef.current?.focus();
  }, [outcome]);
  const kindTitle = REVIEW_KIND_TITLE[data.kind];
  const underReview = data.status.kind === "underReview";
  // A decision refused for a lost standing (CS-05 / CS-15) leaves nothing
  // to decide on this screen.
  const standingLost =
    outcome?.kind === "error" && outcome.error.kind === "forbidden";
  const canDecide =
    underReview &&
    !standingLost &&
    (data.stance === "approver" || data.stance === "overdueProxy");
  const approvalBlocked =
    data.content.noPhotoLeft ||
    (outcome?.kind === "error" && outcome.error.code === PHOTOS_UNAVAILABLE);

  const run = (decision: Decision) => {
    startDecision(async () => {
      applyDecision(
        decision === "approve"
          ? "approved"
          : decision === "reject"
            ? "rejected"
            : "returned",
      );
      // Updates after an `await` leave the transition unless wrapped again;
      // wrapped, they commit with the optimistic revert and the reconciled
      // data instead of beside the stale optimistic status.
      const settle = (update: () => void) => startDecision(update);
      const base = { applicationId: data.id, version: data.version };
      try {
        let next: Outcome;
        if (decision === "approve") {
          const result = await approveApplicationFn({
            data: { ...base, kind: data.kind },
          });
          next =
            result.outcome === "approved"
              ? { kind: "approved", result }
              : { kind: "lapsed", premises: result.premises };
        } else if (decision === "reject") {
          const result = await rejectApplicationFn({
            data: { ...base, reason },
          });
          next = { kind: "rejected", overdueProxy: result.overdueProxy };
        } else {
          await sendBackApplicationFn({ data: { ...base, request } });
          next = { kind: "returned" };
        }
        settle(() => {
          setOutcome(next);
          setDialog(null);
          setFieldError(null);
        });
        await reconcile();
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "invalidInput") {
          settle(() =>
            setFieldError(
              state.fieldErrors.reason?.[0] ??
                state.fieldErrors.request?.[0] ??
                state.message,
            ),
          );
          return;
        }
        settle(() => {
          setDialog(null);
          setOutcome({ kind: "error", decision, error: state });
        });
        if (
          state.kind === "premiseChanged" &&
          state.code !== PHOTOS_UNAVAILABLE
        ) {
          await reconcile();
        }
      }
    });
  };

  const open = (decision: Decision) => {
    setFieldError(null);
    setDialog(decision);
  };

  const done =
    outcome !== null &&
    (outcome.kind === "approved" ||
      outcome.kind === "rejected" ||
      outcome.kind === "returned")
      ? outcome
      : null;

  const actions =
    !canDecide || done !== null ? undefined : (
      <>
        <Button
          variant="primary"
          disabled={deciding || approvalBlocked}
          onClick={() => open("approve")}
        >
          承認する
        </Button>
        <div className="cm01-pair">
          {data.stance === "overdueProxy" ? null : (
            <Button
              variant="secondary"
              disabled={deciding}
              onClick={() => open("sendBack")}
            >
              差し戻す
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={deciding}
            onClick={() => open("reject")}
          >
            否認する
          </Button>
        </div>
      </>
    );

  return (
    <ManageShell
      context="サービス運営"
      homeTo={standingLost ? "/me" : OPS_HOME}
      solo={standingLost}
    >
      <ManagePage
        title={
          <ManageTitle>
            {standingLost ? null : (
              <TextLink to={OPS_HOME} className="cm01-back">
                対応が必要なものへ戻る
              </TextLink>
            )}
            <ManageHeading>申請の判断</ManageHeading>
          </ManageTitle>
        }
        {...(standingLost ? {} : { nav: <OpsNav /> })}
        {...(actions === undefined
          ? {}
          : {
              actions,
              ...(data.stance === "overdueProxy"
                ? {
                    actionsNote:
                      "期間超過の代行では、承認と否認だけを行えます。",
                  }
                : {}),
            })}
      >
        {done !== null ? (
          <Done data={data} outcome={done} />
        ) : (
          <ManageBody>
            <div ref={alertRef} tabIndex={-1}>
              <OutcomeAlert
                outcome={outcome}
                onRetry={run}
                reload={async () => {
                  await reconcile();
                  setOutcome(null);
                }}
                kindTitle={kindTitle}
              />
            </div>
            {canDecide && data.content.noPhotoLeft ? (
              <Alert title="この申請は承認できません">
                申請の写真が、提出の後にすべて掲載から外されるか削除されました。反映できる写真がないため、承認できません。申請は確認中のままです。否認するか、差し戻して写真を求めてください。
              </Alert>
            ) : null}
            <StanceNotice data={data} />
            <ClosedNotice status={data.status} />
            <ApplicationSection data={data} status={status} />
            <ContentSections
              content={data.content}
              variant="cm"
              idPrefix="cm01"
              approved={data.status.kind === "approved"}
            />
            {data.facts.kind === "registration" ? (
              <ManageSection
                id="cm01-match"
                title="名称・所在地が近い既存の店舗"
              >
                {data.facts.similarPlaces.length === 0 ? (
                  <p className="m-field__help">
                    名称・所在地が近い既存の店舗は見つかりませんでした。
                  </p>
                ) : (
                  <PlaceCandidates places={data.facts.similarPlaces} />
                )}
                <PlaceMatchSearch />
              </ManageSection>
            ) : null}
          </ManageBody>
        )}
      </ManagePage>
      <ConfirmDialog
        open={dialog === "approve"}
        title={`${kindTitle}を承認しますか`}
        confirmLabel={deciding ? "承認しています…" : "承認する"}
        pending={deciding}
        onConfirm={() => run("approve")}
        onCancel={() => setDialog(null)}
      >
        <p>承認すると、次の内容を反映します。判断は変えられません。</p>
        <ul>
          {data.approveEffects.map((effect) => (
            <li key={effect}>{effect}</li>
          ))}
        </ul>
        {data.content.preview === null ? null : (
          <section
            className="cm01-preview"
            aria-labelledby={`${textId}-preview`}
          >
            <h3 className="cm01-preview__title" id={`${textId}-preview`}>
              承認で反映される内容
            </h3>
            <p className="m-field__help">
              対象の現在の内容に、申請の項目を重ねた内容です。
            </p>
            <ContentList rows={data.content.preview} variant="cm" />
          </section>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "reject"}
        title={`${kindTitle}を否認しますか`}
        confirmLabel={deciding ? "否認しています…" : "否認する"}
        pending={deciding}
        onConfirm={() => run("reject")}
        onCancel={() => setDialog(null)}
      >
        <p>
          否認すると、申請者に理由とともに通知が届きます。判断は変えられません。
        </p>
        <Field
          id={`${textId}-reason`}
          label="否認の理由"
          requirement="required"
          {...(fieldError === null ? {} : { error: fieldError })}
        >
          {(control) => (
            <Textarea
              {...control}
              name="reason"
              rows={3}
              maxLength={REVIEW_TEXT_MAX}
              value={reason}
              disabled={deciding}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          )}
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "sendBack"}
        title={`${kindTitle}を差し戻しますか`}
        confirmLabel={deciding ? "差し戻しています…" : "差し戻す"}
        pending={deciding}
        onConfirm={() => run("sendBack")}
        onCancel={() => setDialog(null)}
      >
        <p>
          差し戻すと、申請者が追加の確認に答えて再提出できます。再提出されると、申請は確認中に戻ります。
        </p>
        <Field
          id={`${textId}-request`}
          label="追加で必要な確認"
          requirement="required"
          {...(fieldError === null ? {} : { error: fieldError })}
        >
          {(control) => (
            <Textarea
              {...control}
              name="request"
              rows={3}
              maxLength={REVIEW_TEXT_MAX}
              value={request}
              disabled={deciding}
              onChange={(event) => setRequest(event.currentTarget.value)}
            />
          )}
        </Field>
      </ConfirmDialog>
    </ManageShell>
  );
}
