import type { PlaceId } from "@repo/core/domain/common/ids";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import type { RegionRepositories } from "@repo/core/domain/region/ports/unitOfWork";

type AffiliationsReader = Pick<
  RegionRepositories,
  "placeAffiliationsRepository"
>;

/**
 * A place's affiliations as read inside a unit of work; a place with no
 * record reads as `PlaceAffiliations.empty` with `expectedVersion: null`
 * (a write must then `insert`).
 */
export type AffiliationsAccess = Readonly<{
  affiliations: PlaceAffiliations;
  expectedVersion: ExpectedVersion<PlaceAffiliations> | null;
}>;

export async function readAffiliations(
  ctx: AffiliationsReader,
  placeId: PlaceId,
  now: Date,
): Promise<AffiliationsAccess> {
  const found = await ctx.placeAffiliationsRepository.findById(placeId);
  return found === null
    ? {
        affiliations: PlaceAffiliations.empty(placeId, now),
        expectedVersion: null,
      }
    : { affiliations: found.entity, expectedVersion: found.expectedVersion };
}

/**
 * Writes a changed aggregate: `insert` when none was stored (a place's
 * first affiliation), `save` against the version read otherwise.
 */
export function persistAffiliations(
  ctx: AffiliationsReader,
  affiliations: PlaceAffiliations,
  expectedVersion: ExpectedVersion<PlaceAffiliations> | null,
): Promise<void> {
  return expectedVersion === null
    ? ctx.placeAffiliationsRepository.insert(affiliations)
    : ctx.placeAffiliationsRepository.save(affiliations, expectedVersion);
}
