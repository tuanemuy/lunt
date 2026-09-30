"use client";

import { useRouter } from "@tanstack/react-router";
import { useState, useTransition } from "react";
import { ManageBody, ManagePage } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DonePanel } from "@/components/ui/DonePanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Notice } from "@/components/ui/Notice";
import { changeArticlePublicationFn } from "@/presentation/editorial";
import {
  ARTICLE_FIELD_LABEL,
  type ArticlePreviewData,
  articleEditPath,
  articlePagePath,
  articleTitleText,
  EDITORIAL_HOME,
  missingOf,
  SHOWCASE_KIND_LABEL,
  type ShowcaseItem,
  showcaseNameText,
  showcasePagePath,
} from "@/presentation/editorialView";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { useReconcile } from "@/presentation/reconcile";
import {
  EditorialTitle,
  MissingArticlePanel,
  NotEditorPanel,
} from "../EditorialShell";

const HEADING = "公開前プレビュー";

type Outcome = "published" | "missing" | "lostAccess";

/** One paragraph per blank-line-separated block; single line breaks stay. */
const paragraphsOf = (body: string): readonly string[] =>
  body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== "");

function ShowcaseRow({ item }: { item: ShowcaseItem }) {
  return (
    <a className="content-row" href={showcasePagePath(item.kind, item.id)}>
      <div className="content-row__photo">
        {item.photoUrl === null ? null : (
          <img src={item.photoUrl} alt="" loading="lazy" />
        )}
      </div>
      <div className="content-row__body">
        <p className="content-row__name">{showcaseNameText(item)}</p>
        {item.row.meta === null ? null : (
          <p className="content-row__meta">{item.row.meta}</p>
        )}
        {item.row.area === null ? null : (
          <p className="content-row__area">{item.row.area}</p>
        )}
      </div>
    </a>
  );
}

/**
 * CM-03 公開前の確認 of an article (EDT-03): the saved content as viewers
 * would see it — the article page (photos, body, 紹介先) and the frame in
 * 読む and the feed — with the showcases viewers cannot see named as left
 * out, and the publish shared with AM-02 (CF-08). Leaving without
 * publishing changes nothing; an article without showcases can be
 * published.
 */
