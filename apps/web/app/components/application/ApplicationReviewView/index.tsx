"use client";

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
import { EventNav, EventTarget } from "@/components/event/EventShell";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageSection,
  ManageShell,
  ManageTitle,
} from "@/components/layout/ManageShell";
import { OPS_HOME, OpsNav } from "@/components/ops/OpsShell";
import { RegionNav, RegionTarget } from "@/components/region/RegionShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DonePanel } from "@/components/ui/DonePanel";
import { Field, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Row } from "@/components/ui/Rows";
import { TextLink } from "@/components/ui/TextButton";
import type { StatusData } from "@/presentation/applicationContent";
import {
  type ApplicationReviewData,
  type ApprovalResult,
  approveApplicationFn,
  REVIEW_TEXT_MAX,
  type ReviewFrame,
  type ReviewSeat,
  type ReviewStance,
  type ReviewSubjectItem,
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
const AWAITING_STEWARDS = "APPLICATION_AWAITING_STEWARDS";
const OVERDUE_PROXY_CANNOT_RETURN = "APPLICATION_OVERDUE_PROXY_CANNOT_RETURN";

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
      /** The stance the screen showed when the decision was taken. */
      stance: ReviewStance;
    }>
  | Readonly<{ kind: "lapsed"; premises: readonly string[] }>
  | Readonly<{ kind: "rejected"; overdueProxy: boolean; stance: ReviewStance }>
  | Readonly<{ kind: "returned" }>
  | Readonly<{
      kind: "error";
      decision: Decision;
      error: ErrorState;
      /** The stance the refused decision was taken in. */
      stance: ReviewStance;
    }>;

/** CM-01's review path: another application's CM-01. */
const reviewPath = (id: string): string =>
  `/manage/applications/${encodeURIComponent(id)}`;

/** The list CM-01 returns to (RM-01, EM-01 or OM-01), by its frame. */
function backOf(frame: ReviewFrame): Readonly<{ to: string; label: string }> {
  switch (frame.kind) {
    case "region":
      return {
        to: `/manage/regions/${encodeURIComponent(frame.frame.regionId)}`,
        label: "所属店舗と申請へ戻る",
      };
    case "occasion":
      return {
        to: `/manage/events/${encodeURIComponent(frame.frame.occasionId)}`,
        label: "参加店舗と申請へ戻る",
      };
    case "ops":
      return { to: OPS_HOME, label: "対応が必要なものへ戻る" };
  }
}

/** 地域運営者 / イベント運営者, and the seat's OM-03. */
function seatWords(seat: ReviewSeat): Readonly<{
  stewards: string;
  role: string;
  opsPath: string;
  opsLabel: string;
}> {
  return seat.kind === "region"
    ? {
        stewards: "地域運営者",
        role: "地域の運営者",
        opsPath: `/ops/subjects/region/${encodeURIComponent(seat.id)}`,
        opsLabel: "地域の運営へ",
      }
    : {
        stewards: "イベント運営者",
        role: "イベントの運営者",
        opsPath: `/ops/subjects/occasion/${encodeURIComponent(seat.id)}`,
        opsLabel: "イベントの運営へ",
      };
}

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

/**
 * Who decided an approved or rejected application: the overdue proxy, or
 * the region's or event's operators (運営者が先に判断した申請は、そのことが
 * 分かる — told to the operators, who could otherwise have stood in).
 */
function decidedText(
  data: ApplicationReviewData,
  decision: "承認" | "否認",
  overdueProxy: boolean,
): string {
  if (overdueProxy) {
    return `一定の期間を過ぎたため、サービス運営者が期間超過の代行として${decision}しました。`;
  }
  if (data.seat === null) return "";
  const who = `${data.seat.name}の${seatWords(data.seat).role}`;
  return data.frame.kind === "ops"
    ? `${who}が判断し、${decision}しました。期間超過の代行による判断ではありません。`
    : `${who}が${decision}しました。`;
}

