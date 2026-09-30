import { createFileRoute } from "@tanstack/react-router";
import { ExploreLoadError } from "@/components/explore/ExploreLoadError";
import { keepOnReturn } from "@/components/explore/entryMemory";
import { ArticlesSkeleton } from "@/components/reading/ReadingSkeletons";
import { Deferred } from "@/components/ui/Deferred";
import { buildHead } from "@/presentation/head";
import { renderArticles } from "../-renderReading";

/**
 * VW-09 読む. Needs no login; no browse condition applies. The list
 * streams in under its skeleton (CS-01); returning from DT-05 finds the
 * pages read so far.
 */
export const Route = createFileRoute("/_viewer/articles/")({
  ...keepOnReturn,
  staticData: { viewerTab: "articles" },
  loader: async () => {
    const { Articles } = await renderArticles();
    return { Articles };
  },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return { meta: [{ title: "読みもの — Lunt" }] };
    const { meta, links } = buildHead(config, {
      title: "読みもの — Lunt",
      path: "/articles",
    });
    return { meta, links };
  },
  component: ArticlesPage,
  errorComponent: ArticlesError,
});

function ArticlesHead() {
  return (
    <>
      <h1 className="sr-only">読みもの</h1>
      <p className="articles__title">街を知る、読みもの。</p>
      <p className="articles__lead">ひとつのテーマから、次の寄り道へ。</p>
    </>
  );
}

function ArticlesPage() {
  const { Articles } = Route.useLoaderData();
  return (
    <div className="container articles">
      <ArticlesHead />
      <Deferred promise={Articles} fallback={<ArticlesSkeleton />} />
    </div>
  );
}

/** CS-02: the articles could not be read. */
function ArticlesError() {
  return (
    <div className="container articles">
      <ArticlesHead />
      <ExploreLoadError ways={["search", "regions", "events", "saved"]} />
    </div>
  );
}
