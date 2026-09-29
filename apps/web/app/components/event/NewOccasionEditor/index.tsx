"use client";

import { useNavigate } from "@tanstack/react-router";
import { useRef, useState, useTransition } from "react";
import {
  ManageHeading,
  ManageNav,
  ManagePage,
  ManageTitle,
  ProxyBanner,
} from "@/components/layout/ManageShell";
import { OpsSearchReturnLink } from "@/components/ops/OpsSearchReturn";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { newId } from "@/presentation/newId";
import { registerOccasionFn } from "@/presentation/occasion";
import {
  EMPTY_OCCASION_FORM,
  OCCASION_FIELD_ANCHOR,
  OCCASION_FIELD_LABEL,
  OCCASION_FIELDS,
  type OccasionFieldErrors,
  type OccasionFormValues,
  occasionFieldErrors,
  toOccasionContent,
} from "@/presentation/occasionForm";
import type { AreaLists } from "@/presentation/placeView";
import { OccasionFormFields } from "../OccasionEditor/OccasionFormFields";

type SubmitState = Readonly<{
  error: ErrorState | null;
  fields: OccasionFieldErrors;
}>;

/** `registerOccasion`'s answer when the id already holds another event. */
const OCCASION_ID_CONFLICT = "OCCASION_ID_CONFLICT";

function RegisterNav() {
  return (
    <ManageNav
      label="イベントの運営"
      proxy={
        <ProxyBanner label="サービス運営者として登録中">
          <OpsSearchReturnLink />
        </ProxyBanner>
      }
      links={<TextLink to="/me">マイページ</TextLink>}
    />
  );
}

/**
 * EM-02 新規 (EVT-12): an operator registers an event as a draft, without
 * an event operator. The registration is idempotent on the id minted for
 * this entry, so a lost answer is resent as a replay, and an edited resend
 * of a stored registration is told apart. Once registered the screen
 * continues as the event's EM-02, from where it is published.
 */
export function NewOccasionEditor({ lists }: { lists: AreaLists }) {
  const navigate = useNavigate();
  const [values, setValues] = useState<OccasionFormValues>(EMPTY_OCCASION_FORM);
  const [state, setState] = useState<SubmitState>({ error: null, fields: {} });
  const [registering, startRegister] = useTransition();
  // Kept until the registration is known to have gone through: a failed
  // attempt may have been stored with only its answer lost, so a resend
  // (edited or not) must reach the same id.
  const attemptId = useRef<string | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY_OCCASION_FORM);

  const register = () =>
    startRegister(async () => {
      setTaken(null);
      const built = toOccasionContent(values);
      if (!built.ok) {
        setState({
          error: {
            kind: "invalidInput",
            code: null,
            message: "入力内容を確かめてください",
            fieldErrors: {},
            missing: [],
          },
          fields: built.errors,
        });
        return;
      }
      attemptId.current ??= newId();
      const occasionId = attemptId.current;
      try {
        await registerOccasionFn({
          data: { occasionId, content: built.content },
        });
        attemptId.current = null;
        await navigate({
          to: "/manage/events/$occasionId/info",
          params: { occasionId },
          search: { created: true },
          replace: true,
        });
      } catch (error) {
        const classified = classifyError(error);
        if (
          classified.kind === "conflict" &&
          classified.code === OCCASION_ID_CONFLICT
        ) {
          setTaken(occasionId);
          setState({ error: null, fields: {} });
          return;
        }
        setState({
          error: classified,
          fields: occasionFieldErrors(classified),
        });
      }
    });

  const failure = state.error;
  const listed = OCCASION_FIELDS.filter(
    (field) => state.fields[field] !== undefined,
  );
  return (
    <ManagePage
      title={
        <ManageTitle>
          <ManageHeading>イベントを登録</ManageHeading>
        </ManageTitle>
      }
      nav={<RegisterNav />}
      actions={
        <Button type="submit" form="event-form" disabled={registering}>
          {registering ? "登録しています…" : "登録する"}
        </Button>
      }
      {...(dirty
        ? {
            actionsNote:
              "登録していない入力があります。登録せずに画面を離れると、イベントは作られず、入力した内容は残りません。",
          }
        : {})}
    >
      <form
        className="m-body"
        id="event-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          register();
        }}
      >
        {taken === null ? null : (
          <Alert
            title="このイベントは、すでに登録されていました"
            actions={
              <ButtonLink
                variant="secondary"
                to="/manage/events/$occasionId/info"
                params={{ occasionId: taken }}
              >
                登録されたイベントを開く
              </ButtonLink>
            }
          >
            通信が途切れる前の登録が届いていました。そのあとに変えた内容は登録していません。登録されたイベントを開いて、イベント情報を確かめてください。
          </Alert>
        )}
        {failure === null ? null : failure.kind === "invalidInput" ? (
          <Alert
            title="登録できませんでした"
            list={listed.map((field) => (
              <li key={field}>
                <a
                  className="text-button"
                  href={`#${OCCASION_FIELD_ANCHOR[field]}`}
                >
                  {OCCASION_FIELD_LABEL[field]}
                </a>
              </li>
            ))}
          >
            {listed.length === 0
              ? failure.message
              : "次の項目を直してください。"}
          </Alert>
        ) : (
          <Alert
            title="登録できませんでした"
            {...(failure.kind === "failed"
              ? {
                  actions: (
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={registering}
                    >
                      もう一度登録
                    </Button>
                  ),
                }
              : {})}
          >
            {failure.kind === "failed"
              ? "通信を確かめて、もう一度登録してください。入力した内容は残っています。"
              : failure.message}
          </Alert>
        )}
        <Notice
          variant="manage"
          tone="paper"
          title="イベントを下書きとして登録します"
        >
          保存すると、イベントは下書きとして登録され、この画面のまま公開へ進めます。保存せずにやめると、イベントは登録されません。登録したイベントは運営者が不在のイベントになります。管理権限は、メンバーから付与します。
        </Notice>
        <OccasionFormFields
          values={values}
          onChange={(change) =>
            setValues((current) => ({ ...current, ...change }))
          }
          errors={state.fields}
          lists={lists}
          disabled={registering}
        />
      </form>
    </ManagePage>
  );
}
