import type { RegionId } from "@repo/core/domain/common/ids";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import type { OccasionRepositories } from "@repo/core/domain/occasion/ports/unitOfWork";
import type {
  RegionLink,
  RegionLinkKey,
  RegionLinkStatus,
} from "@repo/core/domain/occasion/regionLink";
import { NotFoundError } from "../errors";

export const REGION_LINK_NOT_FOUND = "REGION_LINK_NOT_FOUND";

/** The pair's link, linked or detached; `NotFoundError` when there is none. */
export async function requireRegionLink(
  ctx: Pick<OccasionRepositories, "regionLinkRepository">,
  key: RegionLinkKey,
): Promise<Versioned<RegionLink>> {
  const found = await ctx.regionLinkRepository.findById(key);
  if (found === null) {
    throw new NotFoundError(
      REGION_LINK_NOT_FOUND,
      `Occasion ${key.occasionId} has no link to region ${key.regionId}`,
    );
  }
  return found;
}

/** A link as the writes on it answer. */
export type RegionLinkView = Readonly<{
  occasionId: RegionLinkKey["occasionId"];
  regionId: RegionId;
  status: RegionLinkStatus;
  /** When it was first linked; a restore keeps it. */
  linkedAt: Date;
}>;

export const regionLinkView = (link: RegionLink): RegionLinkView => ({
  occasionId: link.key.occasionId,
  regionId: link.key.regionId,
  status: link.status,
  linkedAt: link.linkedAt,
});
