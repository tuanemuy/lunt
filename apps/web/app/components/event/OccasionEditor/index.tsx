"use client";

import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  EventPage,
  occasionMembersPath,
  occasionPagePath,
} from "@/components/event/EventShell";
import { ProxyUnavailablePanel } from "@/components/event/EventShell/EventProblem";
import { useOccasionFrame } from "@/components/event/EventShell/useOccasionFrame";
import { ManageBody } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { SectionTitle } from "@/components/ui/SectionTitle";
import {
  followDraft,
  isDirty,
  reloadDraft,
  savedDraft,
  settledDraft,
  useEditDraft,
} from "@/presentation/editDraft";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import {
  loadOccasionFrameFn,
  type OccasionTransition,
  transitionOccasionFn,
  updateOccasionContentFn,
} from "@/presentation/occasion";
import {
  OCCASION_FIELD_ANCHOR,
  OCCASION_FIELD_LABEL,
  OCCASION_FIELDS,
  type OccasionFieldErrors,
  occasionFieldErrors,
  occasionFormValuesOf,
  toOccasionContent,
} from "@/presentation/occasionForm";
import {
  HOLDING_LABEL,
  type OccasionEditorData,
  occasionName,
  occasionPublicationLabel,
} from "@/presentation/occasionView";
import { publishSaveFailure } from "@/presentation/publishPremise";
import { useReconcile } from "@/presentation/reconcile";
import { OccasionFormFields } from "./OccasionFormFields";

type Outcome =
  | Readonly<{ kind: "saved" }>
  | Readonly<{ kind: "published" }>
  | Readonly<{ kind: "unpublished" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "uncancelled" }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "lostAccess" }>;

type Failure = Readonly<{
  state: ErrorState;
  fields: OccasionFieldErrors;
  attempt: "save" | "publish" | OccasionTransition;
  /** The content was saved before the publish failed. */
  savedFirst: boolean;
}>;

type Confirming = "unpublish" | "cancel" | null;

const ATTEMPT_TITLE: Readonly<Record<Failure["attempt"], string>> = {
  save: "保存できませんでした",
  publish: "公開できませんでした",
  unpublish: "公開を取り下げられませんでした",
  cancel: "中止にできませんでした",
  revokeCancellation: "中止を取り消せませんでした",
};

const clientInvalid = (): ErrorState => ({
  kind: "invalidInput",
  code: null,
  message: "入力内容を確かめてください",
  fieldErrors: {},
  missing: [],
});

function FieldList({ fields }: { fields: OccasionFieldErrors }) {
  const listed = OCCASION_FIELDS.filter((field) => fields[field] !== undefined);
  return listed.map((field) => (
    <li key={field}>
      <a className="text-button" href={`#${OCCASION_FIELD_ANCHOR[field]}`}>
        {OCCASION_FIELD_LABEL[field]}
      </a>
    </li>
  ));
}

/**
 * EM-02 イベント情報の編集 (EVT-04, EVT-06, EVT-11, EVT-12, MOD-03): the
 * whole content saved at once (a new period is the postponement), the
 * publication changed (CF-08), the event cancelled (CS-12) and the
 * cancellation revoked. The event's operator, or an operator standing in
 * for an absent one (CS-14). Publication and holding status are shown
 * side by side; both follow the server after every operation.
 */
