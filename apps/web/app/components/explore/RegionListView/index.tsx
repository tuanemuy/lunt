"use client";

import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useTransition } from "react";
import { ListingCards } from "@/components/detail/ListingCard";
import { PlaceRow } from "@/components/detail/RelatedRows";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { Tab, Tabs } from "@/components/ui/Tabs";
import { TextLink } from "@/components/ui/TextButton";
import type { ListingCardItem, PlaceRowItem } from "@/presentation/detailView";
import type { ErrorState } from "@/presentation/errorState";
import {
  listRegionListingsFn,
  listRegionPlacesFn,
} from "@/presentation/explore";
import {
  REGION_LIST_PAGE_SIZE,
  type RegionListingsPage,
  type RegionListScreen,
  type RegionListTab,
  type RegionPlacesPage,
} from "@/presentation/exploreView";
import { CardPairSkeleton, ContentRowSkeleton } from "../ExploreSkeletons";
import { entryMemory } from "../entryMemory";
import { ListFooter } from "../ListFooter";
import { type PagedState, usePagedList } from "../usePagedList";

const placesMemory = entryMemory<PagedState<PlaceRowItem>>();
const listingsMemory = entryMemory<PagedState<ListingCardItem>>();

const MAP_PATH = "/map";

/**
 * A page that failed because the region stopped being viewable reloads
 * the route, which then shows CS-06.
 */
function useReloadWhenGone() {
  const router = useRouter();
  return useCallback(
    async (error: ErrorState) => {
      if (error.kind !== "notFound") return false;
      await router.invalidate({ sync: true });
      return true;
    },
    [router],
  );
}

function PlacesList({
  regionId,
  first,
}: {
  regionId: string;
  first: RegionPlacesPage;
}) {
  const onFailure = useReloadWhenGone();
  const list = usePagedList({
    name: `region-places|${regionId}`,
    first,
    pageSize: REGION_LIST_PAGE_SIZE,
    idOf: (item: PlaceRowItem) => item.placeId,
    fetchPage: (page) => listRegionPlacesFn({ data: { regionId, page } }),
    memory: placesMemory,
    onFailure,
  });
  if (list.items.length === 0) {
    return (
      <Feedback
        kind="empty"
        icon="region"
        title="まだお店がありません。"
        links={
          <TextLink to="/regions/$regionId" params={{ regionId }}>
            地域の詳細へ戻る
          </TextLink>
        }
      />
    );
  }
  return (
    <>
      <ul className="row-list">
        {list.items.map((item) => (
          <li key={item.placeId}>
            <PlaceRow item={item} />
          </li>
        ))}
      </ul>
      <ListFooter
        list={list}
        loadingText="続きのお店を読み込んでいます"
        loadingShape={<ContentRowSkeleton />}
        endText="お店はここまでです"
      />
    </>
  );
}

function ListingsList({
  regionId,
  first,
  onShowPlaces,
}: {
  regionId: string;
  first: RegionListingsPage;
  onShowPlaces: () => void;
}) {
  const onFailure = useReloadWhenGone();
  const list = usePagedList({
    name: `region-listings|${regionId}`,
    first,
    pageSize: REGION_LIST_PAGE_SIZE,
    idOf: (item: ListingCardItem) => item.listingId,
    fetchPage: (page) => listRegionListingsFn({ data: { regionId, page } }),
    memory: listingsMemory,
    onFailure,
  });
  if (list.items.length === 0) {
    return (
      <Feedback
        kind="empty"
        icon="region"
        title="まだ掲載がありません。"
        body={
          <>
            このまちのお店は、
            <br />
            店舗の一覧から見られます。
          </>
        }
        action={
          <Button variant="secondary" onClick={onShowPlaces}>
            店舗の一覧を見る
          </Button>
        }
        links={
          <TextLink to="/regions/$regionId" params={{ regionId }}>
            地域の詳細へ戻る
          </TextLink>
        }
      />
    );
  }
  return (
    <>
      <ListingCards items={list.items} />
      <ListFooter
        list={list}
        loadingText="続きの掲載を読み込んでいます"
        loadingShape={<CardPairSkeleton />}
        endText="掲載はここまでです"
      />
    </>
  );
}

/** CS-06: the region is not viewable; no name or photo. */
function RegionListUnavailable() {
  return (
    <>
      <h1 className="sr-only">地域内の一覧</h1>
      <Feedback
        kind="error"
        icon="region"
        title="このまちは表示できません。"
        body={
          <>
            公開が終わったか、
            <br />
            見られなくなっています。
          </>
        }
        action={
          <ButtonLink variant="secondary" to="/regions">
            ほかのまちを探す
          </ButtonLink>
        }
        links={
          <>
            <TextLink to="/">みつける</TextLink>
            <TextLink to={MAP_PATH}>マップで探す</TextLink>
          </>
        }
      />
    </>
  );
}

type Viewable = Exclude<RegionListScreen, { kind: "unavailable" }>;

function RegionLists({ screen }: { screen: Viewable }) {
  const navigate = useNavigate();
  const [switching, startSwitch] = useTransition();
  const { regionId } = screen;
  const select = (tab: RegionListTab) => {
    if (tab === screen.kind) return;
    startSwitch(async () => {
      await navigate({
        to: "/regions/$regionId/places",
        params: { regionId },
        search: { tab },
        replace: true,
        resetScroll: false,
      });
    });
  };
  return (
    <>
      <h1 className="region-list__title">{screen.name}</h1>
      <Tabs label="一覧" className="region-list__tabs">
        <Tab
          selected={screen.kind === "listings"}
          onClick={() => select("listings")}
        >
          見つかる
        </Tab>
        <Tab
          selected={screen.kind === "places"}
          onClick={() => select("places")}
        >
          店舗
        </Tab>
      </Tabs>
      {switching ? (
        <div className="loading" role="status">
          <p className="loading__text">一覧を読み込んでいます</p>
          <ContentRowSkeleton />
          <ContentRowSkeleton />
        </div>
      ) : screen.kind === "places" ? (
        <PlacesList regionId={regionId} first={screen.first} />
      ) : (
        <ListingsList
          regionId={regionId}
          first={screen.first}
          onShowPlaces={() => select("places")}
        />
      )}
    </>
  );
}

/**
 * VW-06 地域内の一覧 (`spec/pages/browse.md`): one region's places (newest
 * affiliation first) or its places' listings (newest first), switched by
 * the tabs, each naming this region and loading more as the end comes
 * into view (CF-05). Discovery scene; no browse condition applies. A
 * region that stopped being viewable is CS-06; a region without viewable
 * listings is CS-09 on the listing side.
 */
export function RegionListView({ screen }: { screen: RegionListScreen }) {
  return screen.kind === "unavailable" ? (
    <RegionListUnavailable />
  ) : (
    <RegionLists key={`${screen.regionId}|${screen.kind}`} screen={screen} />
  );
}
