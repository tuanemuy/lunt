// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { browseAreaHierarchy } from "@repo/core/application/area/browseAreaHierarchy";
import { labelAreaSelections } from "@repo/core/application/area/labelAreaSelections";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import type { BrowseCriteriaInput } from "@repo/core/application/discovery/criteria";
import { readFeed } from "@repo/core/application/discovery/readFeed";
import {
  type SearchKind,
  searchByKeyword,
} from "@repo/core/application/discovery/searchByKeyword";
import type { PointInput } from "@repo/core/application/discovery/views";
import { listCategories } from "@repo/core/application/listing/listCategories";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { resolveActor } from "./actor";
import { loadSaveState } from "./bookmarkData";
import { areaCodeOf } from "./browseSearch";
import {
  FEED_PAGE_SIZE,
  type FeedPage,
  type FeedScreen,
  type FilterScreen,
  feedListingIds,
  SEARCH_KIND_ORDER,
  SEARCH_PAGE_SIZE,
  type SearchGroup,
  type SearchGroupPage,
  type SearchScreen,
  toFeedPage,
  toSearchPages,
} from "./discoverView";
import { toConditionItems } from "./exploreView";

const todayOf = (container: RequestContainer): string =>
  LocalDate.fromInstant(container.clock.now());

type FeedRead = Readonly<{ page: FeedPage; signedIn: boolean }>;

/**
 * A page of the feed with the account's saves among its listings (CF-04 on
 * the cards; `signedIn: false` leaves them to the device).
 */
async function readFeedPage(
  container: RequestContainer,
  criteria: BrowseCriteriaInput,
  origin: PointInput | null,
  page: number,
) {
  const [output, actor] = await Promise.all([
    readFeed({
      container,
      input: { criteria, origin, pagination: { page, limit: FEED_PAGE_SIZE } },
    }),
    resolveActor(container),
  ]);
  const saveState = await loadSaveState(
    container,
    actor,
    feedListingIds(output).map((id) => ({ kind: "listing", id })),
  );
  const saved = new Set(
    saveState.signedIn
      ? saveState.saved.flatMap((key) =>
          key.startsWith("listing:") ? [key.slice("listing:".length)] : [],
        )
      : [],
  );
  const read: FeedRead = {
    page: toFeedPage(output, todayOf(container), saved),
    signedIn: saveState.signedIn,
  };
  return { read, effective: output.effective };
}

/** A further page of VW-01's feed (CF-05). */
export async function loadFeedPage(
  criteria: BrowseCriteriaInput,
  origin: PointInput | null,
  page: number,
): Promise<FeedPage> {
  const container = await getContainer();
  const { read } = await readFeedPage(container, criteria, origin, page);
  return read.page;
}

/**
 * VW-01's first screen: the feed's first page for the conditions and the
 * viewer's position, the chosen conditions as CF-03 names them, and the
 * active categories for the ジャンル tabs.
 */
export async function loadFeedScreen(
  criteria: BrowseCriteriaInput,
  origin: PointInput | null,
): Promise<FeedScreen> {
  const container = await getContainer();
  const [{ read, effective }, categories, areas] = await Promise.all([
    readFeedPage(container, criteria, origin, 1),
    listCategories({ container }),
    criteria.areas.length === 0
      ? Promise.resolve([])
      : labelAreaSelections({
          container,
          input: { selections: criteria.areas },
        }),
  ]);
  const categoryIds = effective.categoryIds.map(String);
  return {
    first: read.page,
    signedIn: read.signedIn,
    conditions: toConditionItems(areas, categories, categoryIds),
    categories: categories.map(({ id, name }) => ({ id, name })),
    filtered: effective.areas.length > 0 || categoryIds.length > 0,
    categoryIds,
  };
}

/** One kind's page of VW-03 (CF-05 per kind). */
export async function loadSearchPage(
  keyword: string,
  kind: SearchKind,
  page: number,
): Promise<SearchGroupPage> {
  const container = await getContainer();
  const output = await searchByKeyword({
    container,
    input: {
      keyword,
      kinds: kind,
      pagination: { page, limit: SEARCH_PAGE_SIZE },
    },
  });
  return (
    toSearchPages(output, todayOf(container))[kind] ?? { items: [], count: 0 }
  );
}

/**
 * VW-03's results for `keyword`: every kind's first page, the kinds without
 * a result left out (no group at all is CS-09).
 */
export async function loadSearchScreen(keyword: string): Promise<SearchScreen> {
  const container = await getContainer();
  const output = await searchByKeyword({
    container,
    input: {
      keyword,
      kinds: "all",
      pagination: { page: 1, limit: SEARCH_PAGE_SIZE },
    },
  });
  const pages = toSearchPages(output, todayOf(container));
  const groups = SEARCH_KIND_ORDER.flatMap((kind): SearchGroup[] => {
    const first = pages[kind];
    return first === null || first.count === 0 ? [] : [{ kind, first }];
  });
  return { keyword, groups };
}

/**
 * VW-02's start: the chosen conditions as they stand (areas as
 * `labelAreaSelections` names them, the categories still active), the
 * prefectures to start the area hierarchy from, and the active categories.
 */
export async function loadFilterScreen(
  criteria: BrowseCriteriaInput,
): Promise<FilterScreen> {
  const container = await getContainer();
  const [hierarchy, categories, areas] = await Promise.all([
    browseAreaHierarchy({ container, input: { level: "prefectures" } }),
    listCategories({ container }),
    criteria.areas.length === 0
      ? Promise.resolve([])
      : labelAreaSelections({
          container,
          input: { selections: criteria.areas },
        }),
  ]);
  const active = new Set(categories.map(({ id }) => String(id)));
  return {
    prefectures:
      hierarchy.level === "prefectures"
        ? hierarchy.prefectures.map(({ code, name }) => ({ code, name }))
        : [],
    categories: categories.map(({ id, name }) => ({ id, name })),
    areas: areas.map(({ selection, label }) => ({
      code: areaCodeOf(selection),
      label,
    })),
    categoryIds: criteria.categoryIds.filter((id) => active.has(id)),
  };
}
