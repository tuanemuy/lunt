"use client";

import type { PremiseKey } from "@repo/core/domain/application/premise";
import { useLocation, useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useTransition } from "react";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageTitle,
  StaticTarget,
} from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { Field, Textarea } from "@/components/ui/Field";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { TextLink } from "@/components/ui/TextButton";
import {
  BROKEN_PREMISE_TEXT,
  monthDayText,
  STATUS_LABEL,
} from "@/presentation/applicationWords";
import {
  checkEligibilityFn,
  type EligibilityTarget,
} from "@/presentation/apply";
import { REFUSAL_CODES } from "@/presentation/applyForm";
import {
  type ApplyMode,
  type ApplyRefusal,
  applicationPath,
  infoReportPath,
  shopHomePath,
} from "@/presentation/applyView";
import type { ErrorState } from "@/presentation/errorState";

/**
 * Back to the top of the page when a form moves to another step (input,
 * review, preview, done), so the new step's title is in view. Runs after
 * the step's own `FocusOnMount`, which would leave the title scrolled off.
 */
export function useScrollTopOn(step: string): void {
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each change of step
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
  }, [step]);
}

/** A screen's title band: the static target (if any) and the heading. */
export function ApplyTitle({
  heading,
  target,
}: {
  heading: string;
  target?: Readonly<{ name: string; status?: string }>;
}) {
  return (
    <ManageTitle>
      {target === undefined || target.name === "" ? null : (
        <StaticTarget
          name={target.name}
          {...(target.status === undefined ? {} : { status: target.status })}
        />
      )}
      <ManageHeading>{heading}</ManageHeading>
    </ManageTitle>
  );
}

/** What the refused application is, for the refusal's wording. */
export type RefusedWhat =
  | "revision"
  | "stewardship"
  | "listing"
  | "listingRevision"
  | "registration"
  | "membership"
  | "participation";

const WHAT_TEXT = {
  revision: "修正の申請",
  stewardship: "管理権限の申請",
  listing: "掲載の申請",
  listingRevision: "掲載の修正の申請",
  registration: "登録の申請",
  membership: "所属・離脱の申請",
  participation: "参加の申請",
} as const satisfies Readonly<Record<RefusedWhat, string>>;

/**
 * 「受け付けない」 (`spec/pages/index.md` 「受け付けない事情」): the reason
 * and its destinations, instead of the form.
 */
export function RefusalPanel({
  refusal,
  what,
}: {
  refusal: ApplyRefusal;
  what: RefusedWhat;
}) {
  const words = WHAT_TEXT[what];
  switch (refusal.kind) {
    case "hasSteward":
      return (
        <EmptyPanel
          title={`このお店には店舗管理者がいるため、${words}を受け付けていません`}
          actions={
            <>
              <ButtonLink
                to={
                  refusal.listingId === null
                    ? infoReportPath(
                        "place",
                        refusal.placeId,
                        what === "listing" ? "newListing" : "placeRevision",
                      )
                    : infoReportPath(
                        "listing",
                        refusal.listingId,
                        "listingRevision",
                      )
                }
              >
                情報の誤り・閉店を連絡する
              </ButtonLink>
              <ButtonLink
                variant="secondary"
                to="/apply/places/$placeId/stewardship"
                params={{ placeId: refusal.placeId }}
              >
                管理権限を申請する
              </ButtonLink>
              <TextLink
                to="/places/$placeId"
                params={{ placeId: refusal.placeId }}
              >
                店舗ページへ戻る
              </TextLink>
            </>
          }
        >
          情報の誤りや閉店に気づいたときは、運営に連絡できます。お店の関係者の方は、管理権限を申請できます。
        </EmptyPanel>
      );
    case "alreadySteward":
      return (
        <EmptyPanel
          title="すでに、このお店の店舗管理者です"
          actions={
            <ButtonLink to={shopHomePath(refusal.placeId)}>
              店舗ホームへ
            </ButtonLink>
          }
        >
          このお店は、店舗ホームから管理できます。
        </EmptyPanel>
      );
    case "registrationEnded":
      return (
        <EmptyPanel
          title="併せた店舗の登録申請が、承認されずに終わっています"
          actions={
            <ButtonLink
              to="/apply/places/new"
              search={{ reapply: refusal.registrationId }}
            >
              登録を申請し直す
            </ButtonLink>
          }
        >
          登録の申請が否認されたか取り下げになったため、この管理権限の申請は出せません。管理権限の申請を併せて、店舗の登録を申請し直してください。
        </EmptyPanel>
      );
    case "unavailable":
      return refusal.subject === "listing" ? (
        <EmptyPanel
          title="この掲載は閲覧できません"
          actions={<ButtonLink to="/">みつけるへ</ButtonLink>}
        >
          非公開・削除などで閲覧できない掲載は、修正を申請できません。
        </EmptyPanel>
      ) : (
        <EmptyPanel
          title="このお店は表示できません"
          actions={
            <ButtonLink variant="secondary" to="/">
              みつけるへ戻る
            </ButtonLink>
          }
        >
          お店が表示できないため、申請を始められません。
        </EmptyPanel>
      );
    case "active":
      return (
        <EmptyPanel
          title={`この${refusal.subject === "listing" ? "掲載" : "お店"}への${words}が、確認中か差し戻しになっています`}
          actions={
            <ButtonLink to={applicationPath(refusal.applicationId)}>
              申請の詳細を見る
            </ButtonLink>
          }
        >
          {`同じ${refusal.subject === "listing" ? "掲載" : "お店"}への${words}は、確認中か差し戻しの申請が終わるまで、新しく出せません。申請の詳細で、状況を確かめてください。`}
        </EmptyPanel>
      );
    case "notReturned":
      return (
        <EmptyPanel
          title="この申請は、いま再提出できません"
          actions={
            <ButtonLink to={applicationPath(refusal.applicationId)}>
              申請の詳細を見る
            </ButtonLink>
          }
        >
          {`申請の状態は「${STATUS_LABEL[refusal.status]}」です。再提出できるのは、差し戻された申請だけです。申請の詳細で、いまの状態を確かめてください。`}
        </EmptyPanel>
      );
    case "notEnded":
      return (
        <EmptyPanel
          title="この申請からは、いま再申請できません"
          actions={
            <ButtonLink to={applicationPath(refusal.applicationId)}>
              申請の詳細を見る
            </ButtonLink>
          }
        >
          {`申請の状態は「${STATUS_LABEL[refusal.status]}」です。再申請できるのは、否認・取り下げ・失効となった申請だけです。`}
        </EmptyPanel>
      );
  }
}

