import type { TownRef } from "@repo/core/domain/area/townRef";
import { GeoPoint } from "@repo/core/domain/common/geo";
import type { PhotoId, RegionId } from "@repo/core/domain/common/ids";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import type { Version } from "@repo/core/domain/common/version";
import {
  RegionContent,
  type RegionRequirement,
} from "@repo/core/domain/region/content";
import type { RegionRepositories } from "@repo/core/domain/region/ports/unitOfWork";
import { Region } from "@repo/core/domain/region/region";
import { resolveAddress } from "../area/resolveAddress";
import type { RequestContainer } from "../di/types";
import { ConflictError, NotFoundError } from "../errors";

export const REGION_NOT_FOUND = "REGION_NOT_FOUND";
/** The edit started from a version someone else has saved over since. */
export const REGION_VERSION_CONFLICT = "REGION_VERSION_CONFLICT";

/**
 * A region's whole content as entered. Every field may be left empty: the
 * address is the picked town plus the part after it, or `null`.
 */
export type RegionContentFields = Readonly<{
  name: string | null;
  address: Readonly<{ town: TownRef; rest: string }> | null;
  location: Readonly<{ latitude: number; longitude: number }> | null;
  /** Display order; the first is the cover. */
  photoIds: readonly PhotoId[];
  description: string | null;
  tagline: string | null;
}>;

/**
 * Resolves the town (`AREA_TOWN_NOT_FOUND`) and builds the content's value
 * objects (`REGION_INVALID_NAME`, `REGION_DUPLICATE_PHOTO`,
 * `COMMON_INVALID_GEO_POINT`, …). Called before the unit of work.
 */
export async function buildRegionContent(
  container: Pick<RequestContainer, "areaCatalog">,
  fields: RegionContentFields,
): Promise<RegionContent> {
  const address =
    fields.address === null
      ? null
      : await resolveAddress(
          container.areaCatalog,
          fields.address.town,
          fields.address.rest,
        );
  return RegionContent.create({
    name: fields.name,
    address,
    location:
      fields.location === null
        ? null
        : GeoPoint.create(fields.location.latitude, fields.location.longitude),
    photoIds: fields.photoIds,
    description: fields.description,
    tagline: fields.tagline,
  });
}

/** The region with its version token; `NotFoundError` when there is none. */
export async function requireRegion(
  ctx: Pick<RegionRepositories, "regionRepository">,
  id: RegionId,
): Promise<Versioned<Region>> {
  const found = await ctx.regionRepository.findById(id);
  if (found === null) {
    throw new NotFoundError(REGION_NOT_FOUND, `Region ${id} does not exist`);
  }
  return found;
}

/**
 * 編集の競合: the version the edit started from must still be the stored
 * one, or someone else's save would be overwritten.
 */
export function assertEditedVersion(region: Region, edited: Version): void {
  if (region.version !== edited) {
    throw new ConflictError(
      REGION_VERSION_CONFLICT,
      `Region ${region.id} changed since version ${edited} was read`,
    );
  }
}

/** A region with the publish requirements its content lacks. */
export type RegionWithRequirements = Readonly<{
  region: Region;
  /** In `name`, `address`, `location`, `photos` order; empty when publishable. */
  missingRequirements: readonly RegionRequirement[];
}>;

export const withRequirements = (region: Region): RegionWithRequirements => ({
  region,
  missingRequirements: Region.missingRequirements(region.content),
});
