import type { FindRegionsOutput } from "@repo/core/application/discovery/findRegions";
import type { ListListingsOfRegionOutput } from "@repo/core/application/discovery/listListingsOfRegion";
import type { ListOccasionsOutput } from "@repo/core/application/discovery/listOccasions";
import type { ListPlacesOfRegionOutput } from "@repo/core/application/discovery/listPlacesOfRegion";
import type { AreaSelectionLabel } from "@repo/core/domain/area/areaSelection";
import { areaCodeOf } from "./browseSearch";
import {
  type ListingCardItem,
  listingCard,
  type OccasionRowItem,
  occasionRow,
  type PlaceRowItem,
  placeRow,
  type RegionRowItem,
  regionRow,
} from "./detailView";

/**
 * What VW-05 まち, VW-06 地域内の一覧 and VW-07 イベントの一覧 show, as
 * plain serializable data built on the server from the Discovery usecases'
 * outputs (`spec/pages/browse.md`).
 */

/** VW-05's regions per page (EditorialFeature frames). */
export const REGIONS_PAGE_SIZE = 10;
/** VW-06's places and listings per page (a multiple of the 2/3/4 columns). */
export const REGION_LIST_PAGE_SIZE = 24;
/** VW-07's occasions per page. */
export const EVENTS_PAGE_SIZE = 20;

/**
 * Which regions VW-05 shows: those of the chosen areas (選択エリアの地域),
 * of the viewer's vicinity (周辺の地域), or all (すべての地域).
 */
export type RegionsFocus = FindRegionsOutput["focus"];

export type RegionsPage = Readonly<{
  focus: RegionsFocus;
  /** Nearest first with the viewer's position, newest first otherwise. */
  items: readonly RegionRowItem[];
  count: number;
}>;

/** A chosen condition as CF-03 shows it, with what removes it. */
export type ConditionItem =
  | Readonly<{ kind: "area"; code: string; label: string }>
  | Readonly<{ kind: "category"; id: string; label: string }>;

/** VW-07's occasion: the row of a detail plus 開催場所. */
export type EventItem = OccasionRowItem &
  Readonly<{
    /** 開催場所: the venue's 市区町村・町域. */
    venue: string;
  }>;

export type EventsPage = Readonly<{
  /** 開催日の順: period start, then end. */
  items: readonly EventItem[];
  count: number;
}>;

/** VW-06's two lists. */
export type RegionListTab = "places" | "listings";

export type RegionPlacesPage = Readonly<{
  /** Newest affiliation first; each names this region. */
  items: readonly PlaceRowItem[];
  count: number;
}>;

export type RegionListingsPage = Readonly<{
  /** Newest first; each names this region. */
  items: readonly ListingCardItem[];
  count: number;
}>;

/** VW-06's first screen: the region's name and the first page of a list, or CS-06. */
export type RegionListScreen =
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{
      kind: "places";
      regionId: string;
      name: string;
      first: RegionPlacesPage;
    }>
  | Readonly<{
      kind: "listings";
      regionId: string;
      name: string;
      first: RegionListingsPage;
    }>;

/** A page of VW-05 from `findRegions`. */
export function toRegionsPage(output: FindRegionsOutput): RegionsPage {
  return {
    focus: output.focus,
    items: output.items.map((summary) => regionRow(summary, output.photos)),
    count: output.count,
  };
}

/** A page of VW-07 from `listOccasions`, worded against `today`. */
export function toEventsPage(
  output: ListOccasionsOutput,
  today: string,
): EventsPage {
  return {
    items: output.items.map((summary) => ({
      ...occasionRow(summary, output.photos, today),
      venue: `${summary.venue.address.municipality}・${summary.venue.address.town}`,
    })),
    count: output.count,
  };
}

/** A page of VW-06's places from `listPlacesOfRegion`. */
export function toRegionPlacesPage(
  output: ListPlacesOfRegionOutput,
): RegionPlacesPage {
  return {
    items: output.items.map((summary) => placeRow(summary, output.photos)),
    count: output.count,
  };
}

/** A page of VW-06's listings from `listListingsOfRegion`, worded against `today`. */
export function toRegionListingsPage(
  output: ListListingsOfRegionOutput,
  today: string,
): RegionListingsPage {
  return {
    items: output.items.map((summary) =>
      listingCard(summary, output.photos, today),
    ),
    count: output.count,
  };
}

/**
 * CF-03's chips: the areas as `labelAreaSelections` names them, then the
 * categories in force with their names (a category the catalog no longer
 * lists is left out).
 */
export function toConditionItems(
  areas: readonly AreaSelectionLabel[],
  categories: readonly Readonly<{ id: string; name: string }>[],
  categoryIds: readonly string[],
): readonly ConditionItem[] {
  const names = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  return [
    ...areas.map(
      (area): ConditionItem => ({
        kind: "area",
        code: areaCodeOf(area.selection),
        label: area.label,
      }),
    ),
    ...categoryIds.flatMap((id): ConditionItem[] => {
      const label = names.get(id);
      return label === undefined ? [] : [{ kind: "category", id, label }];
    }),
  ];
}
