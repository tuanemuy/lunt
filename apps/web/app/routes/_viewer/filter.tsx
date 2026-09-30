import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { z } from "zod";
import { ExploreLinks } from "@/components/discover/ExploreLinks";
import { FilterSkeleton } from "@/components/discover/FilterSkeleton";
import { Button } from "@/components/ui/Button";
import { Deferred } from "@/components/ui/Deferred";
import { Feedback } from "@/components/ui/Feedback";
import {
  browseSearchKey,
  browseSearchSchema,
} from "@/presentation/browseSearch";
import { buildHead } from "@/presentation/head";
import { renderFilter } from "./-renderDiscover";

const filterSearchSchema = browseSearchSchema.extend({
  from: z.enum(["discover", "map", "regions"]).catch("discover"),
});

/**
 * VW-02 絞り込み. Needs no login. `from` names the screen that opened it
 * (VW-01, VW-04 or VW-05) and `area` / `cat` the conditions it starts
 * from; applying goes back there with the chosen ones, the header's 戻る
 * leaves them as they were (取りやめ). The hierarchy's first level and the
 * categories stream in under the skeleton (CS-01).
 */
export const Route = createFileRoute("/_viewer/filter")({
  staticData: {
    viewerHeader: { type: "detail", title: "絞り込み" },
    viewerTab: "discover",
  },
  validateSearch: filterSearchSchema,
  loaderDeps: ({ search }) => ({ area: search.area, cat: search.cat }),
  loader: async ({ deps }) => {
    const { Filter } = await renderFilter({ data: deps });
    return { Filter, key: browseSearchKey(deps) };
  },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return { meta: [{ title: "絞り込み — Lunt" }] };
    const { meta, links } = buildHead(config, {
      title: "絞り込み — Lunt",
      path: "/filter",
    });
    return { meta, links };
  },
  component: FilterPage,
  errorComponent: FilterError,
});

function FilterPage() {
  const { Filter, key } = Route.useLoaderData();
  return <Deferred key={key} promise={Filter} fallback={<FilterSkeleton />} />;
}

/** CS-02: the hierarchy and the categories could not be read. */
function FilterError() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <div className="container filter">
      <h1 className="sr-only">絞り込み</h1>
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
        links={<ExploreLinks to={["search", "saved"]} />}
      />
    </div>
  );
}
