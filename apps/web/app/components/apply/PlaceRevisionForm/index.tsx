"use client";

import { useRouter } from "@tanstack/react-router";
import { useRef, useState, useTransition } from "react";
import {
  ManageBody,
  ManagePage,
  ManageSection,
  ManageStatus,
} from "@/components/layout/ManageShell";
import {
  PLACE_FIELD_ANCHOR,
  PlaceFormFields,
} from "@/components/place/PlaceFormFields";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { DonePanel } from "@/components/ui/DonePanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import {
  resubmitApplicationFn,
  submitPlaceRevisionFn,
} from "@/presentation/apply";
import {
  APPLICATION_ID_CONFLICT,
  INPUT_ERROR,
  NO_CHANGE_ERROR,
  type PlaceRevisionField,
  placeChangedFields,
  replyError,
  replyOf,
} from "@/presentation/applyForm";
import {
  type ApplyRefusal,
  applicationPath,
  type PlaceRevisionFormData,
  type PlaceStateValues,
} from "@/presentation/applyView";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { newId } from "@/presentation/newId";
import {
  PLACE_FIELD_LABEL,
  PLACE_FIELDS,
  type PlaceFieldErrors,
  placeFieldErrors,
  toPlaceProfile,
} from "@/presentation/placeForm";
import {
  OPERATING_STATUS_LABEL,
  OPERATING_STATUSES,
} from "@/presentation/placeView";
import { useReconcile } from "@/presentation/reconcile";
import { KeepOutcome } from "../ApplyOutcome";
import {
  ApplyRefused,
  ApplyTitle,
  type FieldLink,
  ModeNotice,
  ReplyField,
  ReviewList,
  refusalAfter,
  type SubmitFailure,
  SubmitFailureAlert,
  useScrollTopOn,
} from "../ApplyParts";
import { PlaceChangedNote, revisionReviewItems } from "../PlaceReview";

type Errors = Readonly<{ place: PlaceFieldErrors; reply?: string }>;

const NO_ERRORS: Errors = { place: {} };

function fieldLinks(errors: Errors): readonly FieldLink[] {
  return [
    ...PLACE_FIELDS.filter((field) => errors.place[field] !== undefined).map(
      (field) => ({
        anchor: PLACE_FIELD_ANCHOR[field],
        label: PLACE_FIELD_LABEL[field],
      }),
    ),
    ...(errors.reply === undefined
      ? []
      : [{ anchor: "apply-reply", label: "追加の確認への回答" }]),
  ];
}

const placeStateText = (status: PlaceStateValues["operatingStatus"]) =>
  `${OPERATING_STATUS_LABEL[status]} · 管理者のいない店舗`;

/**
 * RQ-02 店舗の申請 (修正) (SHP-08, APP-02, APP-04): the place without a
 * steward, starting from its current information and operating status;
 * only what differs from it is applied for, and the operating status may
 * be the only change. Opened from DT-02; a reapplication starts from the
 * place now with the ended application's items laid on; a resubmission
 * from the place now with the returned application's items laid on.
 */
