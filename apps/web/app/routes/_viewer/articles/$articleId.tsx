import { createFileRoute } from "@tanstack/react-router";
import { DetailLoadError } from "@/components/detail/DetailFeedback";
import { ArticleUnavailable } from "@/components/reading/ArticleView";
import { ArticleSkeleton } from "@/components/reading/ReadingSkeletons";
import { Deferred } from "@/components/ui/Deferred";
import { orNotFound } from "@/presentation/detail";
import { buildHead } from "@/presentation/head";
import { renderArticle } from "../-renderReading";

/**
 * DT-05 記事. Needs no login. The article streams in under its skeleton
 * (CS-01); one that is a draft, unpublished or missing streams in as
 * CS-06, and an id that cannot name one is CS-06 at once. Back without
 * history returns to VW-09.
 */
export const Route = createFileRoute("/_viewer/articles/$articleId")({
  staticData: {
    viewerHeader: { type: "detail", title: "読みもの", backTo: "/articles" },
    viewerTab: "articles",
  },
  loader: async ({ params }) => {
    const { Article } = await orNotFound(
      renderArticle({ data: { articleId: params.articleId } }),
    );
    return { Article };
  },
  head: ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return { meta: [{ title: "読みもの — Lunt" }] };
    const { meta, links } = buildHead(config, {
      title: "読みもの — Lunt",
      path: `/articles/${encodeURIComponent(params.articleId)}`,
    });
    return { meta, links };
  },
  notFoundComponent: ArticleUnavailable,
  errorComponent: DetailLoadError,
  component: ArticlePage,
});

function ArticlePage() {
  const { Article } = Route.useLoaderData();
  return (
    <Deferred
      promise={Article}
      fallback={
        <div className="container article-page">
          <ArticleSkeleton />
        </div>
      }
    />
  );
}
