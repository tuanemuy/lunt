import type { PlaceId } from "@repo/core/domain/common/ids";
import { Place } from "@repo/core/domain/place/place";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { requirePlace } from "./places";

export type SuspendPlaceInput = Readonly<{ placeId: PlaceId }>;

/**
 * An operator suspends a place, with or without stewards and whatever its
 * status (MOD-08, MOD-09); also how a duplicate is retired. Profile,
 * status and everything pointing at the place stay as they are —
 * `VisibilityPolicy` hides them. No version in the request: the
 * optimistic lock guards concurrent writes.
 *
 * - `place.suspended`.
 * - `ForbiddenError` without `operate_service`.
 * - `NotFoundError` without the place.
 * - `BusinessRuleError` `PLACE_ALREADY_SUSPENDED`.
 * - `ConflictError` when a concurrent save commits first.
 */
export async function suspendPlace({
  container,
  actor,
  input,
}: ActorServiceArgs<SuspendPlaceInput>): Promise<Place> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const read = await requirePlace(ctx, input.placeId);
    const { entity, eventDrafts } = Place.suspend(read.entity, now);
    await ctx.placeRepository.save(entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
}
