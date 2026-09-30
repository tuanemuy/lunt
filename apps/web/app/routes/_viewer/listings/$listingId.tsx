import { createFileRoute } from "@tanstack/react-router";
import {
  DetailLoadError,
  DetailUnavailable,
} from "@/components/detail/DetailFeedback";
import { DetailSkeleton } from "@/components/detail/DetailSkeleton";
import { ListingDetail } from "@/components/detail/ListingDetail";
import { loadSaveStateFn } from "@/presentation/bookmark";
import { loadListingDetailFn, orNotFound } from "@/presentation/detail";
import { buildHead } from "@/presentation/head";

/**
 * DT-01 掲載詳細. Needs no login. The loader waits for the listing, so a
 * listing that is not viewable answers CS-06 with HTTP 404; a navigation
 * shows the DetailHero-shaped skeleton meanwhile (CS-01). The viewer's
 * saves come along for the save toggle (CF-04).
 */
export const Route = createFileRoute("/_viewer/listings/$listingId")({
  staticData: {
    viewerHeader: { type: "detail", title: "気になるもの" },
    viewerTab: "discover",
  },
  loader: async ({ params }) => {
    const [detail, saveState] = await orNotFound(
      Promise.all([
        loadListingDetailFn({ data: { listingId: params.listingId } }),
        loadSaveStateFn({
          data: { targets: [{ kind: "listing", id: params.listingId }] },
        }),
      ]),
    );
    return { ...detail, saveState };
  },
  head: ({ match, loaderData, params }) => {
    const config = match.context?.config;
    if (!config || loaderData === undefined) {
      return { meta: [{ title: "掲載 — Lunt" }] };
    }
    const cover = loaderData.photos[0]?.photo?.src;
    const { meta, links } = buildHead(config, {
      title: `${loaderData.name}（${loaderData.place.name}） — Lunt`,
      ...(loaderData.description === null
        ? {}
        : { description: loaderData.description }),
      path: `/listings/${encodeURIComponent(params.listingId)}`,
      ...(cover === undefined ? {} : { ogImage: cover }),
    });
    return { meta, links };
  },
  pendingComponent: () => <DetailSkeleton label="掲載を読み込んでいます" />,
  notFoundComponent: () => <DetailUnavailable kind="listing" />,
  errorComponent: DetailLoadError,
  component: ListingPage,
});

function ListingPage() {
  const { saveState, ...data } = Route.useLoaderData();
  return (
    <ListingDetail key={data.listingId} data={data} saveState={saveState} />
  );
}
