import type { Publication } from "@repo/core/domain/common/publication";
import type { Suspension } from "@repo/core/domain/common/suspension";
import type { Scene } from "./scene";
import type { Standing } from "./standing";

/** The facts a place's visibility rests on (`Pick<Place, "suspension">`). */
export type PlaceExposure = Readonly<{ suspension: Suspension }>;

/**
 * The facts a listing's visibility rests on
 * (`Pick<Listing, "publication" | "suspension">`).
 */
export type ListingExposure = Readonly<{
  publication: Publication;
  suspension: Suspension;
}>;

const isPlaceViewable = (place: PlaceExposure): boolean =>
  !place.suspension.suspended;

const isListingViewable = (
  listing: ListingExposure,
  place: PlaceExposure | null,
): boolean =>
  listing.publication.status === "published" &&
  !listing.suspension.suspended &&
  place !== null &&
  isPlaceViewable(place);

const isDiscoverable = (standing: Standing): boolean => {
  switch (standing.kind) {
    case "listing":
      return (
        standing.offering.phase === "available" &&
        standing.operating !== "permanentlyClosed"
      );
    case "place":
      return standing.operating !== "permanentlyClosed";
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
 * never on the date or the operating status.
 *
 * Region, occasion and article kinds join with their stages
 * (`spec/domains/index.md` 「開発の順序との対応」).
 */
export const VisibilityPolicy = {
  /** Not suspended by the operator. */
  isPlaceViewable,
  /**
   * `published`, not suspended, and its place exists and is viewable — a
   * listing whose place is missing is not viewable.
   */
  isListingViewable,
  /**
   * A listing is discoverable while `available` at a place that is not
   * permanently closed; a place while not permanently closed.
   */
  isDiscoverable,
  /** `reference` admits every standing; `discovery` only discoverable ones. */
  admits,
};
