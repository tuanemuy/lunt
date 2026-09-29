"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { DonePanel } from "@/components/ui/DonePanel";
import { Field, Fieldset, Input, Textarea } from "@/components/ui/Field";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  CLAIMANT_STANDINGS,
  type ClaimantStandingValue,
  detailPath,
  STANDING_LABEL,
  submitTakedownClaimFn,
  type TakedownPhoto,
  type TakedownTargetRow,
} from "@/presentation/moderation";
import { newId } from "@/presentation/newId";
import { useReconcile } from "@/presentation/reconcile";
import {
  ReportTargetRowView,
  ReportTitle,
  ReportUnavailable,
} from "../ReportParts";

const HEADING = "取り下げを申し立てる";
const FORM_ID = "rq07-form";
const CODE_PHOTO_NOT_IN_TARGET =
  "MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET";
const CODE_TARGET_UNAVAILABLE = "MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE";
const CODE_REASON = "MODERATION_INVALID_TAKEDOWN_REASON";
const CODE_EMAIL = "COMMON_INVALID_EMAIL_ADDRESS";
const CODE_GROUND = "MODERATION_INVALID_TAKEDOWN_GROUND";

type Values = Readonly<{
  /** Nothing is chosen until the claimant picks (CS-10 when missing). */
  standing: ClaimantStandingValue | null;
  photoIds: readonly string[];
  reason: string;
  email: string;
}>;

type FieldErrors = Readonly<{
  standing?: string;
  photos?: string;
  reason?: string;
  email?: string;
}>;

type Outcome =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "invalid"; fields: FieldErrors }>
  | Readonly<{ kind: "removed"; photos: readonly TakedownPhoto[] }>
  | Readonly<{ kind: "failed"; error: ErrorState }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "done"; email: string }>;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The required fields the design checks before sending (CS-10). */
function missingFields(values: Values): FieldErrors {
  return {
    ...(values.standing === null
      ? { standing: "申し立てる人の立場を選んでください。" }
      : {}),
    ...(values.standing === "photoRightsHolder" && values.photoIds.length === 0
      ? { photos: "削除を求める写真を、1枚以上選んでください。" }
      : {}),
    ...(values.reason.trim() === ""
      ? { reason: "理由を入力してください。" }
      : {}),
    ...(values.email.trim() === ""
      ? { email: "メールアドレスを入力してください。" }
      : EMAIL_SHAPE.test(values.email.trim())
        ? {}
        : {
            email:
              "メールアドレスの形式が正しくありません（例: name@example.com）。",
          }),
  };
}

/** A business rejection of a field, as that field's message. */
function fieldsOf(error: ErrorState): FieldErrors | null {
  switch (error.code) {
    case CODE_REASON:
      return { reason: "理由を2,000文字以内で入力してください。" };
    case CODE_EMAIL:
      return {
        email:
          "メールアドレスの形式が正しくありません（例: name@example.com）。",
      };
    case CODE_GROUND:
      return { photos: "削除を求める写真を、1枚以上選んでください。" };
    default:
      return null;
  }
}

const FIELD_ANCHORS = [
  ["standing", "rq07-standing", "申し立てる人の立場"],
  ["photos", "rq07-photos", "削除を求める写真"],
  ["reason", "rq07-reason", "理由"],
  ["email", "rq07-email", "メールアドレス"],
] as const;

/**
 * Whether a claimant may stand as the proprietor: a region or an event
 * takes photo rights holders only (RQ-07, from DT-03・DT-04), so the
 * proprietor is shown but cannot be chosen and the rights holder starts
 * chosen.
 */
const proprietorAllowed = (kind: TakedownTargetRow["kind"]): boolean =>
  kind === "place" || kind === "listing";

function standingHelp(kind: TakedownTargetRow["kind"]): string {
  switch (kind) {
    case "place":
      return "店舗本人は、この店舗の取り下げを求めます。Lunt への掲載をやめたい店舗管理者も、店舗本人としてここから申し立てます。写真の権利者は、削除を求める写真を選びます。";
    case "listing":
      return "店舗本人は、この掲載の取り下げを求めます。写真の権利者は、削除を求める写真を選びます。";
    case "region":
    case "occasion":
      return "地域・イベントは、写真の権利者として申し立てます。店舗本人は選べません。";
  }
}

