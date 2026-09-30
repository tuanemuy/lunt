"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { SaveToggle } from "@/components/bookmark/SaveToggle";
import { ConditionChips } from "@/components/browse/ConditionChips";
import { ListingCardBody } from "@/components/detail/ListingCard";
import {
  entryMemory,
  useHistoryEntryKey,
} from "@/components/explore/entryMemory";
import {
  type PagedList,
  type PagedState,
  usePagedList,
} from "@/components/explore/usePagedList";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { Feedback } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { IconButtonLink } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
import { Photo } from "@/components/ui/Photo";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tab, Tabs } from "@/components/ui/Tabs";
import { TextButton, TextLink } from "@/components/ui/TextButton";
import {
  areaSelectionsOf,
  type BrowseSearch,
  browseSearchKey,
  browseSearchOf,
  withoutArea,
  withoutCategory,
} from "@/presentation/browseSearch";
import { readFeedPageFn } from "@/presentation/discover";
import {
  FEED_PAGE_SIZE,
  type FeedItem,
  type FeedListingItem,
  type FeedOccasionItem,
  type FeedRegionItem,
  type FeedScreen,
  feedItemKey,
} from "@/presentation/discoverView";
import type { ConditionItem } from "@/presentation/exploreView";
import { useDiscover } from "../DiscoverContext";
import { ExploreLinks } from "../ExploreLinks";
import { type FeedOrigin, originKey } from "../feedOrigin";
import { cardSaveState, feedSaves } from "../feedSaves";

/** The frames' photo box (EditorialFeature 348 × 193). */
const FEATURE_RATIO = 348 / 193;

const feedMemory = entryMemory<PagedState<FeedItem>>();

// VW-07 arrives with the explore screens; a plain path until the router knows it.
const EVENTS_PATH: string = "/events";

/** VW-01's URL for other conditions (a new history entry: 戻る returns to the previous ones). */
function useShowConditions() {
  const navigate = useNavigate();
  return (search: BrowseSearch) => navigate({ to: "/", search });
}

function areaLabel(conditions: readonly ConditionItem[]): string {
  const areas = conditions.filter((item) => item.kind === "area");
  const [first] = areas;
  if (first === undefined) return "すべてのエリア";
  return areas.length === 1
    ? first.label
    : `${first.label} ほか${areas.length - 1}件`;
}

/** 「現在地を使う」 / 「現在地の近くから」: starts (the browser asks) or stops using the position. */
function LocationChip() {
  const { location, origin, start, stop } = useDiscover();
  if (location.status === "locating") {
    return (
      <Chip selected={false} aria-busy disabled>
        現在地を確かめています
      </Chip>
    );
  }
  return origin === null ? (
    <Chip selected={false} onClick={start}>
      現在地を使う
    </Chip>
  ) : (
    <Chip selected onClick={stop}>
      現在地の近くから
    </Chip>
  );
}

const UNAVAILABLE_TEXT = {
  denied: "位置情報の利用が許可されていません。新しい掲載から表示しています。",
  unsupported:
    "この端末では位置情報を利用できません。新しい掲載から表示しています。",
  failed: "現在地を取得できませんでした。新しい掲載から表示しています。",
} as const;

/** CS-03: the order stays newest first; the viewer may retry or choose an area. */
function LocationNotice({ search }: { search: BrowseSearch }) {
  const { location, start } = useDiscover();
  if (location.status !== "unavailable") return null;
  return (
    <Notice
      title="現在地を利用できませんでした"
      actions={
        <>
          <TextButton onClick={start}>もう一度試す</TextButton>
          <TextLink to="/filter" search={{ from: "discover", ...search }}>
            エリアを選ぶ
          </TextLink>
        </>
      }
    >
      {UNAVAILABLE_TEXT[location.reason]}
    </Notice>
  );
}

