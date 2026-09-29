import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { authorizeOnTarget } from "../authority/access";
import { requireExistingTarget } from "../authority/targets";
import type { ActorServiceArgs } from "../types";
import { persistAffiliations, readAffiliations } from "./affiliations";

export type ChooseRepresentativeRegionInput = Readonly<{
  placeId: PlaceId;
  regionId: RegionId;
}>;

/**
 * The place's steward (`act_as_place` — no absence proxy) makes one of
 * its affiliated regions the chosen representative, whatever the region's
 * publication or suspension (REG-04). Takes effect at once; no event.
 * Returns the representative after the choice.
 *
 * - `NotFoundError` (`PLACE_NOT_FOUND`) without the place, checked
 *   before access.
 * - `ForbiddenError` (`act_as_place`), also when the steward resigns or is
 *   removed before the commit.
 * - `BusinessRuleError` `REGION_NOT_AFFILIATED` (a place without any
 *   record included — nothing is created), and
 *   `REGION_REPRESENTATIVE_ALREADY_CHOSEN`.
 * - `ConflictError` when a concurrent affiliation, dissolution or choice
 *   for the same place commits first.
 */
export async function chooseRepresentativeRegion({
  container,
  actor,
  input,
}: ActorServiceArgs<ChooseRepresentativeRegionInput>): Promise<RegionId> {
  const now = container.clock.now();
  await requireExistingTarget(container.stewardedTargetDirectory, {
    kind: "place",
    id: input.placeId,
  });
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "act_as_place", {
      kind: "place",
      id: input.placeId,
    });
    const read = await readAffiliations(ctx, input.placeId, now);
    const { entity } = PlaceAffiliations.chooseRepresentative(
      read.affiliations,
      input.regionId,
      now,
    );
    await persistAffiliations(ctx, entity, read.expectedVersion);
    return input.regionId;
  });
}
