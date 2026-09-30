"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { ConditionChips } from "@/components/browse/ConditionChips";
import {
  entryMemory,
  useHistoryEntryKey,
} from "@/components/explore/entryMemory";
import {
  CurrentLocationChip,
  LocationFeedback,
} from "@/components/map/CurrentLocation";
import { MapCanvas } from "@/components/map/MapCanvas";
import type {
  LngLat,
  MapPin,
  MapViewport,
  MapViewportChange,
} from "@/components/map/types";
import { useCurrentLocation } from "@/components/map/useCurrentLocation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { IconButtonLink } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
import { Tab, Tabs } from "@/components/ui/Tabs";
import { TextButton, TextLink } from "@/components/ui/TextButton";
import {
  type BrowseSearch,
  browseCriteriaOf,
  browseSearchKey,
  browseSearchOf,
  withoutArea,
  withoutCategory,
} from "@/presentation/browseSearch";
import type { ConditionItem } from "@/presentation/exploreView";
import { findMapExtentFn, readMapCellsFn } from "@/presentation/map";
import {
  gridOfSize,
  type MapExtent,
  type MapRange,
  type MapRead,
} from "@/presentation/mapView";
import { PlaceOverview, RegionOverview, SpotList } from "../MapOverview";
import { MapTargetList } from "../MapTargetList";
import {
  type MapSelection,
  mapPins,
  NO_SELECTION,
  selectionOfPin,
} from "../pins";

type Grid = Readonly<{ columns: number; rows: number }>;

/** One read of the map: a range, its grid, and the region selected then. */
type ReadTarget = Readonly<{
  bounds: MapRange;
  grid: Grid;
  regionId: string | null;
}>;

type View = "map" | "list";

/** What the board had, kept per history entry for the way back from a detail. */
type BoardMemory = Readonly<{
  camera: Readonly<{ center: LngLat; zoom: number }> | null;
  searched: ReadTarget | null;
  read: MapRead | null;
  selection: MapSelection;
  view: View;
  extentKey: string;
}>;

const boardMemory = entryMemory<BoardMemory>();

const REGION_URL_CLEARED = { mapRegionUrlCleared: true } as const;

const regionIdOf = (selection: MapSelection): string | null =>
  selection.kind === "region" ? selection.regionId : null;

const extentKeyOf = (extent: MapExtent): string => JSON.stringify(extent);

const viewportOf = (range: MapRange): MapViewport => ({
  kind: "bounds",
  bounds: range,
});

type MapBoardProps = {
  /** The map style (`loadMapStyleFn`). */
  styleUrl: string;
  /** The URL's conditions (`presentation/browseSearch.ts`). */
  search: BrowseSearch;
  conditions: readonly ConditionItem[];
  /** The first range and what it rests on (a region's, the areas', or all). */
  extent: MapExtent;
  /** The region DT-03 opened the map with, selected from the start. */
  regionId: string | null;
  /**
   * The URL's region when it cannot be viewed: the map opens with no
   * region selected, as if none were named, and the URL drops it.
   */
  goneRegion: string | null;
};

/**
 * VW-04 マップ (`spec/pages/browse.md`, EXP-01, EXP-02): the places and
 * regions of the range and the conditions on the map, searched again once
 * a move settles (the previous result stays meanwhile), a chosen place's
 * or spot's or region's overview, and the same range as a list. Sharing
 * the position moves to the vicinity; a refusal shows CS-03.
 */
