"use client";

import { useRouter } from "@tanstack/react-router";
import { useCallback, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ArticleRowItem } from "@/presentation/detailView";
import { classifyError } from "@/presentation/errorState";
import { listArticlesShowcasingFn } from "@/presentation/reading";
import {
  ARTICLE_SECTION_PAGE_SIZE,
  type ArticlesPage,
  type ShowcaseTarget,
} from "@/presentation/readingView";
import { ArticleRow } from "../RelatedRows";

function appendNew(
  current: readonly ArticleRowItem[],
  more: readonly ArticleRowItem[],
): readonly ArticleRowItem[] {
  const seen = new Set(current.map((item) => item.articleId));
  return [...current, ...more.filter((item) => !seen.has(item.articleId))];
}

/**
 * The 読みもの section of DT-01〜DT-04 (「詳細の関連情報」): the published
 * articles showcasing the target itself, newest first, 3 at a time, the
 * rest on 「続きを読み込む」 (CF-05). The section sits at the foot of the
 * detail, so it does not load on coming into view: that would read every
 * article as soon as the viewer reaches the end.
 * Not shown at all without an article. If the target stopped being
 * viewable meanwhile, the route reloads into CS-06.
 */
export function ShowcasingArticles({
  target,
  first,
  headingId,
  grid = false,
}: {
  target: ShowcaseTarget;
  first: ArticlesPage;
  headingId: string;
  /** Two columns from `md` (DT-03's full-width sections). */
  grid?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(first.items);
  const [count, setCount] = useState(first.count);
  const [pages, setPages] = useState(1);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const hasMore = pages * ARTICLE_SECTION_PAGE_SIZE < count;

  const loadMore = useCallback(() => {
    startLoading(async () => {
      try {
        const page = await listArticlesShowcasingFn({
          data: { target, page: pages + 1 },
        });
        setItems((current) => appendNew(current, page.items));
        setCount(page.count);
        setPages((loaded) => loaded + 1);
        setFailed(false);
      } catch (error) {
        if (classifyError(error).kind === "notFound") {
          await router.invalidate({ sync: true });
          return;
        }
        setFailed(true);
      }
    });
  }, [target, pages, router]);

  if (items.length === 0) return null;
  return (
    <section
      className="detail-section"
      aria-labelledby={headingId}
      aria-busy={loading}
    >
      <SectionTitle id={headingId}>読みもの</SectionTitle>
      <div className={cx("detail-rows", grid && "detail-rows--grid")}>
        {items.map((item) => (
          <ArticleRow key={item.articleId} item={item} />
        ))}
      </div>
      {failed ? (
        <Notice
          tone="error"
          title="続きの読みものを読み込めませんでした"
          actions={
            <button className="text-button" type="button" onClick={loadMore}>
              もう一度読み込む
            </button>
          }
        >
          通信状況を確認して、もう一度お試しください。
        </Notice>
      ) : loading ? (
        <div className="loading" role="status">
          <p className="more-status">続きの読みものを読み込んでいます</p>
          <div className="skeleton-row">
            <Skeleton className="skeleton--thumb" />
            <span className="skeleton-row__lines">
              <Skeleton className="skeleton--line" />
              <Skeleton className="skeleton--line-short" />
            </span>
          </div>
        </div>
      ) : hasMore ? (
        <Button variant="secondary" fit onClick={loadMore}>
          続きを読み込む
        </Button>
      ) : count > ARTICLE_SECTION_PAGE_SIZE ? (
        <p className="more-status">読みものは以上です</p>
      ) : null}
    </section>
  );
}