function Controls({
  screen,
  search,
}: {
  screen: FeedScreen;
  search: BrowseSearch;
}) {
  const show = useShowConditions();
  const filterSearch = { from: "discover" as const, ...search };
  const selectGenre = (categoryId: string | null) =>
    show(
      browseSearchOf({
        areas: areaSelectionsOf(search),
        categoryIds: categoryId === null ? [] : [categoryId],
      }),
    );
  const [only] = screen.categoryIds;
  const genre = screen.categoryIds.length === 1 ? only : null;
  return (
    <div className="discover__controls">
      <div className="discover__area-row">
        <Link className="area-selector" to="/filter" search={filterSearch}>
          <Icon name="place" />
          <span className="area-selector__label">
            <span className="sr-only">エリア: </span>
            {areaLabel(screen.conditions)}
          </span>
          <Icon name="down" />
        </Link>
        <LocationChip />
      </div>
      {screen.categories.length === 0 ? null : (
        <div
          className={cx(
            "discover__genres",
            screen.filtered && "discover__genres--filtered",
          )}
        >
          <Tabs label="ジャンル">
            <Tab
              selected={screen.categoryIds.length === 0}
              onClick={() => selectGenre(null)}
            >
              すべて
            </Tab>
            {screen.categories.map((category) => (
              <Tab
                key={category.id}
                selected={genre === category.id}
                onClick={() => selectGenre(category.id)}
              >
                {category.name}
              </Tab>
            ))}
          </Tabs>
          {screen.filtered ? null : (
            <IconButtonLink
              to="/filter"
              search={filterSearch}
              icon="filter"
              label="絞り込み"
              neutral
            />
          )}
        </div>
      )}
    </div>
  );
}

/** CF-03 with the way to VW-02 at its end. */
function Conditions({
  screen,
  search,
}: {
  screen: FeedScreen;
  search: BrowseSearch;
}) {
  const show = useShowConditions();
  if (!screen.filtered) return null;
  return (
    <div className="discover__conditions">
      <ConditionChips
        items={screen.conditions}
        onRemove={(item) =>
          show(
            item.kind === "area"
              ? withoutArea(search, item.code)
              : withoutCategory(search, item.id),
          )
        }
        onClear={() => show({})}
      />
      <IconButtonLink
        to="/filter"
        search={{ from: "discover", ...search }}
        icon="filter"
        label="絞り込み"
        neutral
        className="conditions__filter"
      />
    </div>
  );
}

function RegionFrame({ item }: { item: FeedRegionItem }) {
  const { region } = item;
  return (
    <Link
      className="feature"
      to="/regions/$regionId"
      params={{ regionId: region.regionId }}
    >
      <div className="feature__head">
        <p className="feature__location">{region.area}</p>
        {region.tagline === null ? null : (
          <p className="feature__catch">{region.tagline}</p>
        )}
      </div>
      <Photo
        photo={region.photo}
        alt=""
        ratio={FEATURE_RATIO}
        className="feature__photo"
      />
      <div className="feature__foot">
        <h2 className="feature__name">{region.name}</h2>
      </div>
    </Link>
  );
}

function OccasionFrame({ item }: { item: FeedOccasionItem }) {
  const { occasion } = item;
  return (
    <Link
      className="feature"
      to="/events/$occasionId"
      params={{ occasionId: occasion.occasionId }}
    >
      <div className="feature__head">
        <p className="feature__location">
          {occasion.venue}・{occasion.periodText}
        </p>
        <p className="feature__kicker">イベント・{occasion.holdingText}</p>
        {occasion.tagline === null ? null : (
          <p className="feature__catch">{occasion.tagline}</p>
        )}
      </div>
      <Photo
        photo={occasion.photo}
        alt=""
        ratio={FEATURE_RATIO}
        className="feature__photo"
      />
      <div className="feature__foot">
        <h2 className="feature__name">{occasion.name}</h2>
      </div>
    </Link>
  );
}

