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
import { CurrentLocationChip } from "@/components/map/CurrentLocation";
import type { LngLat } from "@/components/map/types";
import {
  type LocationUnavailableReason,
  useCurrentLocation,
} from "@/components/map/useCurrentLocation";
import { ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { Notice } from "@/components/ui/Notice";
import { Photo } from "@/components/ui/Photo";
import { TextButton, TextLink } from "@/components/ui/TextButton";
import {
  type BrowseSearch,
  browseCriteriaOf,
  browseSearchKey,
  browseSearchOf,
  withoutArea,
  withoutAreas,
  withoutCategory,
} from "@/presentation/browseSearch";
import type { RegionRowItem } from "@/presentation/detailView";
import { findRegionsFn } from "@/presentation/explore";
import {
  type ConditionItem,
  REGIONS_PAGE_SIZE,
  type RegionsFocus,
  type RegionsPage,
} from "@/presentation/exploreView";
import { RegionFeatureSkeleton } from "../ExploreSkeletons";
import { entryMemory, useHistoryEntryKey } from "../entryMemory";
import { ListFooter } from "../ListFooter";
import { type PagedState, usePagedList } from "../usePagedList";

const FEATURE_RATIO = 348 / 193;

// VW-04 arrives with its own stage; the router only type-checks paths it knows.
const MAP_PATH: string = "/map";

/** The page shown, and the position it was read for (`null`: none). */
type Shown = Readonly<{ origin: LngLat | null; page: RegionsPage }>;

const shownMemory = entryMemory<Shown>();
const pagesMemory = entryMemory<PagedState<RegionRowItem>>();

const originKey = (origin: LngLat | null): string =>
  origin === null ? "none" : `${origin.latitude},${origin.longitude}`;

/** EditorialFeature of a region: 所在地, tagline, photo, name → DT-03. */
function RegionFeature({ item }: { item: RegionRowItem }) {
  return (
    <Link
      className="feature"
      to="/regions/$regionId"
      params={{ regionId: item.regionId }}
    >
      <div className="feature__head">
        <p className="feature__location">{item.area}</p>
        {item.tagline === null ? null : (
          <p className="feature__catch">{item.tagline}</p>
        )}
      </div>
      <Photo
        photo={item.photo}
        alt=""
        ratio={FEATURE_RATIO}
        className="feature__photo"
      />
      <div className="feature__foot">
        <h2 className="feature__name">{item.name}</h2>
      </div>
    </Link>
  );
}

function RegionFeatureList({
  name,
  first,
  fetchPage,
  busy,
}: {
  name: string;
  first: RegionsPage;
  fetchPage: (page: number) => Promise<RegionsPage>;
  busy: boolean;
}) {
  const list = usePagedList({
    name,
    first,
    pageSize: REGIONS_PAGE_SIZE,
    idOf: (item: RegionRowItem) => item.regionId,
    fetchPage,
    memory: pagesMemory,
  });
  return (
    <>
      <div className="regions__list" aria-busy={busy}>
        {list.items.map((item) => (
          <RegionFeature key={item.regionId} item={item} />
        ))}
      </div>
      <div className="regions__actions">
        <ListFooter
          list={list}
          loadingText="続きの地域を読み込んでいます"
          loadingShape={<RegionFeatureSkeleton />}
          endText="地域はここまでです"
        />
      </div>
    </>
  );
}

const SCOPE_TEXT: Readonly<Record<RegionsFocus, string>> = {
  areas: "選んだエリアにある地域",
  vicinity: "現在地の周辺にある地域（近い順）",
  everywhere: "新しい地域から表示しています",
};

const UNAVAILABLE_TEXT: Readonly<Record<LocationUnavailableReason, string>> = {
  denied: "位置情報の利用が許可されていません。",
  unsupported: "この端末では位置情報を利用できません。",
  failed: "現在地を取得できませんでした。",
};

type RegionsBoardProps = {
  /** The conditions in the URL (only the areas apply here). */
  search: BrowseSearch;
  /** The first page read without the viewer's position. */
  first: RegionsPage;
  conditions: readonly ConditionItem[];
};

/**
 * VW-05 まち (`spec/pages/browse.md`): the regions of the chosen areas
 * (選択エリアの地域), else of the viewer's vicinity once the position is
 * shared (周辺の地域), else all of them newest first (すべての地域) — as
 * EditorialFeature frames, loading more as the end comes into view
 * (CF-05). CF-03 shows the chosen areas and categories; only the areas
 * apply. Sharing the position reads the list again nearest first; a
 * refusal or failure keeps the list and says so (CS-03).
 */
export function RegionsBoard({ search, first, conditions }: RegionsBoardProps) {
  const searchKey = browseSearchKey(search);
  const { area, cat } = search;
  const criteria = useMemo(() => browseCriteriaOf({ area, cat }), [area, cat]);
  const hasArea = criteria.areas.length > 0;
  const entry = useHistoryEntryKey();
  const navigate = useNavigate();
  const { location, start, stop } = useCurrentLocation({
    resumeWhenGranted: true,
  });
  const [shown, setShown] = useState<Shown>(
    () => shownMemory.recall(entry, searchKey) ?? { origin: null, page: first },
  );
  const [basis, setBasis] = useState(first);
  if (basis !== first) {
    setBasis(first);
    // The router's re-read after a stale entry was shown; a list read for
    // the position is the island's own.
    if (shown.origin === null) setShown({ origin: null, page: first });
  }
  const shownOrigin = useRef(shown.origin);
  const [switchFailed, setSwitchFailed] = useState(false);
  const [switching, startSwitch] = useTransition();
  const [navigating, startNavigate] = useTransition();
  const requesting = useRef(false);

  const show = useCallback(
    (next: Shown) => {
      shownOrigin.current = next.origin;
      setShown(next);
      shownMemory.remember(entry, searchKey, next);
    },
    [entry, searchKey],
  );

  const readFor = useCallback(
    (origin: LngLat) => {
      requesting.current = true;
      startSwitch(async () => {
        try {
          const page = await findRegionsFn({
            data: { criteria, origin, page: 1 },
          });
          show({ origin, page });
          setSwitchFailed(false);
        } catch {
          setSwitchFailed(true);
        } finally {
          requesting.current = false;
        }
      });
    },
    [criteria, show],
  );

  // The list follows the position: read nearest first once it arrives, back
  // to the list without it when the viewer stops or it becomes unavailable.
  // A list already read for a position (or restored on coming back, before
  // the position resumes) stays.
  const lastStatus = useRef(location.status);
  useEffect(() => {
    const before = lastStatus.current;
    lastStatus.current = location.status;
    if (location.status === "on") {
      if (shownOrigin.current !== null || requesting.current) return;
      readFor(location.position);
      return;
    }
    const stopped =
      location.status === "unavailable" ||
      (location.status === "off" && before !== "off");
    if (stopped && shownOrigin.current !== null) {
      show({ origin: null, page: first });
    }
  }, [location, readFor, show, first]);

  const go = (next: BrowseSearch) =>
    startNavigate(async () => {
      await navigate({ to: "/regions", search: next });
    });

  const removeCondition = (item: ConditionItem) =>
    go(
      item.kind === "area"
        ? withoutArea(search, item.code)
        : withoutCategory(search, item.id),
    );

  const busy = switching || navigating || location.status === "locating";
  const { page, origin } = shown;
  const scope =
    page.focus === "areas" && origin !== null
      ? "選んだエリアにある地域（近い順）"
      : SCOPE_TEXT[page.focus];

  return (
    <>
      <ConditionChips
        items={conditions}
        onRemove={removeCondition}
        onClear={() => go(browseSearchOf({ areas: [], categoryIds: [] }))}
        pending={navigating}
      />

      <div className="regions__scope">
        <p className="regions__scope-text">{scope}</p>
        <CurrentLocationChip
          location={location}
          onStart={start}
          onStop={stop}
          activeLabel="現在地の近くから"
        />
      </div>

      {location.status === "unavailable" ? (
        <Notice
          title="現在地を利用できませんでした"
          actions={
            <>
              <TextButton onClick={start}>もう一度試す</TextButton>
              <TextLink to="/filter" search={{ from: "regions", ...search }}>
                エリアを選ぶ
              </TextLink>
            </>
          }
        >
          {UNAVAILABLE_TEXT[location.reason]}
          {hasArea
            ? "選んだエリアの地域を表示しています。"
            : "すべての地域を表示しています。"}
        </Notice>
      ) : null}

      {switchFailed ? (
        <Notice
          tone="error"
          title="現在地の周辺の地域を読み込めませんでした"
          actions={
            location.status === "on" ? (
              <TextButton onClick={() => readFor(location.position)}>
                もう一度読み込む
              </TextButton>
            ) : undefined
          }
        >
          通信状況を確認して、もう一度お試しください。
        </Notice>
      ) : null}

      {busy ? (
        <p className="loading__text" role="status">
          {location.status === "locating"
            ? "現在地を取得しています"
            : "地域を読み込んでいます"}
        </p>
      ) : null}

      {page.items.length === 0 ? (
        <RegionsEmpty
          focus={page.focus}
          search={search}
          onClearAreas={() => go(withoutAreas(search))}
        />
      ) : (
        <RegionFeatureList
          key={originKey(origin)}
          name={`regions|${searchKey}|${originKey(origin)}`}
          first={page}
          fetchPage={(next) =>
            findRegionsFn({ data: { criteria, origin, page: next } })
          }
          busy={busy}
        />
      )}
    </>
  );
}

/** CS-09 地域がない: change or clear the areas, or look on the map. */
function RegionsEmpty({
  focus,
  search,
  onClearAreas,
}: {
  focus: RegionsFocus;
  search: BrowseSearch;
  onClearAreas: () => void;
}) {
  return (
    <Feedback
      kind="empty"
      icon="region"
      title={
        focus === "everywhere"
          ? "まだ地域がありません。"
          : "このあたりには、まだ地域がありません。"
      }
      body={
        <>
          エリアを変えるか、
          <br />
          地図で近くを探してみてください。
        </>
      }
      action={
        <ButtonLink
          to="/filter"
          search={{ from: "regions", ...search }}
          variant="secondary"
        >
          {focus === "areas" ? "エリアを変更する" : "エリアを選ぶ"}
        </ButtonLink>
      }
      links={
        <>
          {focus === "areas" ? (
            <TextButton onClick={onClearAreas}>エリアを解除</TextButton>
          ) : null}
          <TextLink to={MAP_PATH}>マップで探す</TextLink>
        </>
      }
    />
  );
}
