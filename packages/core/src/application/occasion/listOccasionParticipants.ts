import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { OccasionId, PlaceId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { Pagination } from "@repo/core/domain/common/pagination";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import type { PlaceName } from "@repo/core/domain/place/profile";
import { authorizeOnTarget } from "../authority/access";
import { requireExistingTarget } from "../authority/targets";
import type { ActorServiceArgs } from "../types";
import { readListings, readPlaces } from "./attachedListings";
import {
  attachedIdsOf,
  type ParticipationView,
  participationView,
  present,
} from "./participationViews";

export type ListOccasionParticipantsInput = Readonly<{
  occasionId: OccasionId;
  pagination: Pagination;
}>;

export type ParticipantView = Readonly<{
  place: Readonly<{
    id: PlaceId;
    name: PlaceName;
    operatingStatus: OperatingStatus;
    /** Suspended by the operator (非公開). */
    suspended: boolean;
  }>;
  placeHasSteward: boolean;
  participation: ParticipationView;
}>;

export type OccasionParticipantsView = Readonly<{
  items: readonly ParticipantView[];
  count: number;
}>;

/**
 * The places taking part in the occasion, newest participation first,
 * whatever their operating status or suspension, with each place's
 * states, whether it has a steward, and the participation's listings
 * (deleted ones included), dates and out-of-period dates
 * (`spec/usecases/occasion.md` 「listOccasionParticipants」; EVT-07,
 * EVT-10, EVT-13 / EM-01, CM-04).
 *
 * - `NotFoundError` (`OCCASION_NOT_FOUND`) without the occasion, checked
 *   before access.
 * - `ForbiddenError` (`manage_target` on the occasion).
 */
export async function listOccasionParticipants({
  container,
  actor,
  input,
}: ActorServiceArgs<ListOccasionParticipantsInput>): Promise<OccasionParticipantsView> {
  const pagination = Pagination.create(input.pagination);
  const today = LocalDate.fromInstant(container.clock.now());
  await requireExistingTarget(container.stewardedTargetDirectory, {
    kind: "occasion",
    id: input.occasionId,
  });
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "occasion",
      id: input.occasionId,
    });
    const [occasion, page] = await Promise.all([
      ctx.occasionRepository.findById(input.occasionId),
      ctx.participationRepository.findByOccasion(input.occasionId, pagination),
    ]);
    const placeIds = page.items.map((p) => p.key.placeId);
    const [places, listings, stewardships] = await Promise.all([
      readPlaces(ctx, placeIds),
      readListings(ctx, attachedIdsOf(page.items)),
      placeIds.length === 0
        ? Promise.resolve([])
        : ctx.stewardshipRepository.findByTargets(
            placeIds.map((id) => ({ kind: "place", id }) as const),
          ),
    ]);
    const stewarded = new Set(
      stewardships
        .filter((s) => !Stewardship.isVacant(s))
        .map((s) => s.target.id),
    );
    const period = occasion?.entity.content.period ?? null;
    return {
      items: page.items.map((p) => {
        const place = present(places, p.key.placeId);
        return {
          place: {
            id: place.id,
            name: place.profile.name,
            operatingStatus: place.operatingStatus,
            suspended: place.suspension.suspended,
          },
          placeHasSteward: stewarded.has(place.id),
          participation: participationView(p, period, listings, place, today),
        };
      }),
      count: page.count,
    };
  });
}