function FeedCard({
  item,
  signedIn,
}: {
  item: FeedListingItem;
  signedIn: boolean;
}) {
  const { saves } = useDiscover();
  const { card } = item;
  return (
    <article className="card">
      <Link
        className="card__link"
        to="/listings/$listingId"
        params={{ listingId: card.listingId }}
      >
        <ListingCardBody item={card} />
      </Link>
      <SaveToggle
        target={{ kind: "listing", id: card.listingId }}
        name={card.name}
        saveState={cardSaveState(signedIn, card.listingId, item.saved, saves)}
      />
    </article>
  );
}

type Block =
  | Readonly<{ kind: "cards"; key: string; items: readonly FeedListingItem[] }>
  | FeedRegionItem
  | FeedOccasionItem;

/** Runs of listings become one card grid; each frame stands between them. */
function blocksOf(items: readonly FeedItem[]): readonly Block[] {
  const blocks: Block[] = [];
  let run: FeedListingItem[] = [];
  const flush = () => {
    const [first] = run;
    if (first !== undefined) {
      blocks.push({ kind: "cards", key: feedItemKey(first), items: run });
    }
    run = [];
  };
  for (const item of items) {
    if (item.kind === "listing") {
      run.push(item);
    } else {
      flush();
      blocks.push(item);
    }
  }
  flush();
  return blocks;
}

function FeedBlock({ block, signedIn }: { block: Block; signedIn: boolean }) {
  switch (block.kind) {
    case "cards":
      return (
        <div className="card-grid">
          {block.items.map((item) => (
            <FeedCard
              key={item.card.listingId}
              item={item}
              signedIn={signedIn}
            />
          ))}
        </div>
      );
    case "region":
      return <RegionFrame item={block} />;
    case "occasion":
      return <OccasionFrame item={block} />;
  }
}

const blockKey = (block: Block): string =>
  block.kind === "cards" ? `cards:${block.key}` : feedItemKey(block);

function FeedItems({
  items,
  signedIn,
}: {
  items: readonly FeedItem[];
  signedIn: boolean;
}) {
  return blocksOf(items).map((block) => (
    <FeedBlock key={blockKey(block)} block={block} signedIn={signedIn} />
  ));
}

/**
 * CF-05 at the feed's end: loads as it comes into view, CS-01 / CS-02 keep
 * what was read. At the feed's depth (`capped`) the end points to the other
 * ways on: narrower conditions (VW-02), a keyword (VW-03) or the map (VW-04).
 */
function FeedFooter({
  list,
  capped,
  search,
}: {
  list: PagedList<FeedItem>;
  capped: boolean;
  search: BrowseSearch;
}) {
  if (list.failed) {
    return (
      <Notice
        tone="error"
        title="続きを読み込めませんでした"
        actions={
          <>
            <TextButton onClick={list.loadMore}>もう一度読み込む</TextButton>
            <ExploreLinks
              to={["search", "map", "regions", "events", "articles", "saved"]}
            />
          </>
        }
      >
        通信状況を確認して、もう一度お試しください。読み込んだ分はそのまま見られます。
      </Notice>
    );
  }
  if (list.loading) {
    return (
      <div className="loading" role="status">
        <p className="loading__text">続きを読み込んでいます</p>
        <div className="card-grid">
          <Skeleton className="discover__skeleton--card" />
          <Skeleton className="discover__skeleton--card" />
        </div>
      </div>
    );
  }
  if (list.hasMore) {
    return (
      <div ref={list.sentinel}>
        <Button variant="secondary" fit onClick={list.loadMore}>
          続きを読み込む
        </Button>
      </div>
    );
  }
  if (capped) {
    return (
      <Notice
        title="フィードはここまでです"
        actions={
          <>
            <TextLink to="/filter" search={{ from: "discover", ...search }}>
              条件を絞り込む
            </TextLink>
            <ExploreLinks to={["search", "map"]} />
          </>
        }
      >
        フィードで見られるのは先頭から約2,000件までです。この先は、条件を絞り込むか、キーワードやマップで探してください。
      </Notice>
    );
  }
  return <p className="list-end">フィードはここまでです</p>;
}