export function OccasionEditor({
  data,
  created,
}: {
  data: OccasionEditorData;
  /** Arrived by registering the event (EM-02 新規). */
  created: boolean;
}) {
  const frame = useOccasionFrame();
  const router = useRouter();
  const reconcile = useReconcile();
  const proxy = frame.basis === "proxy";
  const params = { occasionId: data.occasionId };

  const [draft, setDraft] = useEditDraft(data, occasionFormValuesOf);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const { values } = draft;
  const dirty = isDirty(draft);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [registered, setRegistered] = useState(created);
  const [resumed, setResumed] = useState(false);
  const [busy, startBusy] = useTransition();

  const begin = () => {
    setFailure(null);
    setOutcome(null);
    setRegistered(false);
    setDraft(settledDraft);
  };

  /** Saves the form as it is; `false` when the form itself holds errors. */
  const saveValues = async (attempt: "save" | "publish"): Promise<boolean> => {
    const { values: submitted, version } = draftRef.current;
    const built = toOccasionContent(submitted);
    if (!built.ok) {
      setFailure({
        state: clientInvalid(),
        fields: built.errors,
        attempt,
        savedFirst: false,
      });
      return false;
    }
    const saved = await updateOccasionContentFn({
      data: { occasionId: data.occasionId, version, content: built.content },
    });
    setDraft((current) => savedDraft(current, submitted, saved.version));
    return true;
  };

  const fail = async (
    error: unknown,
    attempt: Failure["attempt"],
    savedFirst = false,
  ) => {
    const state = classifyError(error);
    if (state.kind === "notFound") {
      setOutcome({ kind: "missing" });
      return;
    }
    if (state.kind === "forbidden" && !proxy) {
      setOutcome({ kind: "lostAccess" });
      router.clearCache();
      return;
    }
    if (state.kind === "premiseChanged" || savedFirst) {
      if (!savedFirst) setDraft(followDraft);
      await reconcile();
    }
    // Set after the reconcile and inside the transition (a set after an
    // await is not), so CS-08 lands in the commit that shows the event's
    // current publication and holding state, never the stale copy.
    const next: Failure = {
      state,
      fields: occasionFieldErrors(state),
      attempt,
      savedFirst,
    };
    startBusy(() => setFailure(next));
  };

  const save = () =>
    startBusy(async () => {
      begin();
      try {
        if (!(await saveValues("save"))) return;
        await reconcile();
        startBusy(() => setOutcome({ kind: "saved" }));
      } catch (error) {
        await fail(error, "save");
      }
    });

  const publish = () =>
    startBusy(async () => {
      begin();
      let savedFirst = false;
      try {
        if (isDirty(draftRef.current)) {
          const saved = await saveValues("publish").catch(
            async (error: unknown) => {
              throw await publishSaveFailure(error, "OCCASION", async () => {
                const frame = await loadOccasionFrameFn({
                  data: { occasionId: data.occasionId },
                });
                return {
                  published: frame.publication.status === "published",
                  suspended: frame.suspended,
                };
              });
            },
          );
          if (!saved) return;
          savedFirst = true;
        }
        await transitionOccasionFn({
          data: { occasionId: data.occasionId, transition: "publish" },
        });
        await reconcile();
        startBusy(() => setOutcome({ kind: "published" }));
      } catch (error) {
        await fail(error, "publish", savedFirst);
      }
    });

  const transition = (
    kind: Exclude<OccasionTransition, "publish">,
    done: Outcome,
  ) =>
    startBusy(async () => {
      setConfirming(null);
      begin();
      try {
        await transitionOccasionFn({
          data: { occasionId: data.occasionId, transition: kind },
        });
        await reconcile();
        startBusy(() => setOutcome(done));
      } catch (error) {
        await fail(error, kind);
      }
    });

  const name = occasionName(data.name === "" ? null : data.name);
  const published = data.publication.status === "published";
  const holdingNow =
    data.holding === null ? null : `「${HOLDING_LABEL[data.holding]}」`;

  if (outcome?.kind === "missing" || outcome?.kind === "lostAccess") {
    return (
      <EventPage frame={frame} heading="イベント情報を編集">
        <ManageBody>
          <FocusOnMount role="alert">
            {outcome.kind === "missing" ? (
              <EmptyPanel
                title="このイベントは見つかりません"
                actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
              >
                イベントが削除されたか、存在しないイベントです。変更は保存していません。
              </EmptyPanel>
            ) : (
              <EmptyPanel
                title="このイベントを運営する権限がありません"
                actions={
                  <>
                    <ButtonLink to="/me">マイページへ戻る</ButtonLink>
                    <ButtonLink
                      variant="secondary"
                      to={occasionPagePath(data.occasionId)}
                    >
                      イベントページを見る
                    </ButtonLink>
                  </>
                }
              >
                イベントの管理権限がなくなったため、変更は保存していません。
              </EmptyPanel>
            )}
          </FocusOnMount>
        </ManageBody>
      </EventPage>
    );
  }

  if (outcome !== null) {
    const backToEdit = (
      <Button
        variant={outcome.kind === "unpublished" ? "primary" : "secondary"}
        onClick={() => {
          setOutcome(null);
          setResumed(true);
        }}
      >
        イベント情報の編集に戻る
      </Button>
    );
    const pageLink = data.viewable ? (
      <ButtonLink to={occasionPagePath(data.occasionId)}>
        イベントページを見る
      </ButtonLink>
    ) : null;
    const done = (() => {
      switch (outcome.kind) {
        case "saved":
          return {
            title: "イベント情報を保存しました",
            body: `${
              data.viewable
                ? "公開中のイベントページに変更を反映しました。"
                : data.suspended
                  ? "保存しました。このイベントは運営による非公開のため、閲覧者には表示されていません。"
                  : `保存しました。イベントは${occasionPublicationLabel(data.publication)}のままで、閲覧者には表示されていません。`
            }${
              data.cancelled
                ? "イベントは中止にしているため、開催期間にかかわらず開催の状態は「中止」のままです。中止を取り消すと、開催の状態は開催期間と今日の日付から決まる状態に戻ります。"
                : data.viewable && holdingNow !== null
                  ? `開催の状態は、開催期間と今日の日付から${holdingNow}です。`
                  : ""
            }`,
            actions: (
              <>
                {pageLink}
                {backToEdit}
              </>
            ),
          };
        case "published":
          return {
            title: `${name}を公開しました`,
            body: "イベントは、フィードとイベントの一覧に表示されます。参加店舗と添えた掲載には、関連するイベントとして示されます。",
            actions: (
              <>
                {pageLink}
                {backToEdit}
              </>
            ),
          };
        case "unpublished":
          return {
            title: "公開を取り下げました",
            body: `${name}は、閲覧者に表示されなくなりました。参加関係と開催地域の関連づけは保たれています。`,
            actions: backToEdit,
          };
        case "cancelled":
          return {
            title: "イベントを中止にしました",
            body: `${name}は、フィードとイベントの一覧と関連するイベントに表示されなくなりました。参加は保たれています。確認中・差し戻し中だった参加の申請は失効しました。中止は取り消せます。`,
            actions: (
              <>
                {backToEdit}
                <ButtonLink
                  variant="secondary"
                  to="/manage/events/$occasionId"
                  params={params}
                >
                  参加店舗と申請へ
                </ButtonLink>
              </>
            ),
          };
        case "uncancelled":
          return {
            title: "中止を取り消しました",
            body: `開催の状態は、開催期間と今日の日付から${holdingNow ?? "決まる状態"}に戻りました。${published && !data.suspended && (data.holding === "upcoming" || data.holding === "ongoing") ? "イベントは、フィードとイベントの一覧に再び表示されます。" : ""}失効した参加の申請は戻りません。`,
            actions: (
              <>
                {pageLink}
                {backToEdit}
              </>
            ),
          };
      }
    })();
    return (
      <EventPage frame={frame} heading="イベント情報を編集">
        <FocusOnMount>
          <DonePanel title={done.title} actions={done.actions}>
            {done.body}
          </DonePanel>
        </FocusOnMount>
      </EventPage>
    );
  }

  const fields = (
    <OccasionFormFields
      values={values}
      onChange={(change) =>
        setDraft((current) => ({
          ...current,
          values: { ...current.values, ...change },
        }))
      }
      errors={failure?.fields ?? {}}
      lists={data.areaLists}
      disabled={busy}
      photosTakenDown={data.photosTakenDown}
    />
  );
  const saveButton = (
    <Button
      type="submit"
      form="event-form"
      variant={published || data.suspended ? "primary" : "secondary"}
      disabled={busy}
    >
      {busy ? "保存しています…" : "変更を保存"}
    </Button>
  );
  const actions = data.suspended ? (
    saveButton
  ) : published ? (
    <>
      {saveButton}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => setConfirming("unpublish")}
      >
        公開を取り下げる
      </Button>
    </>
  ) : (
    <>
      <Button disabled={busy} onClick={publish}>
        公開する
      </Button>
      {saveButton}
    </>
  );

  return (
    <EventPage
      frame={frame}
      heading="イベント情報を編集"
      actions={actions}
      {...(dirty
        ? {
            actionsNote:
              "保存していない変更があります。保存せずに画面を離れると、変更は残りません。",
          }
        : {})}
    >
      <form
        className="m-body"
        id="event-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {failure === null ? null : (
          <FailureAlert
            failure={failure}
            occasionId={data.occasionId}
            proxy={proxy}
            busy={busy}
            onReload={() =>
              startBusy(async () => {
                setDraft(reloadDraft);
                await reconcile();
                setFailure(null);
              })
            }
            onRetry={
              failure.attempt === "save"
                ? save
                : failure.attempt === "publish"
                  ? publish
                  : null
            }
          />
        )}
        {registered ? (
          <div role="status">
            <Notice variant="manage" title="イベントを下書きとして登録しました">
              この画面のまま、内容を整えて公開へ進めます。登録したイベントは運営者が不在のイベントです。管理権限は、メンバーの管理から付与します。
            </Notice>
          </div>
        ) : null}
        {data.photosTakenDown ? (
          <div role="status">
            <Notice
              variant="manage"
              tone="paper"
              title="申立てにより、イベントの写真が削除されました"
              actions={
                <a className="text-button" href="#photos">
                  写真を登録する
                </a>
              }
            >
              {data.publication.status === "unpublished" &&
              data.publication.reason === "photoTakedown"
                ? data.suspended
                  ? "写真がなくなったため、イベントは公開を取り下げた状態になりました。写真を登録して保存し、運営による非公開が解除された後に、公開の操作で再び公開してください。"
                  : "写真がなくなったため、イベントは公開を取り下げた状態になりました。写真を登録して保存し、公開の操作で再び公開してください。"
                : "写真を登録して保存すると、この表示は消えます。"}
            </Notice>
          </div>
        ) : null}

        <section className="m-section" aria-labelledby="em02-state">
          <SectionTitle variant="manage" id="em02-state">
            公開状態
          </SectionTitle>
          <div className="em-state">
            <p className="p-badges">
              {data.suspended ? (
                <Badge tone="alert">運営による非公開</Badge>
              ) : null}
              <Badge
                tone={
                  published
                    ? data.suspended
                      ? "neutral"
                      : "accent"
                    : data.publication.status === "unpublished"
                      ? "muted"
                      : "neutral"
                }
              >
                {data.suspended && published
                  ? "公開"
                  : occasionPublicationLabel(data.publication)}
              </Badge>
            </p>
            <p className="m-field__help">
              {data.suspended
                ? "サービス運営者がイベントを非公開にしています。解除されるまで、イベントは閲覧者に表示されません。解除できるのはサービス運営者だけです。その間も、イベント情報の保存と、中止・中止の取り消しは行えます。"
                : published
                  ? "イベントは閲覧者に表示されています。保存した内容は、その時点でイベントページに反映します。公開をやめるときは、公開を取り下げます。"
                  : data.publication.status === "unpublished"
                    ? "イベントは閲覧者に表示されていません。参加関係と開催地域の関連づけは保たれています。公開すると、再び表示されます。"
                    : "イベントは閲覧者に表示されていません。名称・開催期間・開催場所・写真が揃うと公開できます。イベント運営者がいなくても公開できます。"}
            </p>
            {dirty && !published && !data.suspended ? (
              <p className="m-field__help">
                保存していない変更は、保存してから公開します。
              </p>
            ) : null}
          </div>
        </section>

        <section className="m-section" aria-labelledby="em02-held">
          <SectionTitle variant="manage" id="em02-held">
            開催の状態
          </SectionTitle>
          <div className="em-state">
            <p className="p-badges">
              {data.holding === null ? (
                <Badge>開催期間が未設定</Badge>
              ) : (
                <Badge
                  tone={
                    data.holding === "cancelled"
                      ? "alert"
                      : data.holding === "ended"
                        ? "muted"
                        : "accent"
                  }
                >
                  {HOLDING_LABEL[data.holding]}
                </Badge>
              )}
            </p>
            <p className="m-field__help">
              {data.cancelled
                ? "イベントは、フィードとイベントの一覧と関連するイベントに表示されていません。開催期間を変えて保存しても、中止のままです。中止を取り消すと、開催の状態は開催期間と今日の日付から決まる状態に戻ります。"
                : data.holding === "ended"
                  ? "開催期間を過ぎています。開催期間を今日より後へ変えて保存すると、開催前または開催中に戻ります。"
                  : data.holding === null
                    ? "開催期間を入力して保存すると、開催の状態が決まります。"
                    : "開催の状態は、開催期間と今日の日付から決まります。延期するときは、開催期間を変えて保存します。"}
            </p>
            <div>
              {data.cancelled ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    transition("revokeCancellation", { kind: "uncancelled" })
                  }
                >
                  中止を取り消す
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setConfirming("cancel")}
                >
                  中止にする
                </Button>
              )}
            </div>
          </div>
        </section>

        {resumed ? <FocusOnMount>{fields}</FocusOnMount> : fields}

        <hr className="m-divider" />
        <section className="m-section" aria-labelledby="em02-related">
          <SectionTitle variant="manage" id="em02-related">
            イベントの運営
          </SectionTitle>
          <LinkList>
            {data.viewable ? (
              <li>
                <ListRowLink
                  to={occasionPagePath(data.occasionId)}
                  title="閲覧者に見えるイベントページ"
                  meta="保存した内容は、このイベントページにすぐ反映します"
                />
              </li>
            ) : null}
            <li>
              <ListRowLink
                to="/manage/events/$occasionId/regions"
                params={params}
                title="開催地域"
                meta={
                  data.linkedRegions.count === 0
                    ? "関連づけている地域はありません"
                    : data.linkedRegions.count === 1
                      ? (data.linkedRegions.first ?? "1地域")
                      : `${data.linkedRegions.first ?? "地域"} ほか ${data.linkedRegions.count - 1}地域`
                }
              />
            </li>
            {proxy ? null : (
              <li>
                <ListRowLink
                  to={occasionMembersPath(data.occasionId)}
                  title="メンバーの管理"
                  meta={
                    data.stewardCount === 0
                      ? "イベント運営者はいません"
                      : `イベント運営者 ${data.stewardCount}人`
                  }
                />
              </li>
            )}
          </LinkList>
          <p className="m-field__help">
            参加店舗の情報と掲載は、イベントの運営からは変えられません。
          </p>
        </section>
      </form>

      <ConfirmDialog
        open={confirming === "unpublish"}
        title={`${name}の公開を取り下げますか`}
        confirmLabel="公開を取り下げる"
        pending={busy}
        onConfirm={() => transition("unpublish", { kind: "unpublished" })}
        onCancel={() => setConfirming(null)}
      >
        <p>確定すると、すぐに閲覧者への表示が変わります。</p>
        <ul>
          <li>
            イベントは、フィード・イベントの一覧・検索・イベントページのどこにも表示されなくなります
          </li>
          <li>
            参加店舗と添えた掲載にも、関連するイベントとして表示されなくなります
          </li>
          <li>参加関係と開催地域の関連づけは保たれます</li>
          <li>公開の操作で、再び公開できます</li>
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "cancel"}
        title={`${name}を中止にしますか`}
        confirmLabel="中止にする"
        pending={busy}
        onConfirm={() => transition("cancel", { kind: "cancelled" })}
        onCancel={() => setConfirming(null)}
      >
        <p>確定すると、すぐに閲覧者への表示が変わります。</p>
        <ul>
          <li>
            イベントは、フィードとイベントの一覧と、関連するイベントに表示されなくなります
          </li>
          <li>参加店舗の参加は保たれます</li>
          <li>
            確認中・差し戻し中の参加の申請は失効します。中止を取り消しても、戻りません
          </li>
          <li>中止は、あとから取り消せます</li>
        </ul>
      </ConfirmDialog>
    </EventPage>
  );
}

