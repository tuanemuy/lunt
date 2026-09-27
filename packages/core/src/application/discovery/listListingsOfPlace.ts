import type { PlaceId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import {
  type ListingSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { PLACE_NOT_FOUND } from "./viewPlace";
import {
  listingSummaryPhotoIds,
  type PhotoRefs,
  photoRefsOf,
  todayOf,
} from "./views";

export type ListListingsOfPlaceInput = Readonly<{
  placeId: PlaceId;
  pagination: Pagination;
}>;

export type ListListingsOfPlaceOutput = Readonly<{
  /** 「店舗の掲載の順」: available, upcoming, ended; each newest first. */
  items: readonly ListingSummary[];
  count: number;
  photos: PhotoRefs;
}>;

/**
 * DT-02's listing section and its continuation (EXP-07, CF-05): the place's
 * listings in the reference scene, each with its standing (an upcoming one
 * carries its start day). Listings of temporarily or permanently closed
 * places are included. Needs no login.
 *
 * @throws NotFoundError `PLACE_NOT_FOUND` when the place is suspended or
 *   missing.
 */
export async function listListingsOfPlace({
  container,
  input,
}: ServiceArgs<ListListingsOfPlaceInput>): Promise<ListListingsOfPlaceOutput> {
  const today = todayOf(container);
  const place = await container.detailQueries.findPlace(input.placeId);
  if (place === null) {
    throw new NotFoundError(PLACE_NOT_FOUND, "The place is not viewable");
  }
  const page = await container.detailQueries.findListingsOfPlace(
    { placeId: input.placeId, scene: "reference", today },
    input.pagination,
  );
  const items = page.items.map((entry) =>
    ViewProjection.listingSummary(entry, { kind: "displayed" }, today),
  );
  return {
    items,
    count: page.count,
    photos: await photoRefsOf(container, items.flatMap(listingSummaryPhotoIds)),
  };
}