/** CS-09 without conditions: nothing to introduce yet; other ways to explore. */
function EmptyFeed() {
  return (
    <Feedback
      kind="empty"
      title="まだ紹介できる掲載がありません。"
      body={
        <>
          ほかの探し方から、
          <br />
          お店や地域を見つけてみてください。
        </>
      }
      action={
        <ButtonLink to="/search" variant="secondary">
          キーワードで探す
        </ButtonLink>
      }
      links={<ExploreLinks to={["map", "regions", "events", "articles"]} />}
    />
  );
}

/** CS-09 with conditions: nothing matches; change or clear them (no frames either). */
function EmptyFiltered({ search }: { search: BrowseSearch }) {
  const show = useShowConditions();
  return (
    <Feedback
      kind="empty"
      title="条件に合う掲載がありません。"
      body={
        <>
          条件を変えるか、
          <br />
          解除してもう一度お試しください。
        </>
      }
      action={
        <ButtonLink
          to="/filter"
          search={{ from: "discover", ...search }}
          variant="secondary"
        >
          条件を変更
        </ButtonLink>
      }
      links={<TextButton onClick={() => show({})}>条件をすべて解除</TextButton>}
    />
  );
}

/**
 * VW-01 みつける: the conditions' controls (area, position, ジャンル, CF-03),
 * then the feed — listing cards in two columns (CF-04 on each) with the
 * region and occasion frames `readFeed` places between them — loading
 * more as its end comes into view (CF-05). What was loaded is remembered
 * for the history entry, so returning from a detail finds it again.
 */
export function DiscoverFeed({
  screen,
  search,
  origin,
}: {
  screen: FeedScreen;
  search: BrowseSearch;
  origin: FeedOrigin | null;
}) {
  const entry = useHistoryEntryKey();
  const fetchPage = useCallback(
    (page: number) => readFeedPageFn({ data: { search, origin, page } }),
    [search, origin],
  );
  const list = usePagedList<FeedItem>({
    name: `feed:${browseSearchKey(search)}|${originKey(origin)}`,
    first: screen.first,
    pageSize: FEED_PAGE_SIZE,
    idOf: feedItemKey,
    fetchPage,
    memory: feedMemory,
  });
  const shown = list.items
    .flatMap((item) => (item.kind === "listing" ? [item.card.listingId] : []))
    .join(",");
  useEffect(() => {
    feedSaves.record(entry, shown === "" ? [] : shown.split(","));
  }, [entry, shown]);

  const empty = list.count === 0;
  return (
    <div
      className={cx(
        "container discover",
        screen.filtered && "discover--spaced",
      )}
    >
      <h1 className="sr-only">みつける</h1>
      <Controls screen={screen} search={search} />
      <Conditions screen={screen} search={search} />
      <LocationNotice search={search} />
      {empty ? (
        screen.filtered ? (
          <EmptyFiltered search={search} />
        ) : (
          <EmptyFeed />
        )
      ) : (
        <>
          <FeedItems items={list.items} signedIn={screen.signedIn} />
          <FeedFooter
            list={list}
            capped={screen.first.capped}
            search={search}
          />
          {/* browse.md VW-01 has the VW-07 entry whether filtered or not
              (the design's filtered state leaves it out). */}
          {screen.filtered ? (
            <ButtonLink
              to="/filter"
              search={{ from: "discover", ...search }}
              variant="secondary"
              fit
            >
              条件を変更
            </ButtonLink>
          ) : null}
          <ButtonLink to={EVENTS_PATH} variant="secondary" fit>
            イベントの一覧を見る
          </ButtonLink>
        </>
      )}
    </div>
  );
}