export function MapBoard({
  styleUrl,
  search,
  conditions,
  extent,
  regionId,
  goneRegion,
}: MapBoardProps) {
  const entry = useHistoryEntryKey();
  const navigate = useNavigate();
  const { area, cat } = search;
  const criteria = useMemo(() => browseCriteriaOf({ area, cat }), [area, cat]);
  const criteriaKey = browseSearchKey(search);
  const extentKey = extentKeyOf(extent);
  const initialRange = extent.range;

  const [remembered] = useState(() => boardMemory.recall(entry, "board"));
  const [viewport, setViewport] = useState<MapViewport>(() => {
    const camera = remembered?.camera ?? null;
    if (camera !== null) return { kind: "center", ...camera };
    return initialRange === null
      ? { kind: "bounds", bounds: JAPAN_FALLBACK }
      : viewportOf(initialRange);
  });
  const [read, setRead] = useState<MapRead | null>(remembered?.read ?? null);
  const [searched, setSearched] = useState<ReadTarget | null>(
    remembered?.searched ?? null,
  );
  const [selection, setSelection] = useState<MapSelection>(
    () =>
      remembered?.selection ??
      (regionId === null ? NO_SELECTION : { kind: "region", regionId }),
  );
  const [view, setView] = useState<View>(remembered?.view ?? "map");
  const [searching, setSearching] = useState(false);
  const [failedTarget, setFailedTarget] = useState<ReadTarget | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [locateFailed, setLocateFailed] = useState(false);
  const [everLocated, setEverLocated] = useState(false);
  const [navigating, startNavigate] = useTransition();

  const { location, start, stop } = useCurrentLocation({
    resumeWhenGranted: true,
  });
  const origin = location.status === "on" ? location.position : null;

  const camera = useRef(remembered?.camera ?? null);
  const appliedExtent = useRef(remembered?.extentKey ?? extentKey);
  const lastTarget = useRef<ReadTarget | null>(remembered?.searched ?? null);
  const selectedRegionId = useRef(regionIdOf(selection));
  selectedRegionId.current = regionIdOf(selection);
  const criteriaRef = useRef(criteria);
  criteriaRef.current = criteria;
  const movedByViewer = useRef(remembered !== undefined);
  const explicitStart = useRef(false);
  const readSeq = useRef(0);

  useEffect(() => {
    boardMemory.remember(entry, "board", {
      camera: camera.current,
      searched,
      read,
      selection,
      view,
      extentKey: appliedExtent.current,
    });
  });

  // The URL names the region DT-03 opened the map with only while it is
  // selected, so that reloading after 選択をやめる does not select it
  // again; a region that cannot be viewed is never selected, so it leaves
  // the URL at once. Masked, not navigated: the region stays in the route's
  // location, so the loader does not re-read and the map stays where it is.
  // The history state mark makes the router commit the masked entry (it
  // skips a location equal to the current one).
  const urlRegion = useRef(regionId ?? goneRegion);
  useEffect(() => {
    const opened = urlRegion.current;
    if (opened === null) return;
    if (selection.kind === "region" && selection.regionId === opened) return;
    urlRegion.current = null;
    void navigate({
      to: "/map",
      search: { area, cat, region: opened },
      state: (previous) => Object.assign({}, previous, REGION_URL_CLEARED),
      mask: { to: "/map", search: { area, cat }, unmaskOnReload: true },
      replace: true,
    });
  }, [selection, navigate, area, cat]);

  const runRead = useCallback((target: ReadTarget) => {
    const seq = ++readSeq.current;
    lastTarget.current = target;
    setSearching(true);
    readMapCellsFn({
      data: {
        bounds: target.bounds,
        grid: target.grid,
        criteria: criteriaRef.current,
        selectedRegionId: target.regionId,
      },
    })
      .then((result) => {
        if (seq !== readSeq.current) return;
        setRead(result);
        setSearched(target);
        setFailedTarget(null);
        setSearching(false);
        if (target.regionId !== null && result.selectedRegion === null) {
          setSelection((current) =>
            regionIdOf(current) === target.regionId ? NO_SELECTION : current,
          );
        }
      })
      .catch(() => {
        if (seq !== readSeq.current) return;
        setFailedTarget(target);
        setSearching(false);
      });
  }, []);

  // A new first range from the loader (the areas changed) moves the map;
  // the move's settled range is then searched.
  useEffect(() => {
    if (appliedExtent.current === extentKey) return;
    appliedExtent.current = extentKey;
    if (initialRange !== null) setViewport(viewportOf(initialRange));
  }, [extentKey, initialRange]);

  // Other conditions on the same range: search it again (再検索中).
  const appliedCriteria = useRef(criteriaKey);
  useEffect(() => {
    if (appliedCriteria.current === criteriaKey) return;
    appliedCriteria.current = criteriaKey;
    const target = lastTarget.current;
    if (target !== null) runRead(target);
  }, [criteriaKey, runRead]);

  // The shared position opens the vicinity: when the viewer asked for it,
  // or when the map opened on every place and has not been moved yet.
  const basis = extent.basis;
  const area$ = useRef(area);
  area$.current = area;
  useEffect(() => {
    if (location.status !== "on") return;
    setEverLocated(true);
    const explicit = explicitStart.current;
    explicitStart.current = false;
    if (!explicit && (basis !== "everywhere" || movedByViewer.current)) return;
    setLocateFailed(false);
    findMapExtentFn({
      data: {
        area: explicit ? undefined : area$.current,
        origin: location.position,
      },
    })
      .then((next) => {
        if (next.range !== null) setViewport(viewportOf(next.range));
      })
      .catch(() => setLocateFailed(true));
  }, [location, basis]);

  const startLocation = () => {
    explicitStart.current = true;
    start();
  };

  const onViewportChange = useCallback(
    (change: MapViewportChange) => {
      camera.current = { center: change.center, zoom: change.zoom };
      if (change.cause === "user") movedByViewer.current = true;
      if (change.size.width <= 0 || change.size.height <= 0) return;
      runRead({
        bounds: change.bounds,
        grid: gridOfSize(change.size),
        regionId: selectedRegionId.current,
      });
    },
    [runRead],
  );

  const choose = (next: MapSelection) => {
    const before = regionIdOf(selection);
    const after = regionIdOf(next);
    setSelection(next);
    const target = lastTarget.current;
    if (before !== after && target !== null) {
      runRead({ ...target, regionId: after });
    }
  };

  const onSelect = (pin: MapPin | null) => {
    if (pin === null) {
      if (selection.kind !== "none") choose(NO_SELECTION);
      return;
    }
    const next = selectionOfPin(pin, read?.cells ?? []);
    if (next !== null) choose(next);
  };

  const selectedRegion =
    selection.kind !== "region"
      ? null
      : ((read?.selectedRegion?.regionId === selection.regionId
          ? read.selectedRegion
          : null) ??
        read?.regions.find(
          (region) => region.regionId === selection.regionId,
        ) ??
        null);

  const pins = useMemo(
    () =>
      read === null
        ? []
        : mapPins(
            read.cells,
            read.regions,
            selection,
            selection.kind === "region" ? read.selectedRegion : null,
          ),
    [read, selection],
  );

  const go = (next: BrowseSearch) =>
    startNavigate(async () => {
      await navigate({ to: "/map", search: next });
    });
  const clearConditions = () =>
    go(browseSearchOf({ areas: [], categoryIds: [] }));
  const hasConditions = conditions.length > 0;
  const areaLabels = conditions
    .filter((item) => item.kind === "area")
    .map((item) => item.label);
  const filterSearch = { from: "map" as const, ...browseSearchOf(criteria) };

  const empty =
    read !== null &&
    !searching &&
    read.cells.length === 0 &&
    read.regions.length === 0 &&
    read.selectedRegion === null;

  const showLocationFeedback =
    location.status === "unavailable" ||
    (basis === "everywhere" && location.status === "off" && !everLocated);

  const listRange = searched?.bounds ?? initialRange ?? JAPAN_FALLBACK;

  const filterLink = (label: string) => (
    <ButtonLink variant="secondary" to="/filter" search={filterSearch}>
      {label}
    </ButtonLink>
  );

  return (
    <>
      <div className="map-page__controls">
        <div className="map-page__area-row">
          <Link className="area-selector" to="/filter" search={filterSearch}>
            <Icon name="place" />
            <span className="area-selector__label">
              <span className="sr-only">エリア: </span>
              {areaLabels.length === 0
                ? "すべてのエリア"
                : areaLabels.join("、")}
            </span>
            <Icon name="down" />
          </Link>
          <CurrentLocationChip
            location={location}
            onStart={startLocation}
            onStop={stop}
            activeLabel="現在地の周辺"
          />
        </div>
        <div className="map-page__switch">
          <Tabs label="表示">
            <Tab selected={view === "map"} onClick={() => setView("map")}>
              地図
            </Tab>
            <Tab selected={view === "list"} onClick={() => setView("list")}>
              一覧
            </Tab>
          </Tabs>
          <IconButtonLink
            to="/filter"
            search={filterSearch}
            icon="filter"
            label="絞り込み"
            neutral
          />
        </div>
      </div>

      <ConditionChips
        items={conditions}
        onRemove={(item) =>
          go(
            item.kind === "area"
              ? withoutArea(search, item.code)
              : withoutCategory(search, item.id),
          )
        }
        onClear={clearConditions}
        pending={navigating}
      />

      {showLocationFeedback ? (
        <LocationFeedback
          reason={location.status === "unavailable" ? location.reason : null}
          onRetry={startLocation}
          areaAction={filterLink("エリアを選ぶ")}
        />
      ) : null}

      {locateFailed ? (
        <Notice
          tone="error"
          title="現在地の周辺を表示できませんでした"
          actions={
            <TextButton onClick={startLocation}>もう一度試す</TextButton>
          }
        >
          通信状況を確認して、もう一度お試しください。
        </Notice>
      ) : null}

      <div className="map-layout" data-view={view}>
        <div className="map-layout__map">
          <MapCanvas
            styleUrl={styleUrl}
            label="地図"
            viewport={viewport}
            pins={pins}
            userLocation={origin}
            followUserLocation={false}
            status={searching ? "この範囲を探しています" : null}
            onViewportChange={onViewportChange}
            onSelect={onSelect}
            onUnavailable={() => setMapUnavailable(true)}
            unavailableActions={
              <>
                <TextButton onClick={() => setView("list")}>
                  一覧で見る
                </TextButton>
                <TextLink to="/regions">まちを探す</TextLink>
              </>
            }
          />
        </div>

        <div className="map-layout__panel">
          {view === "map" ? (
            <>
              <Selection
                selection={selection}
                selectedRegion={selectedRegion}
                onChoose={choose}
              />

              {failedTarget !== null ? (
                <Notice
                  tone="error"
                  title="この範囲を読み込めませんでした"
                  actions={
                    <>
                      <TextButton onClick={() => runRead(failedTarget)}>
                        もう一度読み込む
                      </TextButton>
                      <TextLink to="/regions">まちを探す</TextLink>
                      <TextLink to="/search">キーワードで探す</TextLink>
                    </>
                  }
                >
                  通信状況を確認して、もう一度お試しください。
                  {read === null ? "" : "前の結果を表示しています。"}
                </Notice>
              ) : null}

              {read === null && failedTarget === null && !mapUnavailable ? (
                <p className="loading__text" role="status">
                  地図を読み込んでいます
                </p>
              ) : null}

              {empty ? (
                <Feedback
                  kind="empty"
                  icon="map"
                  title="この範囲には見つかりませんでした。"
                  body={
                    <>
                      地図を動かすか、
                      <br />
                      条件を変えてみてください。
                    </>
                  }
                  action={filterLink("条件を変更する")}
                  links={
                    hasConditions ? (
                      <TextButton onClick={clearConditions}>
                        条件をすべて解除
                      </TextButton>
                    ) : undefined
                  }
                />
              ) : selection.kind === "none" && read !== null ? (
                <p className="map-panel__label">
                  ピンを選ぶと、お店やまちの概要を示します。
                </p>
              ) : null}

              {empty ? null : (
                <Button variant="secondary" onClick={() => setView("list")}>
                  表示中の場所を一覧で見る
                </Button>
              )}
            </>
          ) : (
            <MapTargetList
              bounds={listRange}
              criteria={criteria}
              origin={origin}
              empty={
                <Feedback
                  kind="empty"
                  icon="map"
                  title="この範囲には見つかりませんでした。"
                  body={
                    <>
                      地図へ戻って範囲を変えるか、
                      <br />
                      条件を変えてみてください。
                    </>
                  }
                  action={
                    <Button variant="secondary" onClick={() => setView("map")}>
                      地図へ戻って範囲を変える
                    </Button>
                  }
                  links={
                    <>
                      <TextLink to="/filter" search={filterSearch}>
                        条件を変更する
                      </TextLink>
                      {hasConditions ? (
                        <TextButton onClick={clearConditions}>
                          条件をすべて解除
                        </TextButton>
                      ) : null}
                    </>
                  }
                />
              }
            />
          )}
        </div>
      </div>
    </>
  );
}

/** The range shown when no first range could be told (never from the loader). */
const JAPAN_FALLBACK: MapRange = {
  southWest: { latitude: 20, longitude: 122 },
  northEast: { latitude: 46, longitude: 154 },
};

function Selection({
  selection,
  selectedRegion,
  onChoose,
}: {
  selection: MapSelection;
  selectedRegion: MapRead["selectedRegion"];
  onChoose: (next: MapSelection) => void;
}) {
  const close = () => onChoose(NO_SELECTION);
  switch (selection.kind) {
    case "none":
      return null;
    case "place":
      return <PlaceOverview place={selection.place} onClose={close} />;
    case "spot":
      return (
        <SpotList
          title={`同じ場所にあるお店 ${selection.places.length} 件`}
          places={selection.places}
          onChoose={(place) =>
            onChoose({ kind: "place", place, spotKey: selection.key })
          }
          onClose={close}
        />
      );
    case "region":
      return selectedRegion === null ? null : (
        <RegionOverview region={selectedRegion} onClose={close} />
      );
  }
}
