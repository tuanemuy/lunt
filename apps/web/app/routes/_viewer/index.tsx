import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useTransition } from "react";
import { DiscoverProvider } from "@/components/discover/DiscoverContext";
import { ExploreLinks } from "@/components/discover/ExploreLinks";
import { FeedSkeleton } from "@/components/discover/FeedSkeleton";
import { feedOrigin, originKey } from "@/components/discover/feedOrigin";
import { feedSaves, readFeedSaves } from "@/components/discover/feedSaves";
import { keepOnReturn } from "@/components/explore/entryMemory";
import { Button } from "@/components/ui/Button";
import { Deferred } from "@/components/ui/Deferred";
import { Feedback } from "@/components/ui/Feedback";
import { loadSaveStateFn } from "@/presentation/bookmark";
import {
  browseSearchKey,
  browseSearchSchema,
} from "@/presentation/browseSearch";
import { buildHead } from "@/presentation/head";
import { renderFeed } from "./-renderDiscover";

/**
 * VW-01 みつける, the viewer home. Needs no login. The conditions (CF-03)
 * are the URL's `area` / `cat`; the viewer's position (DIS-06) is this
 * tab's memory (`feedOrigin`), read here so a return from a detail finds
 * the same feed. The feed streams in under its skeleton, and a change of
 * the conditions or the position shows the skeleton again (CS-01). The
 * account's saves of every card shown are read with it, so the re-read on
 * return after a save (CF-04, `rereadOnReturn`) updates every page's cards.
 */
export const Route = createFileRoute("/_viewer/")({
  ...keepOnReturn,
  validateSearch: browseSearchSchema,
  loaderDeps: ({ search }) => ({ area: search.area, cat: search.cat }),
  loader: async ({ deps, location }) => {
    const origin = feedOrigin.get();
    const [{ Feed }, saves] = await Promise.all([
      renderFeed({ data: { search: deps, origin } }),
      readFeedSaves(feedSaves.shownIn(location.state.__TSR_key), (targets) =>
        loadSaveStateFn({ data: { targets: [...targets] } }),
      ),
    ]);
    return {
      Feed,
      origin,
      saves,
      feedKey: `${browseSearchKey(deps)}|${originKey(origin)}`,
    };
  },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, { path: "/" });
    return { meta, links };
  },
  staticData: { viewerTab: "discover" },
  component: DiscoverPage,
  errorComponent: DiscoverError,
});

function DiscoverPage() {
  const { Feed, origin, saves, feedKey } = Route.useLoaderData();
  const router = useRouter();
  const reread = useCallback(() => {
    void router.invalidate({ filter: (match) => match.routeId === Route.id });
  }, [router]);
  return (
    <DiscoverProvider origin={origin} saves={saves} onOriginChange={reread}>
      <Deferred key={feedKey} promise={Feed} fallback={<FeedSkeleton />} />
    </DiscoverProvider>
  );
}

/** CS-02 (37 通信エラー): retry, or another way to explore. */
function DiscoverError() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <div className="container discover discover--spaced">
      <h1 className="sr-only">みつける</h1>
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
            もう一度読み込む
          </Button>
        }
        links={<ExploreLinks to={["search", "events", "saved"]} />}
      />
    </div>
  );
}
