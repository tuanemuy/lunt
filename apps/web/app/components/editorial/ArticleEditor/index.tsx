"use client";

import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState, useTransition } from "react";
import { ManagePage } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { HydrationGate } from "@/components/ui/HydrationGate";
import { Notice } from "@/components/ui/Notice";
import { LinkList, ListRowLink } from "@/components/ui/Rows";
import { SectionTitle } from "@/components/ui/SectionTitle";
import {
  conflictedDraft,
  followDraft,
  isDirty,
  reloadDraft,
  savedDraft,
  settledDraft,
  useEditDraft,
} from "@/presentation/editDraft";
import {
  articlePublishPremiseFn,
  changeArticlePublicationFn,
  reviseArticleFn,
} from "@/presentation/editorial";
import {
  ARTICLE_FIELD_ANCHOR,
  ARTICLE_FIELD_LABEL,
  ARTICLE_FIELDS,
  type ArticleEditorData,
  type ArticleFieldErrors,
  type ArticleFormValues,
  articleEditPath,
  articleFieldErrors,
  articleFormValuesOf,
  articlePagePath,
  articlePreviewPath,
  articleTitleText,
  EDITORIAL_HOME,
  missingOf,
  toArticleContent,
  withCurrentShowcases,
} from "@/presentation/editorialView";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { rememberOwnPublication } from "@/presentation/ownPublication";
import { photosTakenMeanwhile } from "@/presentation/photoTakedown";
import { publishSaveFailure } from "@/presentation/publishPremise";
import { useReconcile } from "@/presentation/reconcile";
import { ArticleFormFields } from "../ArticleFormFields";
import {
  EditorialTitle,
  MissingArticlePanel,
  NotEditorPanel,
} from "../EditorialShell";

const HEADING = "読みものを編集";

type Attempt = "save" | "publish" | "unpublish";

type Failure = Readonly<{
  state: ErrorState;
  fields: ArticleFieldErrors;
  attempt: Attempt;
  /** The publish saved the unsaved changes before it failed. */
  savedFirst: boolean;
}>;

type Outcome =
  | Readonly<{ kind: "saved" }>
  | Readonly<{ kind: "published" }>
  | Readonly<{ kind: "unpublished" }>
  | Readonly<{ kind: "missing"; attempt: Attempt }>
  | Readonly<{ kind: "lostAccess" }>;

const NOT_APPLIED: Readonly<Record<Attempt, string>> = {
  save: "変更は保存していません。",
  publish: "公開していません。",
  unpublish: "公開を取り下げていません。",
};

const FAILED_TITLE: Readonly<Record<Attempt, string>> = {
  save: "保存できませんでした",
  publish: "公開できませんでした",
  unpublish: "公開を取り下げられませんでした",
};

const RETRY_LABEL: Readonly<Record<Attempt, string>> = {
  save: "もう一度保存",
  publish: "もう一度公開",
  unpublish: "もう一度取り下げる",
};

const STATUS_TONE = {
  draft: "neutral",
  published: undefined,
  unpublished: "alert",
} as const;

function FieldLinks({ fields }: { fields: ArticleFieldErrors }) {
  return ARTICLE_FIELDS.filter((field) => fields[field] !== undefined).map(
    (field) => (
      <li key={field}>
        <a className="text-button" href={`#${ARTICLE_FIELD_ANCHOR[field]}`}>
          {ARTICLE_FIELD_LABEL[field]}
        </a>
      </li>
    ),
  );
}

/**
 * The alert above AM-02's form after a failed save, publish or
 * unpublish: CS-07 (編集の競合), CS-08 (公開状態の変化), CS-10 (the
 * title's error, the unmet publish requirements) and CS-02. Each new
 * failure takes the focus, which also scrolls it into view from the dock.
 */
