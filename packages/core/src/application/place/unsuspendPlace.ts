import type { PlaceId } from "@repo/core/domain/common/ids";
import { Place } from "@repo/core/domain/place/place";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requirePlace } from "./places";

export type UnsuspendPlaceInput = Readonly<{ placeId: PlaceId }>;

/**
 * An operator lifts a place's suspension (MOD-08, MOD-09). The profile and
 * status reappear as they were saved meanwhile; listings are not
 * rewritten. No version in the request.
 *
 * - `place.unsuspended`.
 * - `ForbiddenError` without `operate_service`.
 * - `NotFoundError` without the place.
 * - `BusinessRuleError` `PLACE_NOT_SUSPENDED`.
 * - `ConflictError` when a concurrent save commits first.
 */
export async function unsuspendPlace({
  container,
  actor,
  input,
}: ActorServiceArgs<UnsuspendPlaceInput>): Promise<Place> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const read = await requirePlace(ctx, input.placeId);
    const { entity, eventDrafts } = Place.unsuspend(read.entity, now);
    await ctx.placeRepository.save(entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
}