/**
 * The failure above the form; each new failure takes focus, which also
 * scrolls it into view — the dock's buttons sit far from it.
 */
function FailureAlert(props: FailureAlertProps) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedFor = useRef<Failure | null>(null);
  useEffect(() => {
    if (focusedFor.current === props.failure) return;
    focusedFor.current = props.failure;
    ref.current?.focus();
  }, [props.failure]);
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      <FailureBody {...props} />
    </div>
  );
}

type FailureAlertProps = {
  failure: Failure;
  occasionId: string;
  proxy: boolean;
  busy: boolean;
  onReload: () => void;
  onRetry: (() => void) | null;
};

function FailureBody({
  failure,
  occasionId,
  proxy,
  busy,
  onReload,
  onRetry,
}: FailureAlertProps) {
  const { state, fields, attempt } = failure;
  if (state.kind === "forbidden" && proxy) {
    return (
      <FocusOnMount role="alert">
        <ProxyUnavailablePanel occasionId={occasionId}>
          このイベントにはイベント運営者が就きました。変更は保存していません。イベントの運営の画面で、運営者がいることを確かめてください。
        </ProxyUnavailablePanel>
      </FocusOnMount>
    );
  }
  if (state.kind === "conflict") {
    return (
      <Alert
        title="ほかの運営者が先にイベント情報を保存していました"
        actions={
          <Button variant="secondary" disabled={busy} onClick={onReload}>
            最新の内容を読み直す
          </Button>
        }
      >
        この変更は保存していません。最新の内容を読み直してから、もう一度変更してください。
      </Alert>
    );
  }
  if (state.kind === "premiseChanged") {
    return (
      <Alert title={ATTEMPT_TITLE[attempt]}>
        {`${state.message}。現在の公開状態と開催の状態を示しています。`}
      </Alert>
    );
  }
  if (state.kind === "invalidInput") {
    const unmet = state.missing.length > 0;
    const listed = Object.keys(fields).length > 0;
    return (
      <Alert
        title={ATTEMPT_TITLE[attempt]}
        {...(listed ? { list: <FieldList fields={fields} /> } : {})}
      >
        {unmet
          ? attempt === "publish"
            ? `イベントの公開には、名称・開催期間・開催場所・写真が必要です。次の項目を補ってください。${failure.savedFirst ? "保存した内容は、公開していない状態のまま残っています。" : ""}`
            : "公開中のイベントは、名称・開催期間・開催場所・写真の公開の条件を満たす内容だけを保存できます。次の項目を直すか、先に公開を取り下げてから保存してください。"
          : fields.period !== undefined
            ? `${fields.period}。開催期間を直してください。`
            : listed
              ? "次の項目を直してください。"
              : state.message}
      </Alert>
    );
  }
  return (
    <Alert
      title={ATTEMPT_TITLE[attempt]}
      {...(onRetry === null
        ? {}
        : {
            actions: (
              <Button variant="secondary" disabled={busy} onClick={onRetry}>
                {attempt === "publish" ? "もう一度公開" : "もう一度保存"}
              </Button>
            ),
          })}
    >
      {state.kind === "failed"
        ? "通信を確かめて、もう一度お試しください。入力した内容は残っています。"
        : state.message}
    </Alert>
  );
}
