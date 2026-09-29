import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { persistAffiliations, readAffiliations } from "./affiliations";

export type ExcludeAffiliatedPlaceInput = Readonly<{
  regionId: RegionId;
  placeId: PlaceId;
}>;

/**
 * The region's operator (`manage_target`) dissolves a place's affiliation
 * without approval or reason (REG-10, REG-13). A dissolved chosen
 * representative is cleared (the first affiliated region takes over); the
 * place's other affiliations, the place, its listings and applications
 * are not written. The expiry of the place's leave application and the
 * notice follow from the event.
 *
 * - `region.affiliation_dissolved` (`cause: "excluded"`).
 * - `ForbiddenError` (`manage_target`), also when the stewardship changes
 *   before the commit.
 * - `BusinessRuleError` `REGION_NOT_AFFILIATED`.
 * - `ConflictError` when a concurrent affiliation, dissolution or choice
 *   for the same place commits first.
 */
export async function excludeAffiliatedPlace({
  container,
  actor,
  input,
}: ActorServiceArgs<ExcludeAffiliatedPlaceInput>): Promise<void> {
  const now = container.clock.now();
  await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "manage_target", {
      kind: "region",
      id: input.regionId,
    });
    const read = await readAffiliations(ctx, input.placeId, now);
    const { entity, eventDrafts } = PlaceAffiliations.exclude(
      read.affiliations,
      input.regionId,
      now,
    );
    await persistAffiliations(ctx, entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
  });
}
