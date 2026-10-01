"use client";

import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, useTransition } from "react";
import { ManagePage } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { HydrationGate } from "@/components/ui/HydrationGate";
import { createArticleFn } from "@/presentation/editorial";
import {
  ARTICLE_FIELD_ANCHOR,
  ARTICLE_FIELD_LABEL,
  ARTICLE_FIELDS,
  type ArticleFieldErrors,
  type ArticleFormValues,
  articleContentKey,
  articleEditPath,
  articleFieldErrors,
  EMPTY_ARTICLE_FORM,
  toArticleContent,
} from "@/presentation/editorialView";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { newId } from "@/presentation/newId";
import { ArticleFormFields } from "../ArticleFormFields";
import { EditorialTitle, NotEditorPanel } from "../EditorialShell";

const ARTICLE_ID_CONFLICT = "ARTICLE_ID_CONFLICT";

type Failure = Readonly<{ state: ErrorState; fields: ArticleFieldErrors }>;

function FailureAlert({
  failure,
  busy,
  onRetry,
}: {
  failure: Failure;
  busy: boolean;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const { state, fields } = failure;
  const listed = ARTICLE_FIELDS.filter((field) => fields[field] !== undefined);
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      <Alert
        title="保存できませんでした"
        {...(listed.length === 0
          ? {}
          : {
              list: listed.map((field) => (
                <li key={field}>
                  <a
                    className="text-button"
                    href={`#${ARTICLE_FIELD_ANCHOR[field]}`}
                  >
                    {ARTICLE_FIELD_LABEL[field]}
                  </a>
                </li>
              )),
            })}
        {...(state.kind === "failed"
          ? {
              actions: (
                <Button variant="secondary" disabled={busy} onClick={onRetry}>
                  もう一度保存
                </Button>
              ),
            }
          : {})}
      >
        {state.kind === "failed"
          ? "通信を確かめて、もう一度保存してください。入力した内容は残っています。"
          : listed.length > 0
            ? "次の項目を直してください。"
            : state.message}
      </Alert>
    </div>
  );
}

/**
 * AM-02 新規 (EDT-01): the empty form; saving creates the article as a
 * draft, publish requirements unchecked, and the screen goes on as that
 * draft's AM-02 (CM-03 and 公開 from there, EDT-03). Leaving without
 * saving creates nothing. The create is idempotent on the id minted for
 * this entry: a failed attempt may have been stored with only its answer
 * lost, so a resend reaches the same id.
 */
export function NewArticleEditor() {
  const navigate = useNavigate();
  const router = useRouter();
  const [values, setValues] = useState<ArticleFormValues>(EMPTY_ARTICLE_FORM);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const [lostAccess, setLostAccess] = useState(false);
  const [saving, startSave] = useTransition();
  const attemptId = useRef<string | null>(null);
  const dirty =
    articleContentKey(values) !== articleContentKey(EMPTY_ARTICLE_FORM);

  const save = () =>
    startSave(async () => {
      setFailure(null);
      setTaken(null);
      attemptId.current ??= newId();
      const articleId = attemptId.current;
      try {
        await createArticleFn({
          data: { articleId, content: toArticleContent(values) },
        });
        attemptId.current = null;
        await navigate({
          to: articleEditPath(articleId),
          search: { created: true },
          replace: true,
        });
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "forbidden") {
          setLostAccess(true);
          router.clearCache();
          return;
        }
        if (state.kind === "conflict" && state.code === ARTICLE_ID_CONFLICT) {
          setTaken(articleId);
          return;
        }
        setFailure({ state, fields: articleFieldErrors(state, values) });
      }
    });

  if (lostAccess) return <NotEditorPanel heading="新しい読みもの" lost />;

  return (
    <ManagePage
      title={<EditorialTitle heading="新しい読みもの" />}
      actions={
        <HydrationGate>
          <div className="am02-actions">
            <Button type="submit" form="article-form" disabled={saving}>
              {saving ? "保存しています…" : "下書きとして保存"}
            </Button>
          </div>
        </HydrationGate>
      }
      {...(dirty
        ? {
            actionsNote:
              "保存していない変更があります。保存せずに画面を離れると、読みものは作成されず、入力した内容は残りません。",
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
          <p className="m-status" data-tone="neutral">
            まだ保存していません · 保存すると下書きになります
          </p>
          {taken === null ? null : (
            <div role="alert">
              <Alert
                title="この読みものは、前の保存で作成されていました"
                actions={
                  <ButtonLink variant="secondary" to={articleEditPath(taken)}>
                    作成された下書きを開く
                  </ButtonLink>
                }
              >
                前の保存は通信の途中で結果が分からなくなりましたが、下書きは作成されていました。その後の変更は保存していません。作成された下書きを開いて、もう一度変更してください。
              </Alert>
            </div>
          )}
          {failure === null ? null : (
            <FailureAlert
              key={`${failure.state.kind}:${failure.state.code}`}
              failure={failure}
              busy={saving}
              onRetry={save}
            />
          )}
          <ArticleFormFields
            values={values}
            onChange={(change) =>
              setValues((current) => ({ ...current, ...change }))
            }
            errors={failure?.fields ?? {}}
            disabled={saving}
          />
        </HydrationGate>
      </form>
    </ManagePage>
  );
}
