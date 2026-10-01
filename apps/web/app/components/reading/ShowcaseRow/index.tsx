"use client";

import {
  ListingRow,
  OccasionRow,
  PlaceRow,
  RegionRow,
} from "@/components/detail/RelatedRows";
import type { ShowcaseItem } from "@/presentation/readingView";

/**
 * A showcased target as DT-05 lists it (the reference scene: a listing's
 * offering state and its place's closure, a place's closure, an
 * occasion's holding status). CM-03 shows an article's showcases with it,
 * as viewers will see them.
 */
export function ShowcaseRow({ item }: { item: ShowcaseItem }) {
  switch (item.kind) {
    case "listing":
      return <ListingRow item={item.listing} closure={item.closure} />;
    case "place":
      return <PlaceRow item={item.place} />;
    case "region":
      return <RegionRow item={item.region} />;
    case "occasion":
      return <OccasionRow item={item.occasion} />;
  }
}