/**
 * RQ-07 取り下げの申立て (MOD-01): no login. The claimant's standing,
 * the photos a rights holder names, the reason and the address the
 * outcome goes to. A photo the target lost while the form was open keeps
 * the claim unsent (写真が外された); the reconcile brings the current
 * photos and the typed values stay.
 */
export function TakedownClaimForm({
  target,
  photos,
}: {
  target: TakedownTargetRow;
  photos: readonly TakedownPhoto[];
}) {
  const reconcile = useReconcile();
  const canBeProprietor = proprietorAllowed(target.kind);
  const [values, setValues] = useState<Values>({
    standing: canBeProprietor ? null : "photoRightsHolder",
    photoIds: [],
    reason: "",
    email: "",
  });
  const attempt = useRef<{ id: string; key: string } | null>(null);
  const back = detailPath(target.kind, target.id);

  const [outcome, submit, sending] = useActionState(
    async (_previous: Outcome): Promise<Outcome> => {
      const missing = missingFields(values);
      const { standing } = values;
      if (standing === null || Object.keys(missing).length > 0) {
        return { kind: "invalid", fields: missing };
      }
      const payload = {
        standing,
        target: { kind: target.kind, id: target.id },
        photoIds: standing === "photoRightsHolder" ? [...values.photoIds] : [],
        reason: values.reason,
        email: values.email.trim(),
      };
      const key = JSON.stringify(payload);
      if (attempt.current?.key !== key) {
        attempt.current = { id: newId(), key };
      }
      try {
        await submitTakedownClaimFn({
          data: { claimId: attempt.current.id, ...payload },
        });
        attempt.current = null;
        return { kind: "done", email: payload.email };
      } catch (error) {
        const state = classifyError(error);
        if (state.code === CODE_TARGET_UNAVAILABLE) {
          return { kind: "unavailable" };
        }
        if (state.code === CODE_PHOTO_NOT_IN_TARGET) {
          const gone = new Set(
            state.kind === "invalidInput" ? state.missing : [],
          );
          const removed = photos.filter((photo) => gone.has(photo.photoId));
          setValues((current) => ({
            ...current,
            photoIds: current.photoIds.filter((id) => !gone.has(id)),
          }));
          await reconcile();
          return { kind: "removed", photos: removed };
        }
        const fields = fieldsOf(state);
        if (fields !== null) return { kind: "invalid", fields };
        return { kind: "failed", error: state };
      }
    },
    { kind: "none" },
  );
  const [, startSubmit] = useTransition();

  if (outcome.kind === "unavailable") {
    return <ReportUnavailable heading={HEADING} noun="申立て" />;
  }
  if (outcome.kind === "done") {
    return (
      <ManagePage title={<ReportTitle heading={HEADING} />}>
        <FocusOnMount>
          <DonePanel
            title="申立てを受け付けました"
            actions={
              <>
                <ButtonLink to={back}>{`${target.name}に戻る`}</ButtonLink>
                <ButtonLink variant="secondary" to="/">
                  みつけるへ
                </ButtonLink>
              </>
            }
          >
            {`結果は、入力したメールアドレス（${outcome.email}）に届きます。申立ての状況を確かめる画面と、申立てを取り消す操作はありません。`}
          </DonePanel>
        </FocusOnMount>
      </ManagePage>
    );
  }

  const fields: FieldErrors = outcome.kind === "invalid" ? outcome.fields : {};
  const dirty =
    values.reason !== "" || values.email !== "" || values.photoIds.length > 0;
  const rights = values.standing === "photoRightsHolder";
  const togglePhoto = (photoId: string, checked: boolean) =>
    setValues((current) => ({
      ...current,
      photoIds: checked
        ? [...current.photoIds, photoId]
        : current.photoIds.filter((id) => id !== photoId),
    }));

  return (
    <ManagePage
      title={<ReportTitle heading={HEADING} />}
      actions={
        <>
          <Button type="submit" form={FORM_ID} disabled={sending}>
            {sending ? "送っています…" : "申し立てる"}
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
        <ManageBody>
          <p className="my-lead">
            ログインせずに申し立てられます。結果は、入力したメールアドレスに届きます。
          </p>
          {outcome.kind === "failed" ? (
            <Alert
              title="申立てを送れませんでした"
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
              title="申立てを送れませんでした"
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
          {outcome.kind === "removed" ? (
            <Alert title="選んだ写真は、すでに対象から外されています">
              申立ては送られていません。入力した内容は残っています。対象の現在の写真から選び直すか、申立てをやめてください。
            </Alert>
          ) : null}
          {outcome.kind === "removed" && outcome.photos.length > 0 ? (
            <ul className="rq07-removed-list">
              {outcome.photos.map((photo) => (
                <li className="rq07-removed" key={photo.photoId}>
                  <span className="rq07-removed__thumb">
                    {photo.url === null ? null : (
                      <img src={photo.url} alt="外された写真" />
                    )}
                  </span>
                  <span className="rq07-removed__text">
                    <span className="m-row__name">選んでいた写真</span>
                    <Badge tone="alert">外された</Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="m-field">
            <p className="m-field__label">申立ての対象</p>
            <ReportTargetRowView row={target} />
          </div>

          <div id="rq07-standing">
            <ChoiceGroup
              legend="申し立てる人の立場"
              name="standing"
              requirement="required"
              choices={CLAIMANT_STANDINGS.map((value) => ({
                value,
                label: STANDING_LABEL[value],
                ...(value === "proprietor" && !canBeProprietor
                  ? { disabled: true }
                  : {}),
              }))}
              value={values.standing}
              onChange={(standing) =>
                setValues((current) => ({ ...current, standing }))
              }
              {...(fields.standing === undefined
                ? {}
                : { error: fields.standing })}
              help={standingHelp(target.kind)}
            />
          </div>

          {rights ? (
            <Fieldset
              id="rq07-photos"
              legend="削除を求める写真"
              requirement="required"
              {...(fields.photos === undefined ? {} : { error: fields.photos })}
              help="対象の写真から、削除を求める写真を選びます。複数選べます。"
            >
              {photos.length === 0 ? (
                <p className="m-field__help">
                  この対象には、いま写真がありません。
                </p>
              ) : (
                <div
                  className="rq07-photos"
                  aria-invalid={fields.photos === undefined ? undefined : true}
                >
                  {photos.map((photo, index) => (
                    <label className="rq07-photo" key={photo.photoId}>
                      <input
                        type="checkbox"
                        name="photo"
                        value={photo.photoId}
                        checked={values.photoIds.includes(photo.photoId)}
                        onChange={(event) =>
                          togglePhoto(
                            photo.photoId,
                            event.currentTarget.checked,
                          )
                        }
                      />
                      <span className="rq07-photo__img">
                        {photo.url === null ? null : (
                          <img src={photo.url} alt={`${index + 1}枚目の写真`} />
                        )}
                      </span>
                      <span className="rq07-photo__cap">
                        {`${index + 1}枚目`}
                        <span className="rq07-photo__mark">選択中</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </Fieldset>
          ) : null}

          <Field
            id="rq07-reason"
            label="理由"
            requirement="required"
            {...(fields.reason === undefined ? {} : { error: fields.reason })}
          >
            {(control) => (
              <Textarea
                {...control}
                name="reason"
                rows={4}
                placeholder="取り下げを求める理由を書きます"
                value={values.reason}
                onChange={(event) => {
                  const reason = event.currentTarget.value;
                  setValues((current) => ({ ...current, reason }));
                }}
              />
            )}
          </Field>

          <Field
            id="rq07-email"
            label="メールアドレス"
            requirement="required"
            help="申立ての結果を、このメールアドレスに送ります。"
            {...(fields.email === undefined ? {} : { error: fields.email })}
          >
            {(control) => (
              <Input
                {...control}
                name="email"
                type="email"
                autoComplete="email"
                placeholder="例: name@example.com"
                value={values.email}
                onChange={(event) => {
                  const email = event.currentTarget.value;
                  setValues((current) => ({ ...current, email }));
                }}
              />
            )}
          </Field>

          <Notice variant="manage" tone="paper" title="申し立てた後のこと">
            申立ての状況を確かめる画面と、申立てを取り消す操作はありません。結果は、入力したメールアドレスに届きます。
          </Notice>
        </ManageBody>
      </form>
    </ManagePage>
  );
}
