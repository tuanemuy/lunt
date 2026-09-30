import type {
  Article,
  PublishedArticle,
} from "@repo/core/domain/article/article";
import type { Publication } from "@repo/core/domain/common/publication";
import type { Suspension } from "@repo/core/domain/common/suspension";
import type {
  Occasion,
  PublishedOccasion,
} from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion, Region } from "@repo/core/domain/region/region";
import type { Scene } from "./scene";
import type { Standing } from "./standing";

/** The facts a place's visibility rests on (`Pick<Place, "suspension">`). */
export type PlaceExposure = Readonly<{ suspension: Suspension }>;

/**
 * The facts a listing's, region's or occasion's visibility rests on
 * (`Pick<…, "publication" | "suspension">`).
 */
export type PublicationExposure = Readonly<{
  publication: Publication;
  suspension: Suspension;
}>;

/** The facts a listing's own visibility rests on. */
export type ListingExposure = PublicationExposure;

const isPlaceViewable = (place: PlaceExposure): boolean =>
  !place.suspension.suspended;

const isPublishedAndShown = (target: PublicationExposure): boolean =>
  target.publication.status === "published" && !target.suspension.suspended;

const isListingViewable = (
  listing: ListingExposure,
  place: PlaceExposure | null,
): boolean =>
  isPublishedAndShown(listing) && place !== null && isPlaceViewable(place);

const isRegionViewable = (region: PublicationExposure): boolean =>
  isPublishedAndShown(region);

const isOccasionViewable = (occasion: PublicationExposure): boolean =>
  isPublishedAndShown(occasion);

const isArticleViewable = (article: Pick<Article, "publication">): boolean =>
  article.publication.status === "published";

const isDiscoverable = (standing: Standing): boolean => {
  switch (standing.kind) {
    case "listing":
      return (
        standing.offering.phase === "available" &&
        standing.operating !== "permanentlyClosed"
      );
    case "place":
      return standing.operating !== "permanentlyClosed";
    case "occasion":
      return standing.holding === "upcoming" || standing.holding === "ongoing";
    case "region":
    case "article":
      return true;
  }
};

const admits = (scene: Scene, standing: Standing): boolean =>
  scene === "reference" || isDiscoverable(standing);

/**
 * The only definition of "viewable" and of what each scene shows
 * (`spec/domains/discovery.md` 「VisibilityPolicy」). Every read shows a
 * target iff it is viewable and `admits(scene, standing)` holds; there are
 * no per-scene or per-screen exceptions. Viewability depends only on the
 * publication state, the operator suspension and the place's suspension —
 * never on the date, the operating status, the holding status or the
 * cancellation. Articles have no suspension: only their publication state
 * counts.
 */
export const VisibilityPolicy = {
  /** Not suspended by the operator. */
  isPlaceViewable,
  /**
   * `published`, not suspended, and its place exists and is viewable — a
   * listing whose place is missing is not viewable.
   */
  isListingViewable,
  /** `published` and not suspended by the operator. */
  isRegionViewable,
  /** `published` and not suspended; cancellation and holding status do not matter. */
  isOccasionViewable,
  /** `published` (articles are never suspended). */
  isArticleViewable,
  /** `isArticleViewable` as a guard to the published variant. */
  viewableArticle: (article: Article): article is PublishedArticle =>
    isArticleViewable(article),
  /** `isRegionViewable` as a guard to the published variant. */
  viewableRegion: (region: Region): region is PublishedRegion =>
    region.publication.status === "published" && isRegionViewable(region),
  /** `isOccasionViewable` as a guard to the published variant. */
  viewableOccasion: (occasion: Occasion): occasion is PublishedOccasion =>
    occasion.publication.status === "published" && isOccasionViewable(occasion),
  /**
   * A listing is discoverable while `available` at a place that is not
   * permanently closed; a place while not permanently closed; an occasion
   * while upcoming or ongoing; a region and an article always.
   */
  isDiscoverable,
  /** `reference` admits every standing; `discovery` only discoverable ones. */
  admits,
};