/** A screen whose application is refused (受け付けない), in its frame. */
export function ApplyRefused({
  heading,
  refusal,
  what,
}: {
  heading: string;
  refusal: ApplyRefusal;
  what: RefusedWhat;
}) {
  return (
    <ManagePage title={<ApplyTitle heading={heading} />}>
      <ManageBody>
        <FocusOnMount role="alert">
          <RefusalPanel refusal={refusal} what={what} />
        </FocusOnMount>
      </ManageBody>
    </ManagePage>
  );
}

function Retry() {
  const router = useRouter();
  const [pending, startRetry] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startRetry(async () => {
          await router.invalidate({ sync: true });
        })
      }
    >
      {pending ? "読み込んでいます…" : "もう一度読み込む"}
    </Button>
  );
}

/**
 * A screen's content that could not be read, in its frame: CS-06 (the
 * target or the application named in the URL is not there), CS-04, CS-05
 * (another person's application), CS-02 otherwise.
 */
export function ApplyProblem({
  heading,
  kind,
}: {
  heading: string;
  kind: ErrorState["kind"];
}) {
  const here = useLocation({ select: (location) => location.href });
  const body = (() => {
    switch (kind) {
      case "notFound":
      case "invalidInput":
        return (
          <EmptyPanel
            title="表示できません"
            actions={
              <ButtonLink variant="secondary" to="/">
                みつけるへ戻る
              </ButtonLink>
            }
          >
            申請の対象か申請が、閲覧できないか存在しません。
          </EmptyPanel>
        );
      case "loginRequired":
        return (
          <EmptyPanel
            title="ログインが必要です"
            actions={
              <ButtonLink to="/login" search={{ next: here }}>
                ログインする
              </ButtonLink>
            }
          >
            申請には、ログインが必要です。ログインすると、この画面に戻ります。
          </EmptyPanel>
        );
      case "forbidden":
        return (
          <EmptyPanel
            title="この申請は扱えません"
            actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
          >
            ほかの利用者の申請は、確かめることも再提出することもできません。
          </EmptyPanel>
        );
      default:
        return (
          <EmptyPanel title="読み込めませんでした" actions={<Retry />}>
            通信を確かめて、もう一度読み込んでください。
          </EmptyPanel>
        );
    }
  })();
  return (
    <ManagePage title={<ApplyTitle heading={heading} />}>
      <ManageBody>
        <FocusOnMount role="alert">{body}</FocusOnMount>
      </ManageBody>
    </ManagePage>
  );
}

const ENDED_TEXT = {
  rejected: "否認された",
  withdrawn: "取り下げた",
  lapsed: "失効した",
} as const;

/**
 * What the opening brings with it: a reapplication's origin, or the
 * approver's request a resubmission answers.
 */