/** 確認中でない: the current status, who decided it, and that no decision is needed. */
function ClosedNotice({ data }: { data: ApplicationReviewData }) {
  const { status } = data;
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
          {`${decidedText(data, "承認", status.overdueProxy)}判断は変えられません。`}
        </Notice>
      );
    case "rejected":
      return (
        <Notice
          variant="manage"
          tone="paper"
          title="この申請は否認されています"
        >
          {`${decidedText(data, "否認", status.overdueProxy)}否認の理由: ${status.reason}`}
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
  const { seat } = data;
  const words = seat === null ? null : seatWords(seat);
  switch (data.stance) {
    case "approver":
      // An operator deciding a region / event application is standing in
      // for its absent stewards (不在の代行): CM-01 says so.
      return seat !== null && words !== null && data.frame.kind === "ops" ? (
        <Notice
          variant="manage"
          title={`運営者が不在の${seat.kind === "region" ? "地域" : "イベント"}への申請です`}
        >
          {`${seat.name}には${words.stewards}がいないため、サービス運営者が${words.role}として判断します。`}
        </Notice>
      ) : null;
    case "overdueProxy":
      return (
        <Notice variant="manage" title="期間超過の代行">
          {`${seat === null || words === null ? "運営者" : `${seat.name}の${words.stewards}`}が、一定の期間この申請を確認していません。サービス運営者が代わりに承認か否認を判断できます。判断は、期間超過の代行として記録されます。`}
        </Notice>
      );
    case "awaitingStewards":
      return (
        <Notice
          variant="manage"
          tone="paper"
          title="運営者の判断を待つ申請です"
        >
          {`${seat === null || words === null ? "運営者がいるため、" : `${seat.name}には${words.stewards}がいます。`}一定の期間を過ぎるまでは、${words?.stewards ?? "運営者"}が判断します。期間を過ぎると、期間超過の代行ができます${data.proxyableAt === null ? "" : `（${monthDayText(data.proxyableAt)}から）`}。`}
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

/**
 * A subject that exists as its photo row, with its page to check it on;
 * one that does not exist (yet) as text.
 */
function ReviewSubject({ subject }: { subject: ReviewSubjectItem }) {
  if (subject.row === null) return <SubjectValue subject={subject} />;
  const { photoUrl } = subject.row;
  return (
    <>
      <Row
        photo={photoUrl === null ? null : { src: photoUrl, alt: "" }}
        name={subject.name}
        {...(subject.note === null ? {} : { sub: subject.note })}
      />
      {subject.href === null ? null : (
        <TextLink to={subject.href}>{subject.label}ページで確かめる</TextLink>
      )}
    </>
  );
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
              <ReviewSubject subject={subject} />
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

/**
 * A decision refused because the standing it was taken in changed
 * before it was stored — CS-15 and the moves between the absence proxy,
 * the overdue proxy and 期間超過の前 (`spec/pages/shared.md` CM-01). The
 * screen has been read again, so `data.stance` is the standing now.
 */
function StandingAlert({
  data,
  outcome,
}: {
  data: ApplicationReviewData;
  outcome: Extract<Outcome, { kind: "error" }>;
}) {
  const word = DECISION_WORD[outcome.decision];
  const { seat } = data;
  const words = seat === null ? null : seatWords(seat);
  const joined =
    seat === null || words === null
      ? "運営者が就きました。"
      : `${seat.name}に${words.stewards}が就きました。`;
  const toSeat =
    words === null ? undefined : (
      <TextLink to={words.opsPath}>{words.opsLabel}</TextLink>
    );
  if (outcome.error.code === AWAITING_STEWARDS) {
    return (
      <Alert
        title="運営者の判断を待つ申請になりました"
        {...(toSeat === undefined ? {} : { actions: toSeat })}
      >
        {`${joined}一定の期間を過ぎていない申請は、${words?.stewards ?? "運営者"}が判断します。${word}は反映していません。`}
      </Alert>
    );
  }
  if (outcome.error.code === OVERDUE_PROXY_CANNOT_RETURN) {
    return (
      <Alert title="期間超過の代行になりました">
        {`${joined}一定の期間を過ぎた申請は、期間超過の代行として承認か否認だけを行えます。差し戻しは反映していません。`}
      </Alert>
    );
  }
  if (outcome.stance === "overdueProxy" && data.stance === "approver") {
    return (
      <Alert title="運営者が不在の申請になりました">
        {`${seat === null || words === null ? "運営者がいなくなりました。" : `${seat.name}の${words.stewards}がいなくなりました。`}サービス運営者が${words?.role ?? "運営者"}として判断します。${word}は反映していません。もう一度判断してください。`}
      </Alert>
    );
  }
  if (outcome.stance === "approver" && data.stance === "overdueProxy") {
    return (
      <Alert title="期間超過の代行になりました">
        {`${joined}判断は、期間超過の代行として行います。${word}は反映していません。もう一度判断してください。`}
      </Alert>
    );
  }
  return (
    <Alert
      title={`${word}できませんでした`}
      {...(toSeat === undefined ? {} : { actions: toSeat })}
    >
      {`この申請を判断する立場が変わったため、${word}は反映していません。申請の現在の状態を示しています。`}
    </Alert>
  );
}

function OutcomeAlert({
  data,
  outcome,
  onRetry,
  reload,
  kindTitle,
}: {
  data: ApplicationReviewData;
  outcome: Outcome | null;
  onRetry: (decision: Decision) => void;
  reload: () => Promise<void>;
  kindTitle: string;
}) {
  const [reloading, startReload] = useTransition();
  if (outcome === null) return null;
  const back = backOf(data.frame);
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
      if (
        error.code === AWAITING_STEWARDS ||
        error.code === OVERDUE_PROXY_CANNOT_RETURN ||
        (error.kind === "forbidden" && data.frame.kind === "ops")
      ) {
        return <StandingAlert data={data} outcome={outcome} />;
      }
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
              actions={<TextLink to={back.to}>{back.label}</TextLink>}
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

/**
 * The operator's stance moved between the screen and the decision's commit
 * (`spec/domains/application.md`: 判断は、判断の時点の事実だけで決まる): the
 * decision is recorded as it was taken, which the screen had not shown.
 * `""` when the recorded stance is the one shown.
 */
function stanceMoved(
  data: ApplicationReviewData,
  shown: ReviewStance | null,
  recordedOverdue: boolean,
  word: string,
): string {
  if (data.frame.kind !== "ops" || shown === null) return "";
  const words = data.seat === null ? null : seatWords(data.seat);
  const seatName = data.seat?.name ?? "";
  if (shown === "overdueProxy" && !recordedOverdue) {
    return words === null
      ? `判断の時点で、運営者がいなくなっていました。この${word}は、期間超過の代行ではなく、運営者が不在の申請の判断として記録しました。`
      : `判断の時点で、${seatName}の${words.stewards}がいなくなっていました。この${word}は、期間超過の代行ではなく、サービス運営者が${words.role}に代わって行う、運営者が不在の申請の判断として記録しました。`;
  }
  if (shown === "approver" && recordedOverdue) {
    return words === null
      ? `判断の時点で、運営者が就いていました。一定の期間を過ぎた申請のため、この${word}は期間超過の代行として記録しました。`
      : `判断の時点で、${seatName}に${words.stewards}が就いていました。一定の期間を過ぎた申請のため、この${word}は期間超過の代行として記録しました。`;
  }
  return "";
}

function Done({
  data,
  outcome,
}: {
  data: ApplicationReviewData;
  outcome: Extract<Outcome, { kind: "approved" | "rejected" | "returned" }>;
}) {
  const kindTitle = REVIEW_KIND_TITLE[data.kind];
  const { to, label } = backOf(data.frame);
  const back = (
    <ButtonLink
      variant={outcome.kind === "approved" ? "secondary" : "primary"}
      to={to}
    >
      {label}
    </ButtonLink>
  );
  const seat = data.seat === null ? null : seatWords(data.seat);
  const proxyRecord =
    data.seat === null || seat === null
      ? "運営者に代わって判断したことが、申請に記録されます。"
      : `${data.seat.name}の${seat.stewards}に代わって判断したことが、申請に記録されます。`;
  const moved = stanceMoved(
    data,
    outcome.kind === "returned" ? null : outcome.stance,
    outcome.kind === "approved"
      ? outcome.result.overdueProxy
      : outcome.kind === "rejected"
        ? outcome.overdueProxy
        : false,
    DECISION_WORD[outcome.kind === "approved" ? "approve" : "reject"],
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
          {result.companionId !== null
            ? "店舗を登録して公開しました。併せて出された管理権限の申請を、続けて判断できます。"
            : result.overdueProxy
              ? `${moved}${data.approvedText}${proxyRecord}判断は変えられません。`
              : `${moved}${data.approvedText}申請者に通知が届きます。判断は変えられません。`}
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
          {`${moved}申請者に、理由とともに通知が届きます。${outcome.overdueProxy ? proxyRecord : ""}判断は変えられません。`}
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
 * The frame by who judges (`ReviewFrame`): the region's or event's
 * management nav for its steward, the operators' otherwise. `solo` drops
 * the nav once the viewer's standing is gone (CS-05).
 */
function ReviewShell({
  frame,
  solo,
  actions,
  actionsNote,
  overlay,
  children,
}: {
  frame: ReviewFrame;
  solo: boolean;
  actions: ReactNode | undefined;
  actionsNote: ReactNode | undefined;
  /** The confirmations (CS-12), inside the frame. */
  overlay: ReactNode;
  children: ReactNode;
}) {
  const back = backOf(frame);
  const dock = {
    ...(actions === undefined ? {} : { actions }),
    ...(actionsNote === undefined ? {} : { actionsNote }),
  };
  const title = (target: ReactNode) => (
    <ManageTitle>
      {solo ? null : (
        <TextLink to={back.to} className="cm01-back">
          {back.label}
        </TextLink>
      )}
      {target}
      <ManageHeading>申請の判断</ManageHeading>
    </ManageTitle>
  );
  switch (frame.kind) {
    case "region":
      return (
        <ManageShell
          context="地域の運営"
          homeTo={solo ? "/me" : back.to}
          solo={solo}
        >
          <ManagePage
            title={title(solo ? null : <RegionTarget frame={frame.frame} />)}
            {...(solo ? {} : { nav: <RegionNav frame={frame.frame} /> })}
            {...dock}
          >
            {children}
          </ManagePage>
          {overlay}
        </ManageShell>
      );
    case "occasion":
      return (
        <ManageShell
          context="イベントの運営"
          homeTo={solo ? "/me" : back.to}
          solo={solo}
        >
          <ManagePage
            title={title(solo ? null : <EventTarget frame={frame.frame} />)}
            {...(solo
              ? {}
              : {
                  nav: (
                    <EventNav
                      occasionId={frame.frame.occasionId}
                      proxy={false}
                      current="participants"
                    />
                  ),
                })}
            {...dock}
          >
            {children}
          </ManagePage>
          {overlay}
        </ManageShell>
      );
    case "ops":
      return (
        <ManageShell
          context="サービス運営"
          homeTo={solo ? "/me" : OPS_HOME}
          solo={solo}
        >
          <ManagePage
            title={title(null)}
            {...(solo ? {} : { nav: <OpsNav current="inbox" /> })}
            {...dock}
          >
            {children}
          </ManagePage>
          {overlay}
        </ManageShell>
      );
  }
}

/**
 * CM-01 申請の判断: the application, what approval reflects, and approve /
 * reject with a reason / send back with a request, each confirmed (CS-12),
 * with the results per state — CS-13, CS-07, CS-08 (including a lapse
 * found on approval), CS-10, CS-05, CS-15, CS-02. The frame follows who
 * judges: a region's or event's steward in its management nav, the
 * operators (as the approver, the absence proxy or the overdue proxy) in
 * theirs.
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
  // A steward whose decision was refused for a lost standing (CS-05) has
  // nothing left to decide here. An operator's refusal is read again
  // instead: the standing may only have moved (absence ⇄ overdue proxy).
  const standingLost =
    outcome?.kind === "error" &&
    outcome.error.kind === "forbidden" &&
    data.frame.kind !== "ops";
  const canDecide =
    underReview &&
    !standingLost &&
    (data.stance === "approver" || data.stance === "overdueProxy");
  const approvalBlocked =
    data.content.noPhotoLeft ||
    (outcome?.kind === "error" && outcome.error.code === PHOTOS_UNAVAILABLE);

  const run = (decision: Decision) => {
    const stance = data.stance;
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
              ? { kind: "approved", result, stance }
              : { kind: "lapsed", premises: result.premises };
        } else if (decision === "reject") {
          const result = await rejectApplicationFn({
            data: { ...base, reason },
          });
          next = {
            kind: "rejected",
            overdueProxy: result.overdueProxy,
            stance,
          };
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
          setOutcome({ kind: "error", decision, error: state, stance });
        });
        const reread =
          (state.kind === "premiseChanged" &&
            state.code !== PHOTOS_UNAVAILABLE) ||
          (state.kind === "forbidden" && data.frame.kind === "ops");
        if (reread) await reconcile();
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

  const overlay = (
    <>
      <ConfirmDialog
        open={dialog === "approve"}
        title={`${kindTitle}を承認しますか`}
        confirmLabel={deciding ? "承認しています…" : "承認する"}
        pending={deciding}
        onConfirm={() => run("approve")}
        onCancel={() => setDialog(null)}
      >
        <p>
          {data.stance === "overdueProxy"
            ? "承認すると、期間超過の代行として次の内容を反映します。判断は変えられません。"
            : "承認すると、次の内容を反映します。判断は変えられません。"}
        </p>
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
          {data.stance === "overdueProxy"
            ? "否認すると、期間超過の代行として記録され、申請者に理由とともに通知が届きます。判断は変えられません。"
            : "否認すると、申請者に理由とともに通知が届きます。判断は変えられません。"}
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
    </>
  );

  return (
    <ReviewShell
      frame={data.frame}
      solo={standingLost}
      actions={actions}
      actionsNote={
        actions !== undefined && data.stance === "overdueProxy"
          ? "期間超過の代行では、承認と否認だけを行えます。"
          : undefined
      }
      overlay={overlay}
    >
      {done !== null ? (
        <Done data={data} outcome={done} />
      ) : (
        <ManageBody>
          <div ref={alertRef} tabIndex={-1}>
            <OutcomeAlert
              data={data}
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
          <ClosedNotice data={data} />
          <ApplicationSection data={data} status={status} />
          <ContentSections
            content={data.content}
            variant="cm"
            idPrefix="cm01"
            approved={data.status.kind === "approved"}
          />
          {data.facts.kind === "registration" ? (
            <ManageSection id="cm01-match" title="名称・所在地が近い既存の店舗">
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
    </ReviewShell>
  );
}
