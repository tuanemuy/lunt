import { createFileRoute } from "@tanstack/react-router";
import {
  DetailLoadError,
  DetailUnavailable,
} from "@/components/detail/DetailFeedback";
import { RegionDetail } from "@/components/detail/RegionDetail";
import { RegionSkeleton } from "@/components/detail/RegionSkeleton";
import { loadRegionDetailFn, orNotFound } from "@/presentation/detail";
import { buildHead } from "@/presentation/head";

/**
 * DT-03 地域詳細. Needs no login. A region that is a draft, unpublished,
 * suspended or missing answers CS-06 with HTTP 404.
 */
export const Route = createFileRoute("/_viewer/regions/$regionId/")({
  staticData: {
    viewerHeader: { type: "detail", title: "まち" },
    viewerTab: "regions",
  },
  loader: ({ params }) =>
    orNotFound(loadRegionDetailFn({ data: { regionId: params.regionId } })),
  head: ({ match, loaderData, params }) => {
    const config = match.context?.config;
    // A re-read that found the target gone (CS-06) keeps the old data.
    if (!config || loaderData === undefined || match.status === "notFound") {
      return { meta: [{ title: "まち — Lunt" }] };
    }
    const cover = loaderData.photos[0]?.photo?.src;
    const description = loaderData.tagline ?? loaderData.description;
    const { meta, links } = buildHead(config, {
      title: `${loaderData.name} — Lunt`,
      ...(description === null ? {} : { description }),
      path: `/regions/${encodeURIComponent(params.regionId)}`,
      ...(cover === undefined ? {} : { ogImage: cover }),
    });
    return { meta, links };
  },
  pendingComponent: () => <RegionSkeleton />,
  notFoundComponent: () => <DetailUnavailable kind="region" />,
  errorComponent: DetailLoadError,
  component: RegionPage,
});

function RegionPage() {
  const data = Route.useLoaderData();
  return <RegionDetail key={data.regionId} data={data} />;
}
