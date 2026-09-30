import { createFileRoute } from "@tanstack/react-router";
import { ExploreLoadError } from "@/components/explore/ExploreLoadError";
import { RegionsSkeleton } from "@/components/explore/ExploreSkeletons";
import { keepOnReturn } from "@/components/explore/entryMemory";
import { ButtonLink } from "@/components/ui/Button";
import { Deferred } from "@/components/ui/Deferred";
import {
  areaSelectionsOf,
  type BrowseSearch,
  browseSearchSchema,
} from "@/presentation/browseSearch";
import { buildHead } from "@/presentation/head";
import { renderRegions } from "../-renderExplore";

/**
 * VW-05 まち. Needs no login. `?area=` carries the chosen areas and `?cat=`
 * the categories (`presentation/browseSearch.ts`); only the areas apply.
 */
export const Route = createFileRoute("/_viewer/regions/")({
  ...keepOnReturn,
  validateSearch: browseSearchSchema,
  loaderDeps: ({ search }) => ({ area: search.area, cat: search.cat }),
  loader: async ({ deps }) => {
    const { Regions } = await renderRegions({ data: deps });
    return { Regions };
  },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return { meta: [{ title: "まち — Lunt" }] };
    const { meta, links } = buildHead(config, {
      title: "まち — Lunt",
      path: "/regions",
    });
    return { meta, links };
  },
  component: RegionsPage,
  errorComponent: RegionsError,
});

function RegionsHead({ search }: { search: BrowseSearch }) {
  const hasArea = areaSelectionsOf(search).length > 0;
  return (
    <div className="regions__head">
      <p className="regions__catch">
        まだ知らない、
        <br />
        街の表情。
      </p>
      <ButtonLink
        to="/filter"
        search={{ from: "regions", ...search }}
        variant="secondary"
      >
        {hasArea ? "エリアを変更する" : "エリアを選ぶ"}
      </ButtonLink>
    </div>
  );
}

function RegionsPage() {
  const { Regions } = Route.useLoaderData();
  const search = Route.useSearch();
  return (
    <div className="container regions">
      <h1 className="sr-only">まち</h1>
      <RegionsHead search={search} />
      <Deferred promise={Regions} fallback={<RegionsSkeleton />} />
    </div>
  );
}

/** CS-02: the regions could not be read. */
function RegionsError() {
  const search = Route.useSearch();
  return (
    <div className="container regions">
      <h1 className="sr-only">まち</h1>
      <RegionsHead search={search} />
      <ExploreLoadError ways={["search", "map", "saved"]} />
    </div>
  );
}
