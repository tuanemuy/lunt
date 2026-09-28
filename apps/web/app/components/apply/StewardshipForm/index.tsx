"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useRef, useState, useTransition } from "react";
import {
  ManageBody,
  ManagePage,
  ManageSection,
} from "@/components/layout/ManageShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DonePanel } from "@/components/ui/DonePanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { Photo } from "@/components/ui/Photo";
import {
  type EligibilityTarget,
  resubmitApplicationFn,
  submitStewardshipClaimFn,
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
  type ApplyRefusal,
  applicationPath,
  type ClaimValues,
  type StewardshipFormData,
} from "@/presentation/applyView";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { newId } from "@/presentation/newId";
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
import { ClaimFields } from "../ClaimFields";

type Errors = Readonly<{ claim: ClaimFieldErrors; reply?: string }>;

const NO_ERRORS: Errors = { claim: {} };

function fieldLinks(errors: Errors): readonly FieldLink[] {
  return [
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

/** The place the claim is for: a row to its DT-02, or the name of one not yet registered. */
function TargetPlace({ data }: { data: StewardshipFormData }) {
  const { place } = data;
  if (place.kind === "notYet") {
    return (
      <div className="m-row">
        <Photo photo={null} alt="" ratio={1} className="m-row__photo" />
        <span className="m-row__content">
          <span className="m-row__name">{place.name}</span>
          <span className="m-row__sub">
            登録の申請中の店舗（まだ公開されていません）
          </span>
        </span>
      </div>
    );
  }
  return (
    <Link
      className="m-row"
      to="/places/$placeId"
      params={{ placeId: place.place.placeId }}
    >
      <Photo
        photo={
          place.place.cover === null
            ? null
            : { src: place.place.cover.url, framing: null }
        }
        alt=""
        ratio={1}
        className="m-row__photo"
        emptyLabel="写真なし"
      />
      <span className="m-row__content">
        <span className="m-row__name">{place.place.name}</span>
        <span className="m-row__meta">{place.place.address}</span>
        <span className="m-row__sub">
          {place.hasSteward ? "店舗管理者がいます" : "店舗管理者はいません"}
        </span>
      </span>
    </Link>
  );
}

/**
 * RQ-03 管理権限の申請 (SHP-04, APP-02, APP-04): the relationship to the
 * place and a contact or material to check it with, both required, no
 * files. A place with a steward gets the guide to being invited instead,
 * and may still apply. Also the resubmission of a returned claim (one
 * filed with a registration included) and the reapplication after an
 * ended one.
 */
export function StewardshipForm({ data }: { data: StewardshipFormData }) {
  const router = useRouter();
  const reconcile = useReconcile();
  const { mode, place, target } = data;
  const resubmit = mode.kind === "resubmit" ? mode : null;
  const [claim, setClaim] = useState<ClaimValues>(data.start);
  const [reply, setReply] = useState("");
  const [stage, setStage] = useState<"input" | "review">("input");
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [refusal, setRefusal] = useState<ApplyRefusal | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  useScrollTopOn(`${stage}:${done === null}:${refusal === null}`);
  const attemptId = useRef<string | null>(null);
  const dirty =
    JSON.stringify(claim) !== JSON.stringify(data.start) || reply !== "";
  const placeName = place.kind === "place" ? place.place.name : place.name;
  const placeId = place.kind === "place" ? place.place.placeId : place.placeId;
  const eligibilityTarget: EligibilityTarget =
    "registrationId" in target
      ? { kind: "stewardship", registrationId: target.registrationId }
      : { kind: "stewardship", placeId: target.placeId };

  const fail = (failed: ErrorState, next: Errors) => {
    setErrors(next);
    setFailure({ kind: "error", state: failed, fields: fieldLinks(next) });
    setStage("input");
  };

  const check = () => {
    const missing = claimErrors(claim);
    if (Object.keys(missing).length > 0) {
      fail(INPUT_ERROR, { claim: missing });
      return;
    }
    setErrors(NO_ERRORS);
    setFailure(null);
    if (resubmit === null) setStage("review");
    else send();
  };

  const send = () =>
    startSend(async () => {
      try {
        if (resubmit !== null) {
          const result = await resubmitApplicationFn({
            data: {
              applicationId: resubmit.applicationId,
              version: resubmit.version,
              amended: { kind: "stewardship", ...claim },
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
          setDone(resubmit.applicationId);
          return;
        }
        attemptId.current ??= newId();
        const { applicationId } = await submitStewardshipClaimFn({
          data: { applicationId: attemptId.current, target, ...claim },
        });
        attemptId.current = null;
        // Not reloaded here: its eligibility would now refuse the screen.
        router.clearCache();
        setDone(applicationId);
      } catch (error) {
        const failed = classifyError(error);
        if (
          failed.kind === "conflict" &&
          failed.code === APPLICATION_ID_CONFLICT
        ) {
          setStage("input");
          setFailure({ kind: "taken", applicationId: attemptId.current ?? "" });
          return;
        }
        if (resubmit === null) {
          const refused = await refusalAfter(failed, eligibilityTarget);
          if (refused !== null) {
            setRefusal(refused);
            return;
          }
        }
        const reason = replyError(failed);
        fail(failed, {
          claim: claimFieldErrors(failed, claim),
          ...(reason === undefined ? {} : { reply: reason }),
        });
      }
    });

  const heading =
    resubmit !== null
      ? "管理権限の申請を再提出"
      : stage === "review" && done === null
        ? "申請の内容を確かめる"
        : "お店の管理を申請";

  if (refusal !== null) {
    return (
      <KeepOutcome
        view={
          <ApplyRefused
            heading={heading}
            refusal={refusal}
            what="stewardship"
          />
        }
      />
    );
  }

  const title = <ApplyTitle heading={heading} />;

  if (done !== null) {
    return (
      <KeepOutcome
        view={
          <ManagePage title={title}>
            <FocusOnMount>
              <DonePanel
                title={
                  resubmit === null
                    ? "管理権限を申請しました"
                    : "管理権限の申請を再提出しました"
                }
                actions={
                  <>
                    <ButtonLink to={applicationPath(done)}>
                      申請の詳細を見る
                    </ButtonLink>
                    {place.kind === "place" ? (
                      <ButtonLink
                        variant="secondary"
                        to="/places/$placeId"
                        params={{ placeId }}
                      >
                        店舗ページに戻る
                      </ButtonLink>
                    ) : (
                      <ButtonLink variant="secondary" to="/me">
                        マイページに戻る
                      </ButtonLink>
                    )}
                  </>
                }
              >
                {resubmit === null
                  ? "申請を受け付けました。運営が確かめる間、申請は確認中です。承認されると、お店を管理できます。"
                  : "申請は確認中に戻りました。運営が確かめた結果は、通知でお知らせします。"}
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
              次の内容で、お店の管理権限を申請します。提出すると、運営が確かめるまで確認中になります。
            </p>
            <ReviewList
              items={[
                {
                  term: "お店",
                  value:
                    place.kind === "place" && place.place.address !== ""
                      ? `${placeName}（${place.place.address}）`
                      : placeName,
                },
                { term: "店舗との関係", value: claim.relationship },
                { term: "確認に使える連絡先・資料", value: claim.evidence },
              ]}
            />
          </ManageBody>
        </FocusOnMount>
      </ManagePage>
    );
  }

  return (
    <ManagePage
      title={title}
      actions={
        <>
          <Button
            type="submit"
            form="claim-form"
            disabled={sending || failure?.kind === "lapsed"}
          >
            {resubmit === null
              ? "入力した内容を確かめる"
              : sending
                ? "再提出しています…"
                : "この内容で再提出する"}
          </Button>
          {resubmit !== null ? (
            <ButtonLink
              variant="secondary"
              to={applicationPath(resubmit.applicationId)}
            >
              申請の詳細に戻る
            </ButtonLink>
          ) : place.kind === "place" ? (
            <ButtonLink
              variant="secondary"
              to="/places/$placeId"
              params={{ placeId }}
            >
              店舗ページに戻る
            </ButtonLink>
          ) : (
            <ButtonLink variant="secondary" to="/me">
              マイページに戻る
            </ButtonLink>
          )}
        </>
      }
      {...(resubmit !== null
        ? {
            actionsNote:
              "再提出せずにやめると、申請は差し戻しのまま変わりません。",
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
        id="claim-form"
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
        <ManageSection id="rq03-target" title="管理を申請するお店">
          <TargetPlace data={data} />
        </ManageSection>
        {place.kind === "place" && place.hasSteward ? (
          <Notice
            variant="manage"
            title="いまの店舗管理者から招待を受けられます"
          >
            このお店には店舗管理者がいます。店舗管理者に頼んで招待を受けると、申請せずに管理者になれます。招待を受けられないときは、このまま申請を続けられます。
          </Notice>
        ) : null}
        <ModeNotice mode={mode} reapplied="内容" />
        <ClaimFields
          values={claim}
          onChange={(change) =>
            setClaim((current) => ({ ...current, ...change }))
          }
          errors={errors.claim}
          disabled={sending}
        />
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
