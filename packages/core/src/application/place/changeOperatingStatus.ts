import type { PlaceId } from "@repo/core/domain/common/ids";
import type { Version } from "@repo/core/domain/common/version";
import { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { Place } from "@repo/core/domain/place/place";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { assertEditedVersion, requirePlace } from "./places";

export type ChangeOperatingStatusInput = Readonly<{
  placeId: PlaceId;
  /** The version the current status was read at. */
  version: Version;
  /** `open` / `temporarilyClosed` / `permanentlyClosed`. */
  status: string;
}>;

/**
 * Sets a place's operating status, any to any, without an application
 * (SHP-07, SHP-13, MOD-06): its steward, or an operator while it has none
 * (`manage_target`). Also while suspended. Listings are not rewritten.
 * The same status writes nothing and emits nothing.
 *
 * - `place.operating_status_changed` on a change.
 * - `BusinessRuleError` `PLACE_INVALID_OPERATING_STATUS`.
 * - `ForbiddenError` (`manage_target`), also when a steward is appointed
 *   or removed before the commit.
 * - `NotFoundError` without the place.
 * - `ConflictError` when `version` is not the stored one, or on an
 *   optimistic-lock conflict.
 */
export async function changeOperatingStatus({
  container,
  actor,
  input,
}: ActorServiceArgs<ChangeOperatingStatusInput>): Promise<Place> {
  const status = OperatingStatus.create(input.status);
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "place",
      id: input.placeId,
    });
    const read = await requirePlace(ctx, input.placeId);
    assertEditedVersion(read.entity, input.version);
    const { entity, eventDrafts } = Place.changeOperatingStatus(
      read.entity,
      status,
      now,
    );
    if (entity === read.entity) return entity;
    await ctx.placeRepository.save(entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
}