export function ModeNotice({
  mode,
  reapplied,
}: {
  mode: ApplyMode;
  /** What the reapplication's content holds, e.g. 写真を含む前の申請の内容. */
  reapplied: string;
}) {
  switch (mode.kind) {
    case "new":
      return null;
    case "reapply":
      return (
        <Notice
          variant="manage"
          tone="paper"
          title="前の申請の内容で始めています"
        >
          {`${ENDED_TEXT[mode.ended]} ${monthDayText(mode.submittedAt)}の申請の${reapplied}が入っています。新しい申請として提出します。前の申請はそのまま残ります。`}
        </Notice>
      );
    case "resubmit":
      return (
        <Notice variant="manage" title={`${mode.requestedBy}からの追加の確認`}>
          {mode.request}
        </Notice>
      );
  }
}

/** 追加の確認への回答 (再提出だけ, 任意). */
export function ReplyField({
  value,
  onChange,
  disabled,
  error,
  help = "追加の確認に答える内容を書きます。申請の内容は、上の項目で直します。",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  error?: string;
  /** For an application whose content cannot be changed (RQ-05). */
  help?: string;
}) {
  return (
    <Field
      id="apply-reply"
      label="追加の確認への回答"
      requirement="optional"
      help={help}
      {...(error === undefined ? {} : { error })}
    >
      {(control) => (
        <Textarea
          {...control}
          name="reply"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </Field>
  );
}

/**
 * 「変更」 and the current value, after a field a revision changes; or, for
 * a value that does not read as text (a position), the `children` that say
 * it changes.
 */
export function ChangedNote(
  props:
    | { current: ReactNode; children?: never }
    | { current?: never; children: ReactNode },
) {
  return (
    <p className="rq-was">
      <Badge tone="accent">変更</Badge>
      <span>
        {props.children ?? (
          <>
            現在の値: <s>{props.current}</s>
          </>
        )}
      </span>
    </p>
  );
}

/** A definition list of what is about to be submitted (提出の前の確認). */
export function ReviewList({
  items,
}: {
  items: readonly Readonly<{ term: string; value: ReactNode }>[];
}) {
  return (
    <dl className="rq-dl">
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A value beside the current one in the review of a revision. */
export function Compared({
  current,
  proposed,
}: {
  current: ReactNode;
  proposed: ReactNode;
}) {
  return (
    <>
      <span className="rq-compare">
        <span className="rq-compare__label">現在の値</span>
        <span className="rq-compare__was">{current}</span>
      </span>
      <span className="rq-compare">
        <span className="rq-compare__label">申請の値</span>
        <span>{proposed}</span>
      </span>
    </>
  );
}

/** Thumbnails of the photos in a review. */
export function ReviewPhotos({
  photos,
}: {
  photos: readonly Readonly<{ photoId: string; url: string | null }>[];
}) {
  if (photos.length === 0) return <span>なし</span>;
  return (
    <span className="rq-dl__photos">
      {photos.map((photo, index) =>
        photo.url === null ? null : (
          <img
            key={photo.photoId}
            src={photo.url}
            alt={index === 0 ? "1枚目（代表写真）" : `${index + 1}枚目`}
          />
        ),
      )}
    </span>
  );
}

/** A field to fix, linked from the CS-10 alert. */
export type FieldLink = Readonly<{ anchor: string; label: string }>;

/** How a failed submission is shown above the form. */
export type SubmitFailure =
  | Readonly<{ kind: "error"; state: ErrorState; fields: readonly FieldLink[] }>
  /** The id was already an application: an earlier attempt went through. */
  | Readonly<{ kind: "taken"; applicationId: string }>
  /** The resubmission found a premise broken: the application lapsed. */
  | Readonly<{
      kind: "lapsed";
      applicationId: string;
      brokenPremises: readonly string[];
    }>;

const isPremiseKey = (key: string): key is PremiseKey =>
  Object.hasOwn(BROKEN_PREMISE_TEXT, key);

/**
 * The alert above an application form after a failed submission: CS-10
 * (the fields to fix), CS-07, CS-08, the lapse found by a resubmission,
 * an earlier attempt that went through, CS-04 / CS-05 and CS-02. Each new
 * failure takes the focus, which also scrolls it into view (the submit
 * button sits at the bottom).
 */
export function SubmitFailureAlert({
  failure,
  resubmit,
  applicationId,
  retry,
  onReload,
  busy,
  lead,
}: {
  failure: SubmitFailure;
  resubmit: boolean;
  /** The application a resubmission or its CS-08 names (MY-05). */
  applicationId: string | null;
  retry: ReactNode;
  /** 最新の内容を読み直す (CS-07). */
  onReload: () => void;
  busy: boolean;
  /** CS-10's sentence for the fields the form found missing (the publish condition). */
  lead?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedFor = useRef<SubmitFailure | null>(null);
  useEffect(() => {
    if (focusedFor.current === failure) return;
    focusedFor.current = failure;
    ref.current?.focus();
  }, [failure]);
  const here = useLocation({ select: (location) => location.href });
  const verb = resubmit ? "再提出" : "申請";
  const alert = (() => {
    switch (failure.kind) {
      case "taken":
        return (
          <Alert
            title="この申請は、すでに提出されていました"
            actions={
              <ButtonLink
                variant="secondary"
                to={applicationPath(failure.applicationId)}
              >
                申請の詳細を見る
              </ButtonLink>
            }
          >
            通信が途切れる前の提出が届いていました。そのあとに変えた内容は提出していません。申請の詳細で、提出した内容を確かめてください。
          </Alert>
        );
      case "lapsed":
        return (
          <Alert
            title="この申請は失効したため、再提出できません"
            actions={
              <ButtonLink
                variant="secondary"
                to={applicationPath(failure.applicationId)}
              >
                申請の詳細を見る
              </ButtonLink>
            }
          >
            {`${failure.brokenPremises
              .filter(isPremiseKey)
              .map((key) => BROKEN_PREMISE_TEXT[key])
              .join(
                "",
              )}申請の詳細で、失効の事情と次に行えることを確かめてください。`}
          </Alert>
        );
      case "error":
        break;
    }
    const { state, fields } = failure;
    switch (state.kind) {
      case "invalidInput":
        return (
          <Alert
            title={`${verb}できませんでした`}
            list={fields.map((field) => (
              <li key={field.anchor + field.label}>
                <a className="text-button" href={`#${field.anchor}`}>
                  {field.label}
                </a>
              </li>
            ))}
          >
            {fields.length === 0
              ? state.message
              : state.code === null
                ? (lead ?? "次の項目を直してください。")
                : `${state.message}。次の項目を直してください。`}
          </Alert>
        );
      case "conflict":
        return (
          <Alert
            title="この申請は、ほかの画面で先に変わっていました"
            actions={
              <Button variant="secondary" disabled={busy} onClick={onReload}>
                最新の内容を読み直す
              </Button>
            }
          >
            この内容は再提出していません。最新の申請の内容を読み直してから、もう一度直してください。
          </Alert>
        );
      case "premiseChanged":
        return (
          <Alert
            title={`${verb}できませんでした`}
            {...(fields.length > 0
              ? {
                  list: fields.map((field) => (
                    <li key={field.anchor}>
                      <a className="text-button" href={`#${field.anchor}`}>
                        {field.label}を選び直す
                      </a>
                    </li>
                  )),
                }
              : applicationId === null
                ? {}
                : {
                    actions: (
                      <ButtonLink
                        variant="secondary"
                        to={applicationPath(applicationId)}
                      >
                        申請の詳細を見る
                      </ButtonLink>
                    ),
                  })}
          >
            {fields.length > 0
              ? `${state.message}。${verb}していません。入力した内容は残っています。`
              : `${state.message}。${verb}していません。`}
          </Alert>
        );
      case "loginRequired":
        return (
          <Alert
            title="ログインが必要です"
            actions={
              <ButtonLink
                variant="secondary"
                to="/login"
                search={{ next: here }}
              >
                ログインする
              </ButtonLink>
            }
          >
            {`ログインの有効期間が切れました。${verb}していません。ログインし直すと、この画面に戻ります（入力した内容は残りません）。`}
          </Alert>
        );
      case "forbidden":
        return (
          <Alert title={`${verb}できませんでした`}>
            この申請を扱う権限がありません。
          </Alert>
        );
      case "notFound":
        return (
          <Alert title={`${verb}できませんでした`}>
            申請の対象か申請が、閲覧できないか存在しません。
          </Alert>
        );
      case "failed":
        return (
          <Alert title="申請を送れませんでした" actions={retry}>
            通信を確かめて、もう一度送ってください。入力した内容は残っています。
          </Alert>
        );
    }
  })();
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      {alert}
    </div>
  );
}

/**
 * After a submission refused for a reason of 「受け付けない事情」
 * (`REFUSAL_CODES`), the refusal read afresh — so the screen can switch to
 * 「受け付けない」 with its destinations (the active application's MY-05
 * among them). `null` for any other failure, or when it no longer applies.
 */
export async function refusalAfter(
  state: ErrorState,
  target: EligibilityTarget,
): Promise<ApplyRefusal | null> {
  if (
    state.kind !== "premiseChanged" ||
    state.code === null ||
    !REFUSAL_CODES.has(state.code)
  ) {
    return null;
  }
  try {
    return await checkEligibilityFn({ data: target });
  } catch {
    return null;
  }
}
