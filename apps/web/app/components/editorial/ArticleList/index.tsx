"use client";

import { Link, useSearch } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect } from "react";
import { ManageBody } from "@/components/layout/ManageShell";
import { ListFooter } from "@/components/region/ListFooter";
import { usePagedList } from "@/components/region/usePagedList";
import { Badge } from "@/components/ui/Badge";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { listEditorialArticlesFn } from "@/presentation/editorial";
import {
  ARTICLE_LIST_PAGE_SIZE,
  ARTICLE_STATUS_LABEL,
  ARTICLE_STATUSES,
  type ArticleRow,
  type ArticleStatusValue,
  articleEditPath,
  articleTitleText,
  type EditorialListData,
} from "@/presentation/editorialView";
import type { ListPage } from "@/presentation/regionView";
import { ArticleListFrame } from "./frame";

const SECTION_ID = {
  draft: "h-draft",
  published: "h-published",
  unpublished: "h-withdrawn",
} as const satisfies Readonly<Record<ArticleStatusValue, string>>;

const EMPTY_TEXT = {
  draft: "下書きの読みものはありません。",
  published: "公開の読みものはありません。",
  unpublished: "公開を取り下げた読みものはありません。",
} as const satisfies Readonly<Record<ArticleStatusValue, string>>;

const STATUS_TONE = {
  draft: "neutral",
  published: "accent",
  unpublished: "muted",
} as const;

const keyOf = (row: ArticleRow): string => row.articleId;

function ArticleRowLink({ row }: { row: ArticleRow }) {
  return (
    <Link className="m-row" to={articleEditPath(row.articleId)}>
      <span
        className={
          row.coverUrl === null ? "m-row__photo am01-nophoto" : "m-row__photo"
        }
      >
        {row.coverUrl === null ? (
          "写真なし"
        ) : (
          <img src={row.coverUrl} alt="" loading="lazy" />
        )}
      </span>
      <span className="m-row__content">
        <span className="m-row__name">{articleTitleText(row.title)}</span>
        <span className="m-row__meta am01-meta">
          <Badge tone={STATUS_TONE[row.status]}>
            {ARTICLE_STATUS_LABEL[row.status]}
          </Badge>
          {row.takedown === null ? null : (
            <Badge tone="alert">
              {row.takedown === "photos"
                ? "申立てで写真が削除されました"
                : "申立てによる写真の削除で取り下げ"}
            </Badge>
          )}
          <span>{row.dateText}</span>
        </span>
      </span>
    </Link>
  );
}

/** One state's section: its rows and the continuation (CF-05). */
function StatusSection({
  status,
  first,
}: {
  status: ArticleStatusValue;
  first: ListPage<ArticleRow>;
}) {
  const fetchPage = useCallback(
    (page: number) =>
      listEditorialArticlesFn({
        data: { status, page, limit: ARTICLE_LIST_PAGE_SIZE },
      }),
    [status],
  );
  const list = usePagedList(first, ARTICLE_LIST_PAGE_SIZE, keyOf, fetchPage);
  const id = SECTION_ID[status];
  return (
    <section className="m-section" aria-labelledby={id}>
      <SectionTitle variant="manage" id={id}>
        {ARTICLE_STATUS_LABEL[status]}
      </SectionTitle>
      {list.items.length === 0 ? (
        <p className="am01-empty">{EMPTY_TEXT[status]}</p>
      ) : (
        <>
          <ul className="m-rows">
            {list.items.map((row) => (
              <li key={row.articleId}>
                <ArticleRowLink row={row} />
              </li>
            ))}
          </ul>
          {first.count > first.items.length ? (
            <ListFooter
              hasMore={list.hasMore}
              failure={list.failure}
              loading={list.loading}
              loadMore={list.loadMore}
              sentinel={list.sentinel}
              endText={`${ARTICLE_STATUS_LABEL[status]}の読みものをすべて表示しました`}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * AM-01 読みものの一覧 (EDT-01, EDT-03〜EDT-05): every editor's articles,
 * whoever created them, by state — 下書き, 公開, 公開の取り下げ — each
 * paging on (CF-05). No operation here changes a state; a row opens AM-02.
 */
export function ArticleList({ data }: { data: EditorialListData }) {
  const status = useSearch({
    strict: false,
    select: (search) =>
      typeof search.status === "string" ? search.status : undefined,
  });
  useEffect(() => {
    if (status === undefined || !Object.hasOwn(SECTION_ID, status)) return;
    document
      .getElementById(SECTION_ID[status as ArticleStatusValue])
      ?.scrollIntoView();
  }, [status]);

  const total = ARTICLE_STATUSES.reduce((sum, key) => sum + data[key].count, 0);
  return (
    <ArticleListFrame>
      <ManageBody>
        {total === 0 ? (
          <EmptyPanel title="読みものはまだありません">
            掲載・店舗・地域・イベントを紹介する読みものを作成します。保存すると下書きになり、ここに並びます。
          </EmptyPanel>
        ) : (
          <>
            <p className="m-status">
              {`読みもの ${total}件 · すべての編集担当者の読みもの`}
            </p>
            <nav className="m-tabs" aria-label="読みものの状態">
              {ARTICLE_STATUSES.map((key) => (
                <a key={key} className="m-tab" href={`#${SECTION_ID[key]}`}>
                  {`${ARTICLE_STATUS_LABEL[key]} ${data[key].count}`}
                </a>
              ))}
            </nav>
          </>
        )}
        {ARTICLE_STATUSES.map((key, index) => (
          <Fragment key={key}>
            {index === 0 ? null : <hr className="m-divider" />}
            <StatusSection status={key} first={data[key]} />
          </Fragment>
        ))}
      </ManageBody>
    </ArticleListFrame>
  );
}
