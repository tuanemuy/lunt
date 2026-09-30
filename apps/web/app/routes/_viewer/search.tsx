import {
  createFileRoute,
  type ErrorComponentProps,
  useRouter,
} from "@tanstack/react-router";
import { type ReactNode, useTransition } from "react";
import { z } from "zod";
import { ExploreLinks } from "@/components/discover/ExploreLinks";
import { SearchForm } from "@/components/discover/SearchForm";
import { SearchSkeleton } from "@/components/discover/SearchSkeleton";
import { keepOnReturn } from "@/components/explore/entryMemory";
import { Button } from "@/components/ui/Button";
import { Deferred } from "@/components/ui/Deferred";
import { Feedback } from "@/components/ui/Feedback";
import { keywordField } from "@/presentation/discover";
import { isBlankKeyword } from "@/presentation/discoverView";
import { classifyError } from "@/presentation/errorState";
import { buildHead } from "@/presentation/head";
import { renderSearch } from "./-renderDiscover";

// A hand-typed `?q=123` arrives as a JSON number; it is still a keyword.
const searchSchema = z.object({
  q: z
    .union([keywordField, z.number().transform(String)])
    .optional()
    .catch(undefined),
});

const BLANK_KEYWORD = "キーワードを入力してください。";

/**
 * VW-03 検索. Needs no login; the browse conditions never apply. The
 * keyword is the URL's `q`: absent is 「入力前」, blank is 「キーワード未入力」
 * (no search is made), anything else is searched and its results stream in
 * under the skeleton. Leaving without searching is the header's 戻る.
 */
export const Route = createFileRoute("/_viewer/search")({
  ...keepOnReturn,
  staticData: { viewerHeader: { type: "detail", title: "検索" } },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ deps }) => {
    const { q } = deps;
    if (q === undefined) return { state: "before" as const };
    if (isBlankKeyword(q)) return { state: "blank" as const };
    const { Results } = await renderSearch({ data: { keyword: q } });
    return { state: "results" as const, keyword: q, Results };
  },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return { meta: [{ title: "検索 — Lunt" }] };
    const { meta, links } = buildHead(config, {
      title: "検索 — Lunt",
      path: "/search",
    });
    return { meta, links };
  },
  component: SearchPage,
  errorComponent: SearchError,
});

function SearchFrame({
  keyword,
  error,
  children,
}: {
  keyword: string;
  error: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="container search">
      <h1 className="sr-only">検索</h1>
      <SearchForm key={keyword} keyword={keyword} error={error} />
      {children}
    </div>
  );
}

function SearchPage() {
  const data = Route.useLoaderData();
  const { q } = Route.useSearch();
  switch (data.state) {
    case "before":
      return <SearchFrame keyword="" error={null} />;
    case "blank":
      return <SearchFrame keyword={q ?? ""} error={BLANK_KEYWORD} />;
    case "results":
      return (
        <SearchFrame keyword={data.keyword} error={null}>
          {/* Not the bare keyword: SearchForm, its sibling, is keyed by it. */}
          <Deferred
            key={`results:${data.keyword}`}
            promise={data.Results}
            fallback={<SearchSkeleton keyword={data.keyword} />}
          />
        </SearchFrame>
      );
  }
}

/**
 * A keyword `SearchKeyword` refuses (over 100 characters) is told at the
 * field; anything else is CS-02, the keyword kept for the retry.
 */
function SearchError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const { q } = Route.useSearch();
  const [retrying, startRetry] = useTransition();
  const problem = classifyError(error);
  if (problem.kind === "invalidInput") {
    return <SearchFrame keyword={q ?? ""} error={problem.message} />;
  }
  return (
    <SearchFrame keyword={q ?? ""} error={null}>
      <Feedback
        kind="error"
        title="うまく読み込めませんでした。"
        body={
          <>
            通信状況を確認して、
            <br />
            もう一度お試しください。
          </>
        }
        action={
          <Button
            variant="secondary"
            disabled={retrying}
            onClick={() =>
              startRetry(async () => {
                await router.invalidate({ sync: true });
              })
            }
          >
            もう一度検索する
          </Button>
        }
        links={
          <ExploreLinks
            to={["map", "regions", "events", "articles", "saved"]}
          />
        }
      />
    </SearchFrame>
  );
}
