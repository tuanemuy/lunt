"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Field, Textarea } from "@/components/ui/Field";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { HydrationGate } from "@/components/ui/HydrationGate";
import { Notice } from "@/components/ui/Notice";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  CATEGORY_LABEL,
  detailPath,
  INFO_REPORT_CATEGORIES,
  INFO_REPORT_SOURCE_LABEL,
  type InfoReportCategoryValue,
  type InfoReportSource,
  type ReportTargetRow,
  revisionPath,
  submitInfoReportFn,
} from "@/presentation/moderation";
import { newId } from "@/presentation/newId";
import {
  ReportTargetRowView,
  ReportTitle,
  ReportUnavailable,
} from "../ReportParts";

const HEADING = "情報の誤り・閉店を連絡する";
const FORM_ID = "rq08-form";
const CODE_UNAVAILABLE = "MODERATION_INFO_REPORT_TARGET_UNAVAILABLE";
const CODE_NO_STEWARD = "MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD";
const CODE_CONTENT = "MODERATION_INVALID_INFO_REPORT_CONTENT";
const CODE_CATEGORY = "MODERATION_INVALID_INFO_REPORT_CATEGORY";

type FieldErrors = Readonly<{ category?: string; content?: string }>;

type Outcome =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "invalid"; fields: FieldErrors }>
  | Readonly<{ kind: "failed"; error: ErrorState }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "refused" }>
  | Readonly<{ kind: "done" }>;

type Target = Readonly<{
  target: ReportTargetRow;
  /** A listing's store. */
  place: ReportTargetRow | null;
}>;

function TargetField({ target, place }: Target) {
  return (
    <div className="m-field">
      <p className="m-field__label">連絡の対象</p>
      {place === null ? (
        <ReportTargetRowView row={target} />
      ) : (
        <ul className="m-rows rq08-targets">
          <li>
            <ReportTargetRowView row={target} />
          </li>
          <li>
            <ReportTargetRowView row={place} />
          </li>
        </ul>
      )}
    </div>
  );
}

/**
 * RQ-08 受け付けない: the store has no steward, so a correction goes
 * through an application instead (RQ-02 for a store, RQ-04 for a listing).
 */
export function InfoReportRefused({ target, place }: Target) {
  const isPlace = target.kind === "place";
  return (
    <ManagePage title={<ReportTitle heading={HEADING} />}>
      <ManageBody>
        <TargetField target={target} place={place} />
        <EmptyPanel
          title="この店舗には店舗管理者がいません"
          actions={
            <>
              <ButtonLink to={revisionPath(target.kind, target.id)}>
                {isPlace ? "情報の修正を申請する" : "掲載の修正を申請する"}
              </ButtonLink>
              <ButtonLink
                variant="secondary"
                to={detailPath(target.kind, target.id)}
              >
                {`${target.name}に戻る`}
              </ButtonLink>
            </>
          }
        >
          {isPlace
            ? "店舗管理者がいない店舗は、連絡ではなく情報の修正の申請で直せます。閉店も、営業状況の変更として申請できます。申請はサービス運営者が確かめて反映します。"
            : "店舗管理者がいない店舗の掲載は、連絡ではなく掲載の修正の申請で直せます。申請はサービス運営者が確かめて反映します。"}
        </EmptyPanel>
      </ManageBody>
    </ManagePage>
  );
}

const FIELD_ANCHORS = [
  ["category", "rq08-category", "連絡の種類"],
  ["content", "rq08-content", "内容"],
] as const;

/**
 * RQ-08 情報の誤り・閉店の連絡 (MOD-04): a signed-in user tells the
 * operators about a store (or a listing and its store) that has
 * stewards. The reporter hears nothing back; the result shows on DT-01 /
 * DT-02.
 */
