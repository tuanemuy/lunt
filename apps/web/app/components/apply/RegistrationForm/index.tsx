"use client";

import { useRouter } from "@tanstack/react-router";
import { useRef, useState, useTransition } from "react";
import {
  ManageBody,
  ManagePage,
  ManageSection,
} from "@/components/layout/ManageShell";
import {
  PLACE_FIELD_ANCHOR,
  PlaceFormFields,
} from "@/components/place/PlaceFormFields";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { DonePanel } from "@/components/ui/DonePanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { HydrationGate } from "@/components/ui/HydrationGate";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import {
  resubmitApplicationFn,
  submitPlaceRegistrationFn,
} from "@/presentation/apply";
import {
  APPLICATION_ID_CONFLICT,
  CLAIM_FIELD_ANCHOR,
  CLAIM_FIELD_LABEL,
  CLAIM_FIELDS,
  type ClaimFieldErrors,
  claimErrors,
  claimFieldErrors,
  INPUT_ERROR,
  replyError,
  replyOf,
} from "@/presentation/applyForm";
import {
  applicationPath,
  type ClaimValues,
  EMPTY_CLAIM,
  type RegistrationFormData,
} from "@/presentation/applyView";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { newId } from "@/presentation/newId";
import {
  PLACE_FIELD_LABEL,
  PLACE_FIELDS,
  type PlaceFieldErrors,
  type PlaceFormValues,
  placeFieldErrors,
  toPlaceProfile,
} from "@/presentation/placeForm";
import { useReconcile } from "@/presentation/reconcile";
import { KeepOutcome } from "../ApplyOutcome";
import {
  ApplyTitle,
  type FieldLink,
  ModeNotice,
  ReplyField,
  ReviewList,
  type SubmitFailure,
  SubmitFailureAlert,
  useScrollTopOn,
} from "../ApplyParts";
import { ClaimFields } from "../ClaimFields";
import { registrationReviewItems } from "../PlaceReview";

type Companion = "with" | "without";

type Errors = Readonly<{
  place: PlaceFieldErrors;
  claim: ClaimFieldErrors;
  reply?: string;
}>;

const NO_ERRORS: Errors = { place: {}, claim: {} };

type Done =
  | Readonly<{
      kind: "submitted";
      registrationId: string;
      stewardshipId: string | null;
      name: string;
    }>
  | Readonly<{ kind: "resubmitted"; name: string }>;

function fieldLinks(errors: Errors): readonly FieldLink[] {
  return [
    ...PLACE_FIELDS.filter((field) => errors.place[field] !== undefined).map(
      (field) => ({
        anchor: PLACE_FIELD_ANCHOR[field],
        label: PLACE_FIELD_LABEL[field],
      }),
    ),
    ...CLAIM_FIELDS.filter((field) => errors.claim[field] !== undefined).map(
      (field) => ({
        anchor: CLAIM_FIELD_ANCHOR[field],
        label: CLAIM_FIELD_LABEL[field],
      }),
    ),
    ...(errors.reply === undefined
      ? []
      : [{ anchor: "apply-reply", label: "追加の確認への回答" }]),
  ];
}

const sameValues = (a: PlaceFormValues, b: PlaceFormValues): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * RQ-02 店舗の申請 (登録) (SHP-03, APP-02, APP-04): a new place's profile
 * meeting the publish condition, optionally with a stewardship claim filed
 * with it (two applications). Reached from RQ-01; a reapplication starts
 * from the ended registration's content (photos duplicated); a
 * resubmission corrects the returned registration and answers the
 * request, without the claim (it is a separate application). The ids are
 * minted once per attempt and kept until the submission is known to have
 * gone through.
 */
