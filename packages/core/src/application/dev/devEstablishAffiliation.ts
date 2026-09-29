import { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { ForbiddenError, NotFoundError } from "../errors";
import { PLACE_NOT_FOUND } from "../place/places";
import { persistAffiliations, readAffiliations } from "../region/affiliations";
import { requireRegion } from "../region/regions";
import type { ServiceArgs } from "../types";

export type DevEstablishAffiliationInput = Readonly<{
  placeId: string;
  regionId: string;
}>;

/**
 * Development tool: affiliates a place with a region the way approving an
 * affiliation application will (`PlaceAffiliations.affiliate`, persisted
 * through `readAffiliations` / `persistAffiliations`, emitting
 * `region.affiliation_established`). Stage 3a has no affiliation
 * applications — they arrive with S3B — so the manual-test seed
 * (`devSeed`) establishes affiliations here. The application's premises
 * are not checked. Refused unless the development tools are on.
 *
 * - `NotFoundError` without the place or the region.
 * - `BusinessRuleError` `REGION_ALREADY_AFFILIATED`.
 */
export async function devEstablishAffiliation({
  container,
  input,
}: ServiceArgs<DevEstablishAffiliationInput>): Promise<void> {
  if (!container.runtime.devTools) {
    throw new ForbiddenError(
      "DEV_TOOLS_DISABLED",
      "Development tools are disabled",
    );
  }
  const placeId = PlaceId.create(input.placeId);
  const regionId = RegionId.create(input.regionId);
  const now = container.clock.now();
  await container.unitOfWorkProvider.run(async (ctx) => {
    if ((await ctx.placeRepository.findById(placeId)) === null) {
      throw new NotFoundError(PLACE_NOT_FOUND, "The store does not exist");
    }
    await requireRegion(ctx, regionId);
    const read = await readAffiliations(ctx, placeId, now);
    const { entity, eventDrafts } = PlaceAffiliations.affiliate(
      read.affiliations,
      regionId,
      now,
    );
    await persistAffiliations(ctx, entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
  });
}
