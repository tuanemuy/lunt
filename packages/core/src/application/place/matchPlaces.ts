import type { Address } from "@repo/core/domain/common/address";
import type { PhotoId, PlaceId } from "@repo/core/domain/common/ids";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import type { ShowcaseRef } from "@repo/core/domain/common/refs";
import type {
  CoverPhoto,
  SubstituteCover,
} from "@repo/core/domain/discovery/entry";
import type { ReferenceQueries } from "@repo/core/domain/discovery/ports/referenceQueries";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import { PlaceMatchCriteria } from "@repo/core/domain/place/matching";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { Place } from "@repo/core/domain/place/place";
import { type PlaceName, PlaceProfile } from "@repo/core/domain/place/profile";
import type { ServiceArgs } from "../types";
import { displayRefsOf } from "./photos";

export type MatchPlacesInput = Readonly<{
  /** Either may be blank or `null`, not both. */
  name: string | null;
  address: string | null;
  pagination: Pagination;
}>;

export type PlaceMatch = Readonly<{
  placeId: PlaceId;
  name: PlaceName;
  address: Address;
  operatingStatus: OperatingStatus;
  /**
   * The place's first photo, or for a place without photos Discovery's
   * `substituteCover` (a viewable listing's cover); `null` when neither.
   */
  cover: (CoverPhoto & Readonly<{ displayRef: PhotoDisplayRef }>) | null;
}>;

/**
 * Finds places by name and / or address before applying to register one
 * (SHP-02). No actor: signed-out users may call it. Suspended places never
 * appear, whoever asks; operating status does not filter. Neither
 * suspension nor stewardship is returned. A place without photos borrows
 * `ReferenceQueries.resolve`'s `substituteCover` — the substitution rule
 * is Discovery's alone.
 *
 * - `BusinessRuleError` `PLACE_INVALID_MATCH_CRITERIA` when both are blank.
 */
export async function matchPlaces({
  container,
  input,
}: ServiceArgs<MatchPlacesInput>): Promise<PaginationResult<PlaceMatch>> {
  const criteria = PlaceMatchCriteria.create({
    name: input.name,
    address: input.address,
    includeSuspended: false,
  });
  const page = await container.unitOfWorkProvider.run(({ placeRepository }) =>
    placeRepository.match(criteria, input.pagination),
  );
  const substitutes = await substituteCovers(
    container.referenceQueries,
    page.items.filter((place) => PlaceProfile.cover(place.profile) === null),
  );
  const covers = page.items.map((place): CoverPhoto | null => {
    const own = PlaceProfile.cover(place.profile);
    if (own !== null) return { source: "own", photoId: own, framing: null };
    const substitute = substitutes.get(place.id);
    return substitute === undefined
      ? null
      : {
          source: "listing",
          listingId: substitute.listingId,
          photoId: substitute.photo.photoId,
          framing: substitute.photo.framing,
        };
  });
  const refs = await displayRefsOf(
    container.photoStorage,
    covers.flatMap((cover): PhotoId[] =>
      cover === null ? [] : [cover.photoId],
    ),
  );
  return {
    count: page.count,
    items: page.items.map((place, i) => {
      const cover = covers[i] ?? null;
      const displayRef = cover === null ? undefined : refs.get(cover.photoId);
      return {
        placeId: place.id,
        name: place.profile.name,
        address: place.profile.address,
        operatingStatus: place.operatingStatus,
        cover:
          cover === null || displayRef === undefined
            ? null
            : { ...cover, displayRef },
      };
    }),
  };
}

/** Discovery's substitute covers of the photo-less places (at most one page, ≤ 100). */
async function substituteCovers(
  referenceQueries: ReferenceQueries,
  places: readonly Place[],
): Promise<ReadonlyMap<PlaceId, SubstituteCover>> {
  if (places.length === 0) return new Map();
  const refs: ShowcaseRef[] = places.map(Place.ref);
  const resolutions = await referenceQueries.resolve(refs);
  const found = new Map<PlaceId, SubstituteCover>();
  for (const resolution of resolutions) {
    if (!resolution.viewable || resolution.target.kind !== "place") continue;
    const { entry } = resolution.target;
    if (entry.substituteCover !== null) {
      found.set(entry.place.id, entry.substituteCover);
    }
  }
  return found;
}
