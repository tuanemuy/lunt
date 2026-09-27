import type {
  ListingId,
  PhotoId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type { PublishedListing } from "@repo/core/domain/listing/listing";
import type { Framing, ListingPhoto } from "@repo/core/domain/listing/values";
import type { Place } from "@repo/core/domain/place/place";
import type { PublishedRegion } from "./stagedKinds";

/** The cover photo of a listing standing in for a place without photos. */
export type SubstituteCover = Readonly<{
  listingId: ListingId;
  photo: ListingPhoto;
}>;

/**
 * A viewable place and the ties its projections need
 * (`ViewProjection.placeEntry`).
 */
export type PlaceEntry = Readonly<{
  place: Place;
  /**
   * Viewable affiliated regions, the displayed region first, then in
   * affiliation order (`ViewProjection.regionsOf`). Empty in stage 2.
   */
  regions: readonly PublishedRegion[];
  /** `ViewProjection.substituteCover`: `null` unless the place has no photo. */
  substituteCover: SubstituteCover | null;
}>;

/** A viewable listing and the entry of its (viewable) place. */
export type ListingEntry = Readonly<{
  listing: PublishedListing;
  place: PlaceEntry;
}>;

/**
 * What a viewable reference resolves to. Regions and occasions join with
 * stage 3; until then their references resolve as not viewable.
 */
export type ResolvedTarget =
  | Readonly<{ kind: "listing"; entry: ListingEntry }>
  | Readonly<{ kind: "place"; entry: PlaceEntry }>;

/**
 * One reference's resolution: the viewable target, or only the fact that
 * it is not viewable — never why, and never whether it exists (CS-06).
 */
export type ReferenceResolution =
  | Readonly<{ ref: ShowcaseRef; viewable: true; target: ResolvedTarget }>
  | Readonly<{ ref: ShowcaseRef; viewable: false }>;

/**
 * Which region a summary names: the displayed one, or (inside a region's
 * list and detail) that region.
 */
export type RegionContext =
  | Readonly<{ kind: "displayed" }>
  | Readonly<{ kind: "within"; regionId: RegionId }>;

/**
 * The one photo a list or overview shows. Only listing photos carry a
 * framing; a place's own photo has `framing: null`.
 */
export type CoverPhoto =
  | Readonly<{ source: "own"; photoId: PhotoId; framing: Framing | null }>
  | Readonly<{
      source: "listing";
      listingId: ListingId;
      photoId: PhotoId;
      framing: Framing | null;
    }>;
