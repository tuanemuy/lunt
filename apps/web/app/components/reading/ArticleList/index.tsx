"use client";

import { Link } from "@tanstack/react-router";
import { entryMemory } from "@/components/explore/entryMemory";
import { ListFooter } from "@/components/explore/ListFooter";
import {
  type PagedState,
  usePagedList,
} from "@/components/explore/usePagedList";
import { ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { Photo } from "@/components/ui/Photo";
import { TextLink } from "@/components/ui/TextButton";
import type { ArticleRowItem } from "@/presentation/detailView";
import { listArticlesFn } from "@/presentation/reading";
import {
  ARTICLES_PAGE_SIZE,
  type ArticlesPage,
} from "@/presentation/readingView";
import { ArticleFeatureSkeleton } from "../ReadingSkeletons";

/** The frames' photo box (EditorialFeature 348 × 193). */
const FEATURE_RATIO = 348 / 193;

const pagesMemory = entryMemory<PagedState<ArticleRowItem>>();

const fetchPage = (page: number) => listArticlesFn({ data: { page } });
const idOf = (item: ArticleRowItem) => item.articleId;

/** EditorialFeature of an article: its cover and title → DT-05. */
function ArticleFeature({ item }: { item: ArticleRowItem }) {
  return (
    <Link
      className="feature"
      to="/articles/$articleId"
      params={{ articleId: item.articleId }}
    >
      <Photo
        photo={item.photo}
        alt=""
        ratio={FEATURE_RATIO}
        className="feature__photo"
      />
      <div className="feature__foot">
        <h2 className="feature__name">{item.title}</h2>
      </div>
    </Link>
  );
}

/**
 * VW-09 読む (`spec/pages/browse.md`): the published articles, newest first
 * by their first publication, each as its photo and title, loading more
 * as the end comes into view (CF-05). No browse condition applies.
 * Without any, CS-09 「読みものがない」 leads to other ways to explore.
 */
export function ArticleList({ first }: { first: ArticlesPage }) {
  const list = usePagedList({
    name: "articles",
    first,
    pageSize: ARTICLES_PAGE_SIZE,
    idOf,
    fetchPage,
    memory: pagesMemory,
  });
  if (list.items.length === 0) {
    return (
      <Feedback
        kind="empty"
        icon="book"
        title="読みものを、準備しています。"
        body={
          <>
            新しい読みものを公開したら、
            <br />
            ここでお知らせします。
          </>
        }
        action={
          <ButtonLink variant="secondary" to="/">
            みつけるへ
          </ButtonLink>
        }
        links={
          <>
            <TextLink to="/map">地図で探す</TextLink>
            <TextLink to="/regions">まちを探す</TextLink>
            <TextLink to="/events">イベントを見る</TextLink>
          </>
        }
      />
    );
  }
  return (
    <ul className="articles__list">
      {list.items.map((item) => (
        <li key={item.articleId}>
          <ArticleFeature item={item} />
        </li>
      ))}
      <li>
        <ListFooter
          list={list}
          loadingText="続きを読み込んでいます"
          loadingShape={<ArticleFeatureSkeleton />}
          endText="読みものはここまでです"
        />
      </li>
    </ul>
  );
}
