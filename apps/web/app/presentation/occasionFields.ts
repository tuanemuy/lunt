// Server-only: import from server-function handlers (dynamically), never
// from components.
import type { OccasionContentFields } from "@repo/core/application/occasion/managedOccasion";
import type { ParticipationDetailsFields } from "@repo/core/application/occasion/participations";
import { TownRef } from "@repo/core/domain/area/townRef";
import {
  ListingId,
  type OccasionId,
  PhotoId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { OccasionContentInput } from "./occasion";
import { occasionIdOf } from "./occasionData";

/** The transport's content as the usecases take it: ids and the town through their value objects. */
export function occasionFieldsOf(
  input: OccasionContentInput,
): OccasionContentFields {
  return {
    name: input.name,
    period: input.period,
    address:
      input.address === null
        ? null
        : {
            town: TownRef.create(input.address.town),
            rest: input.address.rest,
          },
    location: input.location,
    photoIds: input.photoIds.map(PhotoId.create),
    description: input.description,
    tagline: input.tagline,
  };
}

/** A participation's key and details as the usecases take them. */
export function participationFieldsOf(
  input: Readonly<{
    occasionId: string;
    placeId: string;
    listingIds: readonly string[];
    dates: readonly string[];
  }>,
): ParticipationDetailsFields &
  Readonly<{ occasionId: OccasionId; placeId: PlaceId }> {
  return {
    occasionId: occasionIdOf(input.occasionId),
    placeId: PlaceId.create(input.placeId),
    listingIds: input.listingIds.map(ListingId.create),
    dates: input.dates.map(LocalDate.parse),
  };
}