export function InfoReportForm({
  target,
  place,
  from,
}: Target & { from: InfoReportSource | null }) {
  const [category, setCategory] = useState<InfoReportCategoryValue | null>(
    null,
  );
  const [content, setContent] = useState("");
  const attempt = useRef<{ id: string; key: string } | null>(null);
  const back = detailPath(target.kind, target.id);

  const [outcome, submit, sending] = useActionState(
    async (_previous: Outcome): Promise<Outcome> => {
      const missing: FieldErrors = {
        ...(category === null
          ? { category: "連絡の種類を選んでください。" }
          : {}),
        ...(content.trim() === ""
          ? { content: "内容を入力してください。" }
          : {}),
      };
      if (category === null || Object.keys(missing).length > 0) {
        return { kind: "invalid", fields: missing };
      }
      const payload = {
        target: { kind: target.kind, id: target.id },
        category,
        content,
      };
      const key = JSON.stringify(payload);
      if (attempt.current?.key !== key) {
        attempt.current = { id: newId(), key };
      }
      try {
        await submitInfoReportFn({
          data: { reportId: attempt.current.id, ...payload },
        });
        attempt.current = null;
        return { kind: "done" };
      } catch (error) {
        const state = classifyError(error);
        switch (state.code) {
          case CODE_UNAVAILABLE:
            return { kind: "unavailable" };
          case CODE_NO_STEWARD:
            return { kind: "refused" };
          case CODE_CONTENT:
            return {
              kind: "invalid",
              fields: { content: "内容を2,000文字以内で入力してください。" },
            };
          case CODE_CATEGORY:
            return {
              kind: "invalid",
              fields: { category: "連絡の種類を選んでください。" },
            };
          default:
            return { kind: "failed", error: state };
        }
      }
    },
    { kind: "none" },
  );
  const [, startSubmit] = useTransition();

  if (outcome.kind === "unavailable") {
    return <ReportUnavailable heading={HEADING} noun="連絡" />;
  }
  if (outcome.kind === "refused") {
    return <InfoReportRefused target={target} place={place} />;
  }
  if (outcome.kind === "done") {
    return (
      <ManagePage title={<ReportTitle heading={HEADING} />}>
        <FocusOnMount>
          <DonePanel
            title="連絡を受け付けました"
            actions={
              <>
                <ButtonLink to={back}>{`${target.name}に戻る`}</ButtonLink>
                <ButtonLink variant="secondary" to="/">
                  みつけるへ
                </ButtonLink>
              </>
            }
          >
            {`サービス運営者が内容を確かめます。連絡の結果は通知されません。更新された内容は、${
              target.kind === "place" ? "店舗" : "掲載"
            }のページで確かめられます。`}
          </DonePanel>
        </FocusOnMount>
      </ManagePage>
    );
  }

  const fields: FieldErrors = outcome.kind === "invalid" ? outcome.fields : {};
  const dirty = category !== null || content !== "";
  return (
    <ManagePage
      title={<ReportTitle heading={HEADING} />}
      actions={
        <>
          <Button type="submit" form={FORM_ID} disabled={sending}>
            {sending ? "送っています…" : "連絡する"}
          </Button>
          <ButtonLink variant="secondary" to={back}>
            やめる
          </ButtonLink>
        </>
      }
      {...(dirty
        ? { actionsNote: "入力した内容は、送らずに画面を離れると残りません。" }
        : {})}
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => {
          // Dispatched by hand: a `<form action>` resets the controlled
          // radios to their initial state after every attempt.
          event.preventDefault();
          startSubmit(() => submit());
        }}
      >
        <HydrationGate>
          <ManageBody>
            <p className="my-lead">
              店舗や掲載の情報の誤り、店舗の閉店に気づいたときに、サービス運営者に知らせます。
            </p>
            {outcome.kind === "failed" ? (
              <Alert
                title="連絡を送れませんでした"
                {...(outcome.error.kind === "failed"
                  ? {
                      actions: (
                        <Button
                          variant="secondary"
                          type="submit"
                          disabled={sending}
                        >
                          もう一度送る
                        </Button>
                      ),
                    }
                  : {})}
              >
                {outcome.error.kind === "failed"
                  ? "通信を確かめて、もう一度送ってください。入力した内容は残っています。"
                  : outcome.error.message}
              </Alert>
            ) : null}
            {outcome.kind === "invalid" ? (
              <Alert
                title="連絡を送れませんでした"
                list={FIELD_ANCHORS.filter(
                  ([key]) => fields[key] !== undefined,
                ).map(([key, anchor, label]) => (
                  <li key={key}>
                    <a className="m-link" href={`#${anchor}`}>
                      {label}
                    </a>
                  </li>
                ))}
              >
                次の項目を直してください。
              </Alert>
            ) : null}
            {from === null ? null : (
              <Notice
                variant="manage"
                tone="paper"
                title={`${INFO_REPORT_SOURCE_LABEL[from]}から移りました`}
              >
                {`${place?.name ?? target.name}には店舗管理者がいるため、個人の申請は受け付けていません。情報の誤りや閉店は、ここからサービス運営者に連絡できます。`}
              </Notice>
            )}

            <TargetField target={target} place={place} />

            <div id="rq08-category">
              <ChoiceGroup
                legend="連絡の種類"
                name="category"
                requirement="required"
                choices={INFO_REPORT_CATEGORIES.map((value) => ({
                  value,
                  label: CATEGORY_LABEL[value],
                }))}
                value={category}
                onChange={setCategory}
                help="店舗が営業をやめていたときは「閉店」を選びます。"
                {...(fields.category === undefined
                  ? {}
                  : { error: fields.category })}
              />
            </div>

            <Field
              id="rq08-content"
              label="内容"
              requirement="required"
              help="サービス運営者が内容を確かめて対応します。"
              {...(fields.content === undefined
                ? {}
                : { error: fields.content })}
            >
              {(control) => (
                <Textarea
                  {...control}
                  name="content"
                  rows={4}
                  placeholder="どの情報が、どう違っているかを書きます"
                  value={content}
                  onChange={(event) => setContent(event.currentTarget.value)}
                />
              )}
            </Field>

            <Notice variant="manage" tone="paper" title="連絡した後のこと">
              連絡の結果は通知されません。更新された内容は、店舗と掲載のページで確かめられます。連絡の状況を確かめる画面と、連絡を取り消す操作はありません。
            </Notice>
          </ManageBody>
        </HydrationGate>
      </form>
    </ManagePage>
  );
}
