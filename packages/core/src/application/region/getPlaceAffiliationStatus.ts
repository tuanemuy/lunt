import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type { Publication } from "@repo/core/domain/common/publication";
import { VisibilityPolicy } from "@repo/core/domain/discovery/visibilityPolicy";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import type { Region } from "@repo/core/domain/region/region";
import type { RegionName } from "@repo/core/domain/region/values";
import { authorizeOnTarget } from "../authority/access";
import type { ActorServiceArgs } from "../types";

export type GetPlaceAffiliationStatusInput = Readonly<{ placeId: PlaceId }>;

/** One affiliated region and the state viewers see it in. */
export type AffiliatedRegionView = Readonly<{
  regionId: RegionId;
  affiliatedAt: Date;
  name: RegionName | null;
  publication: Publication;
  suspended: boolean;
  /** `VisibilityPolicy.isRegionViewable`. */
  viewable: boolean;
}>;

export type PlaceAffiliationStatus = Readonly<{
  /** First-affiliated order. Empty for a place without affiliations. */
  regions: readonly AffiliatedRegionView[];
  /** The representative, and whether the place's steward chose it. */
  representative: Readonly<{ regionId: RegionId; chosen: boolean }> | null;
  /** The region viewers are shown (`PlaceAffiliations.displayedRegion`). */
  displayedRegionId: RegionId | null;
}>;

/**
 * The place's steward (`act_as_place` — no absence proxy) reads the
 * place's affiliated regions with their states, the representative and
 * the region viewers are shown (REG-01, REG-02, REG-04, REG-05).
 * Affiliations made while the place had no steward are included, and so
 * are unpublished and suspended regions. Pending applications are not.
 *
 * - `ForbiddenError` (`act_as_place`).
 */
export async function getPlaceAffiliationStatus({
  container,
  actor,
  input,
}: ActorServiceArgs<GetPlaceAffiliationStatusInput>): Promise<PlaceAffiliationStatus> {
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, "act_as_place", {
      kind: "place",
      id: input.placeId,
    });
    const found = await ctx.placeAffiliationsRepository.findById(input.placeId);
    if (found === null) return null;
    const regions = await Promise.all(
      IdBatch.chunks(PlaceAffiliations.regionIds(found.entity)).map((ids) =>
        ctx.regionRepository.findByIds(ids),
      ),
    );
    return { affiliations: found.entity, regions: regions.flat() };
  });
  if (read === null) {
    return { regions: [], representative: null, displayedRegionId: null };
  }
  const byId = new Map<RegionId, Region>(
    read.regions.map((region) => [region.id, region]),
  );
  const regions = read.affiliations.affiliations.flatMap(
    (affiliation): AffiliatedRegionView[] => {
      const region = byId.get(affiliation.regionId);
      if (region === undefined) return [];
      return [
        {
          regionId: region.id,
          affiliatedAt: affiliation.affiliatedAt,
          name: region.content.name,
          publication: region.publication,
          suspended: region.suspension.suspended,
          viewable: VisibilityPolicy.isRegionViewable(region),
        },
      ];
    },
  );
  const viewable = new Set(
    regions.filter((region) => region.viewable).map((r) => r.regionId),
  );
  const representative = PlaceAffiliations.representative(read.affiliations);
  return {
    regions,
    representative:
      representative === null
        ? null
        : {
            regionId: representative,
            chosen: read.affiliations.chosenRepresentative === representative,
          },
    displayedRegionId: PlaceAffiliations.displayedRegion(
      read.affiliations,
      viewable,
    ),
  };
}