function FailureAlert({
  failure,
  statusText,
  takenDown,
  photosTakenMeanwhile,
  busy,
  onReload,
  onRetry,
}: {
  failure: Failure;
  statusText: string;
  /** The article is 公開の取り下げ because a claim took its last photo. */
  takenDown: boolean;
  /** A claim removed photos the form started from: the cause of a CS-07. */
  photosTakenMeanwhile: boolean;
  busy: boolean;
  onReload: () => void;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const { state, attempt, fields } = failure;
  const body = (() => {
    if (state.kind === "conflict") {
      return (
        <Alert
          title={
            photosTakenMeanwhile
              ? "申立てにより、写真が削除されていました"
              : "ほかの編集担当者が先に保存していました"
          }
          actions={
            <Button variant="secondary" disabled={busy} onClick={onReload}>
              最新の内容を読み直す
            </Button>
          }
        >
          {photosTakenMeanwhile
            ? "編集している間に、サービス運営者が申立てに基づいてこの読みものの写真を削除しました。この変更は保存していません。最新の内容を読み直してから、もう一度編集してください。"
            : "この変更は保存していません。最新の内容を読み直してから、もう一度編集してください。"}
        </Alert>
      );
    }
    if (state.kind === "premiseChanged") {
      return (
        <Alert
          title={
            attempt === "publish"
              ? "この読みものは、すでに公開されています"
              : attempt === "unpublish"
                ? "この読みものは、すでに公開を取り下げられています"
                : FAILED_TITLE[attempt]
          }
        >
          {attempt === "save"
            ? `${state.message}。現在の状態は「${statusText}」です。`
            : `${
                attempt === "publish"
                  ? "別の編集担当者が先に公開していました。"
                  : takenDown
                    ? "申立てにより写真が削除され、公開の取り下げになっていました。"
                    : "別の編集担当者が先に公開を取り下げていました。"
              }${NOT_APPLIED[attempt]}現在の公開状態は「${statusText}」です。`}
        </Alert>
      );
    }
    if (state.kind === "invalidInput") {
      const unmet = missingOf(state).length > 0;
      return (
        <Alert
          title={
            unmet && attempt === "publish"
              ? "公開できませんでした"
              : "保存できませんでした"
          }
          list={<FieldLinks fields={fields} />}
        >
          {unmet
            ? attempt === "publish"
              ? `公開には、タイトル・写真・本文が必要です。次の項目が足りません。${failure.savedFirst ? "保存した内容は、公開していない状態のまま残っています。" : ""}`
              : "公開中の読みものは、タイトル・写真・本文が揃った内容だけを保存できます。次の項目を直すか、先に公開を取り下げてから保存してください。"
            : Object.keys(fields).length === 0
              ? state.message
              : "次の項目を直してください。"}
        </Alert>
      );
    }
    return (
      <Alert
        title={FAILED_TITLE[attempt]}
        {...(state.kind === "failed"
          ? {
              actions: (
                <Button variant="secondary" disabled={busy} onClick={onRetry}>
                  {RETRY_LABEL[attempt]}
                </Button>
              ),
            }
          : {})}
      >
        {state.kind === "failed"
          ? attempt === "save"
            ? "通信を確かめて、もう一度保存してください。入力した内容は残っています。"
            : "通信を確かめて、もう一度お試しください。入力した内容は残っています。"
          : state.message}
      </Alert>
    );
  })();
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      {body}
    </div>
  );
}

/**
 * AM-02 読みものの編集 (EDT-02〜EDT-06, MOD-03): the whole content saved
 * at once — photos (CF-01), title, body and 紹介先 (CF-02) — and the
 * publication changed (CF-08: publish, saving unsaved changes first;
 * 公開の取り下げ after CS-12). Any editor edits any article. A save,
 * publish or unpublish shows its CS-13 as a notice above the form, which
 * stays with the new state's actions.
 */
