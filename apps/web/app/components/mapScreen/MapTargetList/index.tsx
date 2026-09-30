"use client";

import type { BrowseCriteriaInput } from "@repo/core/application/discovery/criteria";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type EntryMemory,
  entryMemory,
  useHistoryEntryKey,
} from "@/components/explore/entryMemory";
import { ListFooter } from "@/components/explore/ListFooter";
import {
  type PagedState,
  usePagedList,
} from "@/components/explore/usePagedList";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextButton } from "@/components/ui/TextButton";
import { listMapTargetsFn } from "@/presentation/map";
import {
  MAP_LIST_PAGE_SIZE,
  type MapPlaceItem,
  type MapRange,
  type MapRegionItem,
  type MapTargetPage,
  type MapTargets,
} from "@/presentation/mapView";
import { MapPlaceRow, MapRegionRow } from "../MapOverview";

type LatLng = Readonly<{ latitude: number; longitude: number }>;

const firstMemory = entryMemory<MapTargets>();
const placesMemory = entryMemory<PagedState<MapPlaceItem>>();
const regionsMemory = entryMemory<PagedState<MapRegionItem>>();

function RowsSkeleton() {
  return (
    <div className="map-rows__skeleton" aria-hidden="true">
      <Skeleton className="map-rows__skeleton-photo" />
      <Skeleton className="map-rows__skeleton-name" />
    </div>
  );
}

function TargetGroup<T>({
  id,
  title,
  name,
  first,
  idOf,
  fetchPage,
  render,
  endText,
  memory,
}: {
  id: string;
  title: string;
  name: string;
  first: MapTargetPage<T>;
  idOf: (item: T) => string;
  fetchPage: (page: number) => Promise<MapTargetPage<T>>;
  render: (item: T) => ReactNode;
  endText: string;
  memory: EntryMemory<PagedState<T>>;
}) {
  const list = usePagedList<T>({
    name,
    first,
    pageSize: MAP_LIST_PAGE_SIZE,
    idOf,
    fetchPage,
    memory,
  });
  return (
    <section className="list-group" aria-labelledby={id}>
      <h3 className="list-group__title" id={id}>
        {title}
        <span className="list-group__count">{list.count} 件</span>
      </h3>
      <ul className="map-rows">
        {list.items.map((item) => (
          <li key={idOf(item)}>{render(item)}</li>
        ))}
      </ul>
      <ListFooter
        list={list}
        loadingText="続きを読み込んでいます"
        loadingShape={<RowsSkeleton />}
        endText={endText}
      />
    </section>
  );
}

type MapTargetListProps = {
  /** The last searched range (「最後に再検索した範囲」). */
  bounds: MapRange;
  criteria: BrowseCriteriaInput;
  /** Nearest first with the viewer's position, newest first without. */
  origin: LatLng | null;
  /** CS-09 of the list: what the screen offers (back to the map, VW-02, CF-03). */
  empty: ReactNode;
};

const keyOf = (
  bounds: MapRange,
  criteria: BrowseCriteriaInput,
  origin: LatLng | null,
): string =>
  JSON.stringify([
    bounds,
    criteria,
    origin === null ? null : [origin.latitude, origin.longitude],
  ]);

type FirstState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "ready"; targets: MapTargets }>;

/**
 * VW-04's 一覧の表示 (EXP-02): the places and the regions of the last
 * searched range and the criteria, per kind, each read on as its end comes
 * into view (CF-05). Kept for the history entry, so returning from a
 * detail finds what was loaded.
 */
export function MapTargetList({
  bounds,
  criteria,
  origin,
  empty,
}: MapTargetListProps) {
  const entry = useHistoryEntryKey();
  const key = keyOf(bounds, criteria, origin);
  const [first, setFirst] = useState<FirstState>(() => {
    const remembered = firstMemory.recall(entry, key);
    return remembered === undefined
      ? { kind: "loading" }
      : { kind: "ready", targets: remembered };
  });
  const request = useRef(0);

  const load = useCallback(() => {
    const current = ++request.current;
    setFirst({ kind: "loading" });
    listMapTargetsFn({
      data: { bounds, criteria, origin, kinds: "all", page: 1 },
    })
      .then((targets) => {
        if (current !== request.current) return;
        firstMemory.remember(entry, key, targets);
        setFirst({ kind: "ready", targets });
      })
      .catch(() => {
        if (current === request.current) setFirst({ kind: "failed" });
      });
  }, [bounds, criteria, origin, entry, key]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the value identity of the query
  useEffect(() => {
    const remembered = firstMemory.recall(entry, key);
    if (remembered !== undefined) {
      setFirst({ kind: "ready", targets: remembered });
      return;
    }
    load();
  }, [key]);

  const fetchPlaces = useCallback(
    async (page: number): Promise<MapTargetPage<MapPlaceItem>> => {
      const { places } = await listMapTargetsFn({
        data: { bounds, criteria, origin, kinds: "places", page },
      });
      return places ?? { items: [], count: 0 };
    },
    [bounds, criteria, origin],
  );
  const fetchRegions = useCallback(
    async (page: number): Promise<MapTargetPage<MapRegionItem>> => {
      const { regions } = await listMapTargetsFn({
        data: { bounds, criteria, origin, kinds: "regions", page },
      });
      return regions ?? { items: [], count: 0 };
    },
    [bounds, criteria, origin],
  );

  if (first.kind === "loading") {
    return (
      <div className="loading" role="status">
        <p className="loading__text">この範囲のお店とまちを読み込んでいます</p>
        <RowsSkeleton />
        <RowsSkeleton />
      </div>
    );
  }
  if (first.kind === "failed") {
    return (
      <Notice
        tone="error"
        title="一覧を読み込めませんでした"
        actions={<TextButton onClick={load}>もう一度読み込む</TextButton>}
      >
        通信状況を確認して、もう一度お試しください。
      </Notice>
    );
  }
  const places = first.targets.places ?? { items: [], count: 0 };
  const regions = first.targets.regions ?? { items: [], count: 0 };
  if (places.count === 0 && regions.count === 0) return <>{empty}</>;
  return (
    <>
      <h2 className="section-title">この地図で見つかるもの</h2>
      {places.count === 0 ? null : (
        <TargetGroup
          key={`places|${key}`}
          id="map-list-places"
          title="お店"
          name={`places|${key}`}
          first={places}
          idOf={(place: MapPlaceItem) => place.placeId}
          fetchPage={fetchPlaces}
          render={(place) => <MapPlaceRow place={place} />}
          memory={placesMemory}
          endText="この範囲のお店はここまでです"
        />
      )}
      {regions.count === 0 ? null : (
        <TargetGroup
          key={`regions|${key}`}
          id="map-list-regions"
          title="まち"
          name={`regions|${key}`}
          first={regions}
          idOf={(region: MapRegionItem) => region.regionId}
          fetchPage={fetchRegions}
          render={(region) => <MapRegionRow region={region} />}
          memory={regionsMemory}
          endText="この範囲のまちはここまでです"
        />
      )}
    </>
  );
}
