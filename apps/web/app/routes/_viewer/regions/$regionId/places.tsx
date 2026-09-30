import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ExploreLoadError } from "@/components/explore/ExploreLoadError";
import { RegionListSkeleton } from "@/components/explore/ExploreSkeletons";
import { Deferred } from "@/components/ui/Deferred";
import { renderRegionList } from "../../-renderExplore";

const searchSchema = z.object({
  tab: z.enum(["places", "listings"]).catch("places"),
});

/**
 * VW-06 地域内の一覧: `?tab=places` (the default) or `?tab=listings`,
 * the side chosen on DT-03. Needs no login; no browse condition applies.
 */
export const Route = createFileRoute("/_viewer/regions/$regionId/places")({
  validateSearch: searchSchema,
  staticData: {
    viewerHeader: { type: "detail", title: "地域内の一覧", backTo: "/regions" },
    viewerTab: "regions",
  },
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ params, deps }) => {
    const { RegionList } = await renderRegionList({
      data: { regionId: params.regionId, tab: deps.tab },
    });
    return { RegionList };
  },
  head: () => ({ meta: [{ title: "地域内の一覧 — Lunt" }] }),
  component: RegionListPage,
  errorComponent: RegionListError,
});

function RegionListPage() {
  const { RegionList } = Route.useLoaderData();
  return (
    <div className="container region-list">
      <Deferred promise={RegionList} fallback={<RegionListSkeleton />} />
    </div>
  );
}

/** CS-02: the list could not be read. */
function RegionListError() {
  return (
    <div className="container region-list">
      <h1 className="sr-only">地域内の一覧</h1>
      <ExploreLoadError ways={["regions", "search", "saved"]} />
    </div>
  );
}