export function ArticleEditor({ data }: { data: ArticleEditorData }) {
  const router = useRouter();
  const navigate = useNavigate();
  const reconcile = useReconcile();
  const created = useSearch({
    strict: false,
    select: (search) => search.created === true,
  });
  // The notice has been taken into state; a reload must not show it again.
  useEffect(() => {
    if (!created) return;
    void navigate({
      to: articleEditPath(data.articleId),
      search: {},
      replace: true,
      resetScroll: false,
    });
  }, [created, navigate, data.articleId]);
  const [draft, setDraft] = useEditDraft(
    data,
    articleFormValuesOf,
    toArticleContent,
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const values = withCurrentShowcases(draft.values, data.showcases);
  const dirty = isDirty(draft);
  const [outcome, setOutcome] = useState<Outcome | null>(
    created ? { kind: "saved" } : null,
  );
  const [failure, setFailure] = useState<Failure | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, startBusy] = useTransition();

  const title = articleTitleText(data.title === "" ? null : data.title);
  const published = data.status === "published";
  const hiddenCount = values.showcases.filter((item) => !item.viewable).length;

  const begin = () => {
    setFailure(null);
    setOutcome(null);
    setDraft(settledDraft);
  };

  const fail = async (error: unknown, attempt: Attempt, savedFirst = false) => {
    const state = classifyError(error);
    if (state.kind === "notFound") {
      setOutcome({ kind: "missing", attempt });
      return;
    }
    if (state.kind === "forbidden") {
      setOutcome({ kind: "lostAccess" });
      router.clearCache();
      return;
    }
    if (state.kind === "premiseChanged" || savedFirst) {
      if (!savedFirst) setDraft(followDraft);
      await reconcile();
    } else if (state.kind === "conflict") {
      // The edits and their version stay until 最新の内容を読み直す; the fresh
      // copy tells a claim's takedown (CS-16) from another editor's save.
      setDraft(conflictedDraft);
      await reconcile();
    }
    const next: Failure = {
      state,
      fields: articleFieldErrors(state, draftRef.current.values),
      attempt,
      savedFirst,
    };
    startBusy(() => {
      setConfirming(false);
      setFailure(next);
    });
  };

  /** Saves the form as it is; the reply's version is the one the next save sends. */
  const saveValues = async (): Promise<void> => {
    const { values: submitted, version } = draftRef.current;
    const saved = await reviseArticleFn({
      data: {
        articleId: data.articleId,
        version,
        content: toArticleContent(submitted),
      },
    });
    setDraft((current) => savedDraft(current, submitted, saved.version));
  };

  // Each outcome is set after the reconcile, inside the transition (a set
  // after an await is not), so it lands in the commit that shows the
  // reconciled article, and its focus on mount is not undone by the router's
  // scroll restoration or by the closing confirm dialog's focus return.
  const save = () =>
    startBusy(async () => {
      begin();
      try {
        await saveValues();
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
          await saveValues().catch(async (error: unknown) => {
            throw await publishSaveFailure(error, "ARTICLE", () =>
              articlePublishPremiseFn({ data: { articleId: data.articleId } }),
            );
          });
          savedFirst = true;
        }
        const published = await changeArticlePublicationFn({
          data: { articleId: data.articleId, change: "publish" },
        });
        rememberOwnPublication(data.articleId, published.version);
        await reconcile();
        startBusy(() => setOutcome({ kind: "published" }));
      } catch (error) {
        await fail(error, "publish", savedFirst);
      }
    });

  const unpublish = () =>
    startBusy(async () => {
      begin();
      try {
        await changeArticlePublicationFn({
          data: { articleId: data.articleId, change: "unpublish" },
        });
        await reconcile();
        startBusy(() => {
          setConfirming(false);
          setOutcome({ kind: "unpublished" });
        });
      } catch (error) {
        await fail(error, "unpublish");
      }
    });

  const retry = (attempt: Attempt) =>
    attempt === "save"
      ? save()
      : attempt === "publish"
        ? publish()
        : unpublish();

  if (outcome?.kind === "missing") {
    return <MissingArticlePanel applied={NOT_APPLIED[outcome.attempt]} />;
  }
  if (outcome?.kind === "lostAccess") {
    return <NotEditorPanel heading={HEADING} lost />;
  }
  const saveButton = (
    <Button type="submit" form="article-form" disabled={busy}>
      {busy ? "保存しています…" : "保存"}
    </Button>
  );
  const actions = (
    <div className="am02-actions">
      {saveButton}
      {published ? (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          公開を取り下げる
        </Button>
      ) : (
        <Button variant="secondary" disabled={busy} onClick={publish}>
          公開する
        </Button>
      )}
    </div>
  );

  const onChange = (change: Partial<ArticleFormValues>) =>
    setDraft((current) => ({
      ...current,
      values: { ...current.values, ...change },
    }));

  return (
    <ManagePage
      title={<EditorialTitle heading={HEADING} />}
      actions={actions}
      {...(dirty
        ? {
            actionsNote: published
              ? "保存していない変更があります。保存せずに画面を離れると、変更は残りません。"
              : "保存していない変更があります。公開すると、変更を保存してから公開します。保存せずに画面を離れると、変更は残りません。",
          }
        : {})}
    >
      <form
        className="m-body"
        id="article-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <HydrationGate>
          <p className="m-status" data-tone={STATUS_TONE[data.status]}>
            {data.statusText}
          </p>
          {hiddenCount === 0 ? null : (
            <a className="text-button am02-warn" href="#h-refs">
              {`閲覧者が閲覧できない紹介先が${hiddenCount}件あります`}
            </a>
          )}
          {failure === null ? null : (
            <FailureAlert
              key={`${failure.attempt}:${failure.state.kind}:${failure.state.code}`}
              failure={failure}
              statusText={data.statusText}
              takenDown={data.reason === "photoTakedown"}
              photosTakenMeanwhile={photosTakenMeanwhile(
                data,
                draft.base.photos,
              )}
              busy={busy}
              onReload={() =>
                startBusy(async () => {
                  setDraft(reloadDraft);
                  await reconcile();
                  setFailure(null);
                })
              }
              onRetry={() => retry(failure.attempt)}
            />
          )}
          {outcome?.kind === "published" ? (
            <FocusOnMount key={`published:${data.version}`} role="status">
              <Notice
                variant="manage"
                title="読みものを公開しました"
                actions={
                  <>
                    <ButtonLink
                      variant="secondary"
                      to={articlePagePath(data.articleId)}
                    >
                      公開中の記事を見る
                    </ButtonLink>
                    <ButtonLink variant="secondary" to={EDITORIAL_HOME}>
                      読みものの一覧へ戻る
                    </ButtonLink>
                  </>
                }
              >
                {`「${title}」は、読みものの一覧・フィード・キーワード検索と、紹介先の詳細に表示されます。`}
              </Notice>
            </FocusOnMount>
          ) : null}
          {outcome?.kind === "unpublished" ? (
            <FocusOnMount key={`unpublished:${data.version}`} role="status">
              <Notice
                variant="manage"
                title="公開を取り下げました"
                actions={
                  <ButtonLink variant="secondary" to={EDITORIAL_HOME}>
                    読みものの一覧へ戻る
                  </ButtonLink>
                }
              >
                {`「${title}」は、閲覧者に表示されなくなりました。内容と紹介先の結びつけは残っています。公開の操作で再び公開できます。`}
              </Notice>
            </FocusOnMount>
          ) : null}
          {outcome?.kind === "saved" ? (
            <FocusOnMount key={`saved:${data.version}`} role="status">
              <Notice
                variant="manage"
                title={
                  data.status === "draft"
                    ? "下書きとして保存しました"
                    : published
                      ? "保存しました。公開中の記事に反映しました"
                      : "保存しました"
                }
                {...(published
                  ? {
                      actions: (
                        <ButtonLink
                          variant="secondary"
                          to={articlePagePath(data.articleId)}
                        >
                          公開中の記事を見る
                        </ButtonLink>
                      ),
                    }
                  : {})}
              >
                {published
                  ? "閲覧者への表示に、その時点で反映しました。"
                  : "閲覧者には表示されていません。続けて、公開前の見え方を確かめるか、公開できます。"}
              </Notice>
            </FocusOnMount>
          ) : null}
          {data.photosTakenDown ? (
            <div role="status">
              <Notice
                variant="manage"
                tone="paper"
                title="申立てにより、写真が削除されました"
                actions={
                  <a className="text-button" href="#photos">
                    写真を登録する
                  </a>
                }
              >
                {data.reason === "photoTakedown"
                  ? "写真がなくなったため、公開を取り下げました。写真を登録して保存し、公開の操作で再び公開します。"
                  : `読みものは「${data.statusText}」のままです。写真を登録して保存すると、この表示は消えます。`}
              </Notice>
            </div>
          ) : null}

          <ArticleFormFields
            values={values}
            onChange={onChange}
            errors={failure?.fields ?? {}}
            disabled={busy}
            {...(data.photosTakenDown
              ? { emptyPhotoText: "写真は削除されました" }
              : {})}
          />

          <section className="m-section" aria-labelledby="h-preview">
            <hr className="m-divider" />
            <SectionTitle variant="manage" id="h-preview">
              閲覧者への見え方
            </SectionTitle>
            <LinkList>
              <li>
                {published ? (
                  <ListRowLink
                    to={articlePagePath(data.articleId)}
                    title="公開中の記事を見る"
                    meta="保存した内容は、その時点で記事に反映します"
                  />
                ) : (
                  <ListRowLink
                    to={articlePreviewPath(data.articleId)}
                    title="公開前の見え方を確かめる"
                    meta={
                      dirty
                        ? "保存した内容を、閲覧者に見える記事の形で確かめます。保存していない変更は含まれません"
                        : "保存した内容を、閲覧者に見える記事の形で確かめます。公開の必須の手順ではありません"
                    }
                  />
                )}
              </li>
            </LinkList>
          </section>
        </HydrationGate>
      </form>

      <ConfirmDialog
        open={confirming}
        title="公開を取り下げますか"
        confirmLabel="公開を取り下げる"
        pending={busy}
        onConfirm={unpublish}
        onCancel={() => setConfirming(false)}
      >
        <p>確定すると、すぐに閲覧者への表示が変わります。</p>
        <ul>
          <li>
            読みものの一覧・フィード・キーワード検索・紹介先の詳細の、どこにも表示されなくなります
          </li>
          <li>内容と紹介先の結びつけは、そのまま残ります</li>
          <li>公開の操作で、再び公開できます</li>
        </ul>
      </ConfirmDialog>
    </ManagePage>
  );
}
