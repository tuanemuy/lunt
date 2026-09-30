import { createFileRoute } from "@tanstack/react-router";
import {
  DetailLoadError,
  DetailUnavailable,
} from "@/components/detail/DetailFeedback";
import { DetailSkeleton } from "@/components/detail/DetailSkeleton";
import { PlaceDetail } from "@/components/detail/PlaceDetail";
import { loadSaveStateOrNull } from "@/presentation/bookmark";
import { loadPlaceDetailFn, orNotFound } from "@/presentation/detail";
import { buildHead } from "@/presentation/head";
import { loadMapStyleOrDefault } from "@/presentation/mapStyle";

/**
 * DT-02 店舗詳細. Needs no login; a signed-in steward of the place is
 * offered its management. A suspended or missing place answers CS-06 with
 * HTTP 404. The viewer's saves come along for the save toggle (CF-04) and
 * the map style for the access map; neither fails the detail (without
 * them: no toggle, the default style). The header names the place
 * (`viewerTitle`); CS-06 / CS-01 / CS-02 keep the fixed お店.
 */
export const Route = createFileRoute("/_viewer/places/$placeId")({
  staticData: {
    viewerHeader: { type: "detail", title: "お店" },
    viewerTab: "discover",
  },
  loader: async ({ params }) => {
    const [page, saveState, { styleUrl }] = await orNotFound(
      Promise.all([
        loadPlaceDetailFn({ data: { placeId: params.placeId } }),
        loadSaveStateOrNull([{ kind: "place", id: params.placeId }]),
        loadMapStyleOrDefault(),
      ]),
    );
    return { ...page, saveState, styleUrl, viewerTitle: page.place.name };
  },
  head: ({ match, loaderData, params }) => {
    const config = match.context?.config;
    // A re-read that found the target gone (CS-06) keeps the old data.
    if (!config || loaderData === undefined || match.status === "notFound") {
      return { meta: [{ title: "お店 — Lunt" }] };
    }
    const { place } = loaderData;
    const cover = place.photos[0]?.photo?.src;
    const { meta, links } = buildHead(config, {
      title: `${place.name} — Lunt`,
      ...(place.description === null ? {} : { description: place.description }),
      path: `/places/${encodeURIComponent(params.placeId)}`,
      ...(cover === undefined ? {} : { ogImage: cover }),
    });
    return { meta, links };
  },
  pendingComponent: () => <DetailSkeleton label="お店を読み込んでいます" />,
  notFoundComponent: () => <DetailUnavailable kind="place" />,
  errorComponent: DetailLoadError,
  component: PlacePage,
});

function PlacePage() {
  const {
    saveState,
    styleUrl,
    viewerTitle: _,
    ...page
  } = Route.useLoaderData();
  return <PlaceDetail page={page} saveState={saveState} styleUrl={styleUrl} />;
}
