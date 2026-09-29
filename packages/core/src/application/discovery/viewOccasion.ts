import type { Actor } from "@repo/core/domain/common/actor";
import type { OccasionId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import {
  type ListingSummary,
  type OccasionDetail,
  type PlaceSummary,
  type RegionSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { Participation } from "@repo/core/domain/occasion/participation";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import {
  listingSummaryPhotoIds,
  type PhotoRefs,
  photoRefsOf,
  placeSummaryPhotoIds,
  regionSummaryPhotoIds,
  todayOf,
} from "./views";

/** Thrown for an occasion that is not viewable or does not exist (not told apart). */
export const OCCASION_NOT_FOUND = "OCCASION_NOT_FOUND";

export type ViewOccasionInput = Readonly<{ occasionId: OccasionId }>;

/** One participating place as DT-04 shows it (reference scene). */
export type OccasionParticipantView = Readonly<{
  /** The place with its operating status (closed places included). */
  place: PlaceSummary;
  /**
   * Its viewable attached listings in attach order, each with its offering
   * status (upcoming and ended ones included).
   */
  listings: readonly ListingSummary[];
  /** Its days within the current period, ascending (`visibleDates`). */
  dates: readonly LocalDate[];
}>;

export type ViewOccasionOutput = Readonly<{
  /** The occasion's content and holding status; photos in registration order. */
  occasion: OccasionDetail;
  /** Every viewable participant, in participation order. */
  participants: readonly OccasionParticipantView[];
  /**
   * `true` when no participant has a viewable attached listing — DT-04's
   * 「イベントに閲覧できる掲載がない」 (CS-09), not an error.
   */
  hasNoViewableListing: boolean;
  /** Every viewable `linked` region, in link order. */
  regions: readonly RegionSummary[];
  /**
   * Whether the viewer is a steward of some place — decides the entry to
   * the participation application. `false` when signed out.
   */
  viewerManagesPlace: boolean;
  photos: PhotoRefs;
}>;

/**
 * DT-04 (EXP-09): an occasion's content and holding status, its
 * participants with their attached listings and days, and its regions.
 * The occasion, its participants and their listings are in the reference
 * scene: ended and cancelled occasions, closed places and upcoming / ended
 * listings show with their standing. Its articles are read by the screen
 * through `listArticlesShowcasing`. Needs no login.
 *
 * @throws NotFoundError `OCCASION_NOT_FOUND` when the occasion is a draft,
 *   unpublished, suspended or missing — without telling which.
 */
export async function viewOccasion({
  container,
  actor,
  input,
}: ServiceArgs<ViewOccasionInput> &
  Readonly<{ actor: Actor | null }>): Promise<ViewOccasionOutput> {
  const today = todayOf(container);
  const occasion = await container.detailQueries.findOccasion(input.occasionId);
  if (occasion === null) {
    throw new NotFoundError(OCCASION_NOT_FOUND, "The occasion is not viewable");
  }
  const [entries, linked] = await Promise.all([
    container.detailQueries.findParticipants(occasion.id),
    container.detailQueries.findRegionsOfOccasion(occasion.id),
  ]);
  const viewerManagesPlace =
    actor !== null &&
    (await container.unitOfWorkProvider.run(
      async ({ stewardshipRepository }) => {
        const page = await stewardshipRepository.findPageBySteward(
          actor.accountId,
          { page: 1, limit: 1 },
        );
        return page.items[0]?.entity.target.kind === "place";
      },
    ));

  const detail = ViewProjection.occasionDetail(occasion, today);
  const participants = entries.map(
    (entry): OccasionParticipantView => ({
      place: ViewProjection.placeSummary(entry.place, { kind: "displayed" }),
      listings: entry.listings.map((listing) =>
        ViewProjection.listingSummary(
          { listing, place: entry.place },
          { kind: "displayed" },
          today,
        ),
      ),
      dates: Participation.visibleDates(
        entry.participation,
        occasion.content.period,
      ),
    }),
  );
  const regions = linked.map(ViewProjection.regionSummary);
  return {
    occasion: detail,
    participants,
    hasNoViewableListing: participants.every(
      (participant) => participant.listings.length === 0,
    ),
    regions,
    viewerManagesPlace,
    photos: await photoRefsOf(container, [
      ...detail.photos.map((photo) => photo.photoId),
      ...participants.flatMap((participant) => [
        ...placeSummaryPhotoIds(participant.place),
        ...participant.listings.flatMap(listingSummaryPhotoIds),
      ]),
      ...regions.flatMap(regionSummaryPhotoIds),
    ]),
  };
}