export function ArticlePreview({ data }: { data: ArticlePreviewData }) {
  const router = useRouter();
  const reconcile = useReconcile();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failure, setFailure] = useState<ErrorState | null>(null);
  const [publishing, startPublish] = useTransition();
  const title = articleTitleText(data.title);
  const alreadyPublished = data.status === "published";
  const [cover, ...rest] = data.photos;

  const publish = () =>
    startPublish(async () => {
      setFailure(null);
      try {
        await changeArticlePublicationFn({
          data: { articleId: data.articleId, change: "publish" },
        });
        setOutcome("published");
        await reconcile();
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "notFound") {
          setOutcome("missing");
          return;
        }
        if (state.kind === "forbidden") {
          setOutcome("lostAccess");
          router.clearCache();
          return;
        }
        setFailure(state);
        if (state.kind === "premiseChanged") await reconcile();
      }
    });

  const editLink = (
    <ButtonLink variant="secondary" to={articleEditPath(data.articleId)}>
      編集に戻る
    </ButtonLink>
  );

  if (outcome === "missing") {
    return <MissingArticlePanel applied="公開していません。" />;
  }
  if (outcome === "lostAccess") {
    return <NotEditorPanel heading={HEADING} lost />;
  }
  if (outcome === "published") {
    return (
      <ManagePage title={<EditorialTitle heading={HEADING} />}>
        <FocusOnMount>
          <DonePanel
            title="公開しました"
            actions={
              <>
                <ButtonLink to={articlePagePath(data.articleId)}>
                  記事を見る
                </ButtonLink>
                <ButtonLink variant="secondary" to={EDITORIAL_HOME}>
                  読みものの一覧へ戻る
                </ButtonLink>
              </>
            }
          >
            {`${title}を公開しました。読む・フィードと記事から見られます。`}
          </DonePanel>
        </FocusOnMount>
      </ManagePage>
    );
  }

  const missing = failure === null ? data.missing : missingOf(failure);
  return (
    <ManagePage
      title={<EditorialTitle heading={HEADING} />}
      actions={
        alreadyPublished ? (
          editLink
        ) : (
          <>
            <Button disabled={publishing} onClick={publish}>
              {publishing ? "公開しています…" : "この内容で公開"}
            </Button>
            {editLink}
          </>
        )
      }
    >
      <ManageBody>
        {failure === null ? null : failure.kind === "invalidInput" &&
          missingOf(failure).length > 0 ? (
          <div role="alert">
            <Alert title="公開できませんでした" actions={editLink}>
              {`タイトル・写真・本文は、読みものを公開するための条件です。${missing
                .map((item) => ARTICLE_FIELD_LABEL[item])
                .join("・")}がありません。読みものの編集で直してください。`}
            </Alert>
          </div>
        ) : failure.kind === "premiseChanged" ? null : (
          <div role="alert">
            <Alert
              title="公開できませんでした"
              {...(failure.kind === "failed"
                ? {
                    actions: (
                      <Button
                        variant="secondary"
                        disabled={publishing}
                        onClick={publish}
                      >
                        もう一度公開
                      </Button>
                    ),
                  }
                : {})}
            >
              {failure.kind === "failed"
                ? "通信を確かめて、もう一度公開してください。"
                : failure.message}
            </Alert>
          </div>
        )}
        {alreadyPublished ? (
          <div role="status">
            <Notice
              variant="manage"
              tone="paper"
              title="この読みものは、ほかの編集担当者がすでに公開しています"
            >
              いまの公開状態は「公開中」です。公開中の読みものは、公開中の記事で確かめます。内容の変更は、読みものの編集で行えます。
            </Notice>
          </div>
        ) : null}
        {!alreadyPublished && failure === null && data.missing.length > 0 ? (
          <Notice
            variant="manage"
            tone="paper"
            title="このままでは公開できません"
          >
            {`公開には、タイトル・写真・本文が必要です。${data.missing
              .map((item) => ARTICLE_FIELD_LABEL[item])
              .join("・")}がありません。見え方は確かめられます。`}
          </Notice>
        ) : null}

        <p className="cm03-meta">見る人には、このように表示されます。</p>

        <p className="cm03-label">記事</p>
        <article className="cm03-article">
          <div className="feature">
            {cover === undefined || cover.url === null ? (
              <p className="cm03-missing">写真が登録されていません</p>
            ) : (
              <div className="feature__photo">
                <img src={cover.url} alt="" />
              </div>
            )}
            <div className="feature__foot">
              <p className="feature__name">{title}</p>
            </div>
          </div>
          {data.body === null ? (
            <p className="cm03-missing">本文が入力されていません</p>
          ) : (
            <div className="cm03-article__body">
              {paragraphsOf(data.body).map((paragraph, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs of one text, in order
                <p key={index} className="cm03-article__text">
                  {paragraph}
                </p>
              ))}
            </div>
          )}
          {rest.length === 0 ? null : (
            <ul className="cm03-article__photos">
              {rest.map((photo) => (
                <li key={photo.photoId}>
                  {photo.url === null ? null : (
                    <img src={photo.url} alt="" loading="lazy" />
                  )}
                </li>
              ))}
            </ul>
          )}
          {data.shown.length === 0 ? null : (
            <>
              <p className="cm03-label">紹介したお店と街</p>
              <ul className="m-rows">
                {data.shown.map((item) => (
                  <li key={`${item.kind}:${item.id}`}>
                    <ShowcaseRow item={item} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>
        {data.hidden.length === 0 ? null : (
          <div className="cm03-hidden-target">
            <p className="m-t-ui">{`表示されない紹介先 ${data.hidden.length}件`}</p>
            <p className="cm03-meta">
              {`${data.hidden
                .map(
                  (item) =>
                    `${showcaseNameText(item)}（${SHOWCASE_KIND_LABEL[item.kind]}）`,
                )
                .join(
                  "・",
                )}は、閲覧者が閲覧できないため、記事に表示されません。`}
            </p>
          </div>
        )}

        <p className="cm03-label">読む・フィード</p>
        <div className="feature cm03-frame">
          <div className="feature__head">
            <p className="feature__kicker">読みもの</p>
          </div>
          {cover === undefined || cover.url === null ? (
            <p className="cm03-missing">写真が登録されていません</p>
          ) : (
            <div className="feature__photo">
              <img src={cover.url} alt="" />
            </div>
          )}
          <div className="feature__foot">
            <p className="feature__name">{title}</p>
          </div>
        </div>

        <Notice variant="manage" title="公開先">
          読む・フィードと、紹介先の詳細に表示されます。紹介先がなくても公開できます。
        </Notice>
      </ManageBody>
    </ManagePage>
  );
}
