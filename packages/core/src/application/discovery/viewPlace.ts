import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { Actor } from "@repo/core/domain/common/actor";
import type { PlaceId } from "@repo/core/domain/common/ids";
import {
  type OccasionSummary,
  type PlaceDetail,
  type RegionSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import {
  occasionSummaryPhotoIds,
  type PhotoRefs,
  photoRefsOf,
  regionSummaryPhotoIds,
  todayOf,
} from "./views";

/** Thrown for a place that is suspended or does not exist (not told apart). */
export const PLACE_NOT_FOUND = "PLACE_NOT_FOUND";

export type ViewPlaceInput = Readonly<{ placeId: PlaceId }>;

export type ViewPlaceOutput = Readonly<{
  /** The place's own content — a place without photos shows none. */
  place: Omit<PlaceDetail, "regions">;
  /**
   * Every viewable region of the place: the displayed one first, then in
   * first-affiliated order.
   */
  regions: readonly RegionSummary[];
  /**
   * Upcoming and ongoing viewable occasions the place takes part in, in
   * 「開催日の順」 (discovery scene).
   */
  occasions: readonly OccasionSummary[];
  /** Whether the place has no steward. */
  placeIsVacant: boolean;
  /** Whether the viewer is one of its stewards; `false` when signed out. */
  viewerIsSteward: boolean;
  photos: PhotoRefs;
}>;

/**
 * DT-02 (EXP-07, SHP-01): a place's detail with its regions and occasions.
 * The place is in the reference scene (temporarily or permanently closed
 * places show with their standing); occasions are in the discovery scene.
 * The two stewardship facts decide which procedures the screen offers.
 * Needs no login; the viewer's standing never changes what is viewable.
 *
 * @throws NotFoundError `PLACE_NOT_FOUND` when the place is suspended or
 *   missing, without telling which.
 */
export async function viewPlace({
  container,
  actor,
  input,
}: ServiceArgs<ViewPlaceInput> &
  Readonly<{ actor: Actor | null }>): Promise<ViewPlaceOutput> {
  const today = todayOf(container);
  const entry = await container.detailQueries.findPlace(input.placeId);
  if (entry === null) {
    throw new NotFoundError(PLACE_NOT_FOUND, "The place is not viewable");
  }
  const target = { kind: "place", id: entry.place.id } as const;
  const stewardship = await container.unitOfWorkProvider.run(
    async ({ stewardshipRepository }) =>
      Stewardship.orVacant(
        (await stewardshipRepository.findById(target))?.entity ?? null,
        target,
      ),
  );
  const occasions = (
    await container.detailQueries.findOccasionsRelatedTo(
      { kind: "place", id: entry.place.id },
      today,
    )
  ).map((occasion) => ViewProjection.occasionSummary(occasion, today));
  const { regions, ...place } = ViewProjection.placeDetail(entry);
  return {
    place,
    regions,
    occasions,
    placeIsVacant: Stewardship.isVacant(stewardship),
    viewerIsSteward:
      actor !== null && Stewardship.isSteward(stewardship, actor.accountId),
    photos: await photoRefsOf(container, [
      ...place.photos.map((photo) => photo.photoId),
      ...regions.flatMap(regionSummaryPhotoIds),
      ...occasions.flatMap(occasionSummaryPhotoIds),
    ]),
  };
}
