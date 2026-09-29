import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import type { Region } from "@repo/core/domain/region/region";
import type { RegionName } from "@repo/core/domain/region/values";
import type { UnitOfWorkContext } from "../execution/unitOfWork";

/**
 * A place's affiliations (`null`: never affiliated) and the regions they
 * name, whatever their state — what the managed reads and the previews
 * (`ViewProjection.previewListing`) take.
 */
export type PlaceRegions = Readonly<{
  affiliations: PlaceAffiliations | null;
  regions: readonly Region[];
}>;

/** An affiliated region as the management screens name it. */
export type AffiliatedRegionView = Readonly<{
  id: RegionId;
  /** `null` while the region has no name (a draft or an emptied one). */
  name: RegionName | null;
}>;

/**
 * Reads the place's affiliations (`PlaceAffiliationsRepository.findById`)
 * and their regions (`RegionRepository.findByIds`, 100 ids at a time)
 * inside the caller's unit of work.
 */
export async function readPlaceRegions(
  ctx: Pick<
    UnitOfWorkContext,
    "placeAffiliationsRepository" | "regionRepository"
  >,
  placeId: PlaceId,
): Promise<PlaceRegions> {
  const found = await ctx.placeAffiliationsRepository.findById(placeId);
  if (found === null) return { affiliations: null, regions: [] };
  const regions: Region[] = [];
  for (const batch of IdBatch.chunks(
    PlaceAffiliations.regionIds(found.entity),
  )) {
    regions.push(...(await ctx.regionRepository.findByIds(batch)));
  }
  return { affiliations: found.entity, regions };
}

/**
 * The affiliated regions' ids and names in first-affiliated order, any
 * state (「所属中の地域の名称（最初に所属した順）」).
 */
export function affiliatedRegionViews(
  read: PlaceRegions,
): readonly AffiliatedRegionView[] {
  if (read.affiliations === null) return [];
  const byId = new Map(read.regions.map((region) => [region.id, region]));
  return PlaceAffiliations.regionIds(read.affiliations).flatMap((id) => {
    const region = byId.get(id);
    return region === undefined ? [] : [{ id, name: region.content.name }];
  });
}