export function RegistrationForm({ data }: { data: RegistrationFormData }) {
  const router = useRouter();
  const reconcile = useReconcile();
  const { mode } = data;
  const resubmit = mode.kind === "resubmit" ? mode : null;
  const [values, setValues] = useState<PlaceFormValues>(data.start);
  const [companion, setCompanion] = useState<Companion>("with");
  const [claim, setClaim] = useState<ClaimValues>(EMPTY_CLAIM);
  const [reply, setReply] = useState("");
  const [stage, setStage] = useState<"input" | "review">("input");
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [sending, startSend] = useTransition();
  useScrollTopOn(`${stage}:${done === null}`);
  const attempt = useRef<{ registration: string; claim: string | null } | null>(
    null,
  );
  const withClaim = resubmit === null && companion === "with";
  const dirty =
    !sameValues(values, data.start) ||
    claim.relationship !== "" ||
    claim.evidence !== "" ||
    reply !== "";

  const fail = (state: ErrorState, next: Errors) => {
    setErrors(next);
    setFailure({ kind: "error", state, fields: fieldLinks(next) });
    setStage("input");
  };

  /** Checks what the form can, then shows the review (or resubmits). */
  const check = () => {
    const built = toPlaceProfile(values);
    const claimed = withClaim ? claimErrors(claim) : {};
    const next: Errors = {
      place: built.ok ? {} : built.errors,
      claim: claimed,
    };
    if (!built.ok || Object.keys(claimed).length > 0) {
      fail(INPUT_ERROR, next);
      return;
    }
    setErrors(NO_ERRORS);
    setFailure(null);
    if (resubmit === null) setStage("review");
    else send();
  };

  const send = () =>
    startSend(async () => {
      const built = toPlaceProfile(values);
      if (!built.ok) return;
      try {
        if (resubmit !== null) {
          const result = await resubmitApplicationFn({
            data: {
              applicationId: resubmit.applicationId,
              version: resubmit.version,
              amended: { kind: "registration", profile: built.profile },
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
          setDone({ kind: "resubmitted", name: values.name });
          return;
        }
        const ids = attempt.current ?? { registration: newId(), claim: null };
        if (withClaim) ids.claim ??= newId();
        attempt.current = ids;
        const submitted = await submitPlaceRegistrationFn({
          data: {
            applicationId: ids.registration,
            profile: built.profile,
            stewardship:
              withClaim && ids.claim !== null
                ? { applicationId: ids.claim, ...claim }
                : null,
          },
        });
        attempt.current = null;
        // The page's own loader is not run again: this screen has done its
        // work. Other screens (MY-01, MY-04) read the new applications afresh.
        router.clearCache();
        setDone({ kind: "submitted", ...submitted, name: values.name });
      } catch (error) {
        const state = classifyError(error);
        if (
          state.kind === "conflict" &&
          state.code === APPLICATION_ID_CONFLICT
        ) {
          setStage("input");
          setFailure({
            kind: "taken",
            applicationId: attempt.current?.registration ?? "",
          });
          return;
        }
        const reason = replyError(state);
        fail(state, {
          place: placeFieldErrors(state),
          claim: claimFieldErrors(state, claim),
          ...(reason === undefined ? {} : { reply: reason }),
        });
      }
    });

  const heading =
    resubmit !== null
      ? "登録の申請を再提出"
      : stage === "review" && done === null
        ? "申請の内容を確かめる"
        : "新しいお店を登録";
  const title = <ApplyTitle heading={heading} />;

  if (done !== null) {
    return (
      <KeepOutcome
        view={
          <ManagePage title={title}>
            <FocusOnMount>
              {done.kind === "resubmitted" ? (
                <DonePanel
                  title="登録の申請を再提出しました"
                  actions={
                    <>
                      <ButtonLink
                        to={applicationPath(resubmit?.applicationId ?? "")}
                      >
                        申請の詳細を見る
                      </ButtonLink>
                      <ButtonLink variant="secondary" to="/me">
                        マイページに戻る
                      </ButtonLink>
                    </>
                  }
                >
                  申請は確認中に戻りました。運営が確かめた結果は、通知でお知らせします。
                </DonePanel>
              ) : (
                <DonePanel
                  title="店舗の登録を申請しました"
                  list={
                    done.stewardshipId === null ? null : (
                      <LinkList>
                        <li>
                          <ListRowLink
                            to={applicationPath(done.registrationId)}
                            title={`店舗の新規登録 · ${done.name}`}
                            meta="確認中"
                          />
                        </li>
                        <li>
                          <ListRowLink
                            to={applicationPath(done.stewardshipId)}
                            title={`店舗の管理権限取得 · ${done.name}`}
                            meta="確認中 · 登録の申請に併せた申請"
                          />
                        </li>
                      </LinkList>
                    )
                  }
                  actions={
                    <>
                      <ButtonLink to={applicationPath(done.registrationId)}>
                        申請の詳細を見る
                      </ButtonLink>
                      <ButtonLink variant="secondary" to="/me">
                        マイページに戻る
                      </ButtonLink>
                    </>
                  }
                >
                  {done.stewardshipId === null
                    ? "申請は確認中になりました。運営が確かめた結果は、通知でお知らせします。"
                    : "2つの申請が確認中になりました。運営が確かめた結果は、通知でお知らせします。"}
                </DonePanel>
              )}
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
              {withClaim
                ? "次の内容で、店舗の登録と管理権限を申請します。提出すると、運営が確かめるまで確認中になります。"
                : "次の内容で、店舗の登録を申請します。提出すると、運営が確かめるまで確認中になります。"}
            </p>
            <ManageSection id="rq02-review-place" title="店舗の登録">
              <ReviewList items={registrationReviewItems(values)} />
            </ManageSection>
            {withClaim ? (
              <ManageSection
                id="rq02-review-claim"
                title="併せて申請する管理権限"
              >
                <ReviewList
                  items={[
                    { term: "店舗との関係", value: claim.relationship },
                    {
                      term: "確認に使える連絡先・資料",
                      value: claim.evidence,
                    },
                  ]}
                />
              </ManageSection>
            ) : null}
          </ManageBody>
        </FocusOnMount>
      </ManagePage>
    );
  }

  return (
    <ManagePage
      title={title}
      actions={
        <HydrationGate>
          <Button
            type="submit"
            form="registration-form"
            disabled={sending || failure?.kind === "lapsed"}
          >
            {resubmit === null
              ? "入力した内容を確かめる"
              : sending
                ? "再提出しています…"
                : "この内容で再提出する"}
          </Button>
          {resubmit === null ? (
            <ButtonLink variant="secondary" to="/apply/find-place">
              店舗選択に戻る
            </ButtonLink>
          ) : (
            <ButtonLink
              variant="secondary"
              to={applicationPath(resubmit.applicationId)}
            >
              申請の詳細に戻る
            </ButtonLink>
          )}
        </HydrationGate>
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
        id="registration-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          check();
        }}
      >
        <HydrationGate>
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
          <ModeNotice mode={mode} reapplied="内容（写真を含む）" />
          <PlaceFormFields
            values={values}
            onChange={(change) =>
              setValues((current) => ({ ...current, ...change }))
            }
            errors={errors.place}
            lists={data.lists}
            disabled={sending}
          />
          {resubmit === null ? (
            <>
              <hr className="m-divider" />
              <ManageSection id="rq02-claim" title="お店の管理権限">
                <ChoiceGroup
                  legend="管理権限の申請を併せますか"
                  name="companion"
                  choices={[
                    { value: "with", label: "管理権限も申請する" },
                    { value: "without", label: "登録だけを申請する" },
                  ]}
                  value={companion}
                  onChange={setCompanion}
                  help="併せると、登録の申請と管理権限の申請が別々に確かめられます。登録だけにした場合は、登録が承認された後に、お店のページから管理権限を申請できます。"
                />
                {withClaim ? (
                  <ClaimFields
                    values={claim}
                    onChange={(change) =>
                      setClaim((current) => ({ ...current, ...change }))
                    }
                    errors={errors.claim}
                    disabled={sending}
                  />
                ) : null}
              </ManageSection>
            </>
          ) : (
            <ReplyField
              value={reply}
              onChange={setReply}
              disabled={sending}
              {...(errors.reply === undefined ? {} : { error: errors.reply })}
            />
          )}
        </HydrationGate>
      </form>
    </ManagePage>
  );
}