export function PlaceRevisionForm({ data }: { data: PlaceRevisionFormData }) {
  const router = useRouter();
  const reconcile = useReconcile();
  const { mode, place, current } = data;
  const resubmit = mode.kind === "resubmit" ? mode : null;
  const [state, setState] = useState<PlaceStateValues>(data.start);
  const [reply, setReply] = useState("");
  const [stage, setStage] = useState<"input" | "review">("input");
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [refusal, setRefusal] = useState<ApplyRefusal | null>(null);
  const [done, setDone] = useState<"submitted" | "resubmitted" | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  useScrollTopOn(`${stage}:${done === null}:${refusal === null}`);
  const attemptId = useRef<string | null>(null);
  const changed = placeChangedFields(current, state);
  const dirty =
    JSON.stringify(state) !== JSON.stringify(data.start) || reply !== "";

  const fail = (failed: ErrorState, next: Errors) => {
    setErrors(next);
    setFailure({ kind: "error", state: failed, fields: fieldLinks(next) });
    setStage("input");
  };

  const check = () => {
    const built = toPlaceProfile(state.values);
    if (!built.ok) {
      fail(INPUT_ERROR, { place: built.errors });
      return;
    }
    if (changed.length === 0) {
      fail(NO_CHANGE_ERROR, NO_ERRORS);
      return;
    }
    setErrors(NO_ERRORS);
    setFailure(null);
    if (resubmit === null) setStage("review");
    else send();
  };

  const send = () =>
    startSend(async () => {
      const built = toPlaceProfile(state.values);
      if (!built.ok) return;
      try {
        if (resubmit !== null) {
          const result = await resubmitApplicationFn({
            data: {
              applicationId: resubmit.applicationId,
              version: resubmit.version,
              amended: {
                kind: "revision",
                profile: built.profile,
                operatingStatus: state.operatingStatus,
              },
              reply: replyOf(reply),
            },
          });
          if (result.outcome === "lapsed") {
            setFailure({
              kind: "lapsed",
              applicationId: resubmit.applicationId,
              brokenPremises: result.brokenPremises,
            });
            return;
          }
          router.clearCache();
          setDone("resubmitted");
          return;
        }
        attemptId.current ??= newId();
        const { applicationId } = await submitPlaceRevisionFn({
          data: {
            applicationId: attemptId.current,
            placeId: place.placeId,
            profile: built.profile,
            operatingStatus: state.operatingStatus,
          },
        });
        attemptId.current = null;
        // Not reloaded here: its eligibility would now refuse the screen.
        router.clearCache();
        setSubmittedId(applicationId);
        setDone("submitted");
      } catch (error) {
        const failed = classifyError(error);
        if (
          failed.kind === "conflict" &&
          failed.code === APPLICATION_ID_CONFLICT
        ) {
          setStage("input");
          setFailure({
            kind: "taken",
            applicationId: attemptId.current ?? "",
          });
          return;
        }
        if (resubmit === null) {
          const refused = await refusalAfter(failed, {
            kind: "revision",
            placeId: place.placeId,
          });
          if (refused !== null) {
            setRefusal(refused);
            return;
          }
        }
        const reason = replyError(failed);
        fail(failed, {
          place: placeFieldErrors(failed),
          ...(reason === undefined ? {} : { reply: reason }),
        });
      }
    });

  const heading =
    resubmit !== null
      ? "修正の申請を再提出"
      : stage === "review" && done === null
        ? "申請の内容を確かめる"
        : "お店の情報の修正を申請";

  if (refusal !== null) {
    return (
      <KeepOutcome
        view={
          <ApplyRefused heading={heading} refusal={refusal} what="revision" />
        }
      />
    );
  }

  const title = (
    <ApplyTitle
      heading={heading}
      target={{
        name: place.name,
        status: placeStateText(current.operatingStatus),
      }}
    />
  );

  if (done !== null) {
    const detail = applicationPath(
      resubmit?.applicationId ?? submittedId ?? "",
    );
    return (
      <KeepOutcome
        view={
          <ManagePage title={title}>
            <FocusOnMount>
              <DonePanel
                title={
                  done === "resubmitted"
                    ? "修正の申請を再提出しました"
                    : "情報の修正を申請しました"
                }
                actions={
                  <>
                    <ButtonLink to={detail}>申請の詳細を見る</ButtonLink>
                    <ButtonLink
                      variant="secondary"
                      to="/places/$placeId"
                      params={{ placeId: place.placeId }}
                    >
                      店舗ページに戻る
                    </ButtonLink>
                  </>
                }
              >
                {done === "resubmitted"
                  ? "申請は確認中に戻りました。運営が確かめてから、店舗ページに反映します。"
                  : "申請は確認中になりました。運営が確かめてから、店舗ページに反映します。"}
              </DonePanel>
            </FocusOnMount>
          </ManagePage>
        }
      />
    );
  }

  if (stage === "review") {
    return (
      <ManagePage
        title={title}
        actions={
          <>
            <Button disabled={sending} onClick={send}>
              {sending ? "申請しています…" : "この内容で申請する"}
            </Button>
            <Button
              variant="secondary"
              disabled={sending}
              onClick={() => setStage("input")}
            >
              入力に戻る
            </Button>
          </>
        }
      >
        <FocusOnMount>
          <ManageBody>
            <p className="rq-lead">
              次の変更で、お店の情報の修正を申請します。変更しない項目は示していません。提出すると、運営が確かめるまで確認中になります。
            </p>
            <ReviewList items={revisionReviewItems(current, state, changed)} />
          </ManageBody>
        </FocusOnMount>
      </ManagePage>
    );
  }

  const note = (field: PlaceRevisionField) =>
    changed.includes(field) ? (
      <PlaceChangedNote current={current} field={field} />
    ) : null;

  return (
    <ManagePage
      title={title}
      actions={
        <>
          <Button
            type="submit"
            form="revision-form"
            disabled={sending || failure?.kind === "lapsed"}
          >
            {resubmit === null
              ? "入力した内容を確かめる"
              : sending
                ? "再提出しています…"
                : "この内容で再提出する"}
          </Button>
          {resubmit === null ? (
            <ButtonLink
              variant="secondary"
              to="/places/$placeId"
              params={{ placeId: place.placeId }}
            >
              店舗ページに戻る
            </ButtonLink>
          ) : (
            <ButtonLink
              variant="secondary"
              to={applicationPath(resubmit.applicationId)}
            >
              申請の詳細に戻る
            </ButtonLink>
          )}
        </>
      }
      {...(resubmit !== null
        ? {
            actionsNote: dirty
              ? "再提出していない変更があります。再提出せずに画面を離れると、変更は残らず、申請は差し戻しのまま変わりません。"
              : "再提出せずにやめると、申請は差し戻しのまま変わりません。",
          }
        : dirty
          ? {
              actionsNote:
                "提出していない入力があります。提出せずに画面を離れると、入力した内容は残りません。",
            }
          : {})}
    >
      <form
        className="m-body"
        id="revision-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          check();
        }}
      >
        {failure === null ? null : (
          <SubmitFailureAlert
            failure={failure}
            resubmit={resubmit !== null}
            applicationId={resubmit?.applicationId ?? null}
            busy={sending}
            lead="店舗の名称・所在地・位置は、店舗を公開するための条件です。次の項目を直してください。"
            onReload={() =>
              startSend(async () => {
                setFailure(null);
                await reconcile();
              })
            }
            retry={
              <Button variant="secondary" disabled={sending} onClick={send}>
                もう一度送る
              </Button>
            }
          />
        )}
        {mode.kind === "new" ? (
          <Notice
            variant="manage"
            tone="paper"
            title="変えた項目だけが申請に入ります"
          >
            運営が確かめてから、店舗ページに反映します。営業状況の変更は、情報の修正と併せても、それだけでも申請できます。
          </Notice>
        ) : (
          <ModeNotice
            mode={mode}
            reapplied="変更した項目（写真を含む）を、お店の現在の情報に重ねた内容"
          />
        )}
        <PlaceFormFields
          values={state.values}
          onChange={(change) =>
            setState((currentState) => ({
              ...currentState,
              values: { ...currentState.values, ...change },
            }))
          }
          errors={errors.place}
          lists={data.lists}
          disabled={sending}
          notes={{
            photos: note("photos"),
            name: note("name"),
            town: note("town"),
            location: note("location"),
            businessHours: note("businessHours"),
            description: note("description"),
            contact: note("contact"),
          }}
        />
        <hr className="m-divider" />
        <ManageSection id="rq02-status" title="営業状況">
          <ManageStatus
            tone={current.operatingStatus === "open" ? "accent" : "neutral"}
          >
            {`現在の営業状況: ${OPERATING_STATUS_LABEL[current.operatingStatus]}`}
          </ManageStatus>
          <ChoiceGroup
            legend="申請する営業状況"
            name="operatingStatus"
            choices={OPERATING_STATUSES.map((status) => ({
              value: status,
              label: OPERATING_STATUS_LABEL[status],
            }))}
            value={state.operatingStatus}
            onChange={(operatingStatus) =>
              setState((currentState) => ({ ...currentState, operatingStatus }))
            }
            help="現在と同じ営業状況のままなら、営業状況は申請に入りません。"
          />
          {note("operatingStatus")}
        </ManageSection>
        {resubmit === null ? null : (
          <ReplyField
            value={reply}
            onChange={setReply}
            disabled={sending}
            {...(errors.reply === undefined ? {} : { error: errors.reply })}
          />
        )}
      </form>
    </ManagePage>
  );
}
