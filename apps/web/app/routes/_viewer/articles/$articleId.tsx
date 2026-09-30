import { createFileRoute } from "@tanstack/react-router";
import { DetailLoadError } from "@/components/detail/DetailFeedback";
import {
  ArticleUnavailable,
  ArticleView,
} from "@/components/reading/ArticleView";
import { ArticleSkeleton } from "@/components/reading/ReadingSkeletons";
import { orNotFound } from "@/presentation/detail";
import { buildHead } from "@/presentation/head";
import { loadArticleDetailFn } from "@/presentation/reading";

/** The body's opening as the page description (one line, ~120 characters). */
const descriptionOf = (body: string): string => {
  const line = body.replace(/\s+/gu, " ").trim();
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
};

/**
 * DT-05 記事. Needs no login. The loader waits for the article, so one
 * that is a draft, unpublished or missing answers CS-06 with HTTP 404
 * (D-18); a navigation shows the article-shaped skeleton meanwhile
 * (CS-01). The header band keeps the fixed 読みもの (design DT-05); the
 * document is titled by the article. Back without history returns to
 * VW-09.
 */
export const Route = createFileRoute("/_viewer/articles/$articleId")({
  staticData: {
    viewerHeader: { type: "detail", title: "読みもの", backTo: "/articles" },
    viewerTab: "articles",
  },
  loader: ({ params }) =>
    orNotFound(loadArticleDetailFn({ data: { articleId: params.articleId } })),
  head: ({ match, loaderData, params }) => {
    const config = match.context?.config;
    // A re-read that found the article gone (CS-06) keeps the old data.
    if (!config || loaderData === undefined || match.status === "notFound") {
      return { meta: [{ title: "読みもの — Lunt" }] };
    }
    const cover = loaderData.photos[0]?.photo?.src;
    const { meta, links } = buildHead(config, {
      title: `${loaderData.title} — Lunt`,
      description: descriptionOf(loaderData.body),
      path: `/articles/${encodeURIComponent(params.articleId)}`,
      ...(cover === undefined ? {} : { ogImage: cover }),
    });
    return { meta, links };
  },
  pendingComponent: ArticleSkeleton,
  notFoundComponent: ArticleUnavailable,
  errorComponent: DetailLoadError,
  component: ArticlePage,
});

function ArticlePage() {
  const article = Route.useLoaderData();
  return <ArticleView key={article.articleId} article={article} />;
}
