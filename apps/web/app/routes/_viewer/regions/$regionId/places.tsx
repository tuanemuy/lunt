import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ExploreLoadError } from "@/components/explore/ExploreLoadError";
import { RegionListSkeleton } from "@/components/explore/ExploreSkeletons";
import { keepOnReturn } from "@/components/explore/entryMemory";
import { Deferred } from "@/components/ui/Deferred";
import { renderRegionList } from "../../-renderExplore";

const searchSchema = z.object({
  tab: z.enum(["places", "listings"]).catch("places"),
});

/**
 * VW-06 地域内の一覧: `?tab=places` (the default) or `?tab=listings`,
 * the side chosen on DT-03. Needs no login; no browse condition applies.
 * The header names the region (`viewerTitle`); CS-06 keeps the fixed
 * 地域内の一覧. Back without history returns to the region's DT-03
 * (`viewerBackTo`), also from CS-02.
 */
export const Route = createFileRoute("/_viewer/regions/$regionId/places")({
  ...keepOnReturn,
  validateSearch: searchSchema,
  staticData: {
    viewerHeader: { type: "detail", title: "地域内の一覧" },
    viewerBackTo: (params) =>
      `/regions/${encodeURIComponent(params.regionId ?? "")}`,
    viewerTab: "regions",
  },
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ params, deps }) => {
    const { RegionList, regionName } = await renderRegionList({
      data: { regionId: params.regionId, tab: deps.tab },
    });
    return {
      RegionList,
      regionName,
      ...(regionName === null ? {} : { viewerTitle: regionName }),
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title:
          loaderData?.regionName == null
            ? "地域内の一覧 — Lunt"
            : `${loaderData.regionName}の地域内の一覧 — Lunt`,
      },
    ],
  }),
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
