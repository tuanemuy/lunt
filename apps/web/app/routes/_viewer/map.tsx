import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ExploreLoadError } from "@/components/explore/ExploreLoadError";
import { MapBoard } from "@/components/mapScreen/MapBoard";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildHead } from "@/presentation/head";
import { loadMapScreenFn, mapScreenSchema } from "@/presentation/map";
import { loadMapStyleFn } from "@/presentation/mapStyle";

/**
 * VW-04 マップ. Needs no login. `?area=` / `?cat=` carry the conditions
 * (`presentation/browseSearch.ts`, shared with VW-01 and VW-05) and
 * `?region=` the region DT-03 opens it with, selected. The loader reads
 * the first range and the CF-03 chips; the island reads the map's cells
 * for each settled range.
 */
export const Route = createFileRoute("/_viewer/map")({
  validateSearch: mapScreenSchema,
  loaderDeps: ({ search }) => ({
    area: search.area,
    cat: search.cat,
    region: search.region,
  }),
  loader: async ({ deps }) => {
    const [{ styleUrl }, screen] = await Promise.all([
      loadMapStyleFn(),
      loadMapScreenFn({ data: deps }),
    ]);
    return { styleUrl, ...screen };
  },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return { meta: [{ title: "マップ — Lunt" }] };
    const { meta, links } = buildHead(config, {
      title: "マップ — Lunt",
      path: "/map",
    });
    return { meta, links };
  },
  pendingComponent: MapPending,
  component: MapPage,
  errorComponent: MapError,
});

function MapFrame({ children }: { children: ReactNode }) {
  return (
    <div className="container map-page">
      <h1 className="sr-only">マップ</h1>
      {children}
    </div>
  );
}

function MapPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return (
    <MapFrame>
      <MapBoard
        key={data.regionId ?? "none"}
        styleUrl={data.styleUrl}
        search={{ area: search.area, cat: search.cat }}
        conditions={data.conditions}
        extent={data.extent}
        regionId={data.regionId}
        regionGone={data.regionGone}
      />
    </MapFrame>
  );
}

/** CS-01 while the first range is read. */
function MapPending() {
  return (
    <MapFrame>
      <div className="loading" role="status">
        <p className="loading__text">地図を読み込んでいます</p>
        <Skeleton className="map-page__skeleton" />
      </div>
    </MapFrame>
  );
}

/** CS-02: the first range could not be read; other ways to explore. */
function MapError() {
  return (
    <MapFrame>
      <ExploreLoadError ways={["regions", "search", "saved"]} />
    </MapFrame>
  );
}
