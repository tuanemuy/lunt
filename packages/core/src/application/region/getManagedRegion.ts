import {
  type AccessDecision,
  AccessPolicy,
} from "@repo/core/domain/authority/accessPolicy";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { RegionId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { VisibilityPolicy } from "@repo/core/domain/discovery/visibilityPolicy";
import type { RegionRequirement } from "@repo/core/domain/region/content";
import { Region } from "@repo/core/domain/region/region";
import { authorizeOnTarget } from "../authority/access";
import { displayRefsOf, type PhotoView, photoView } from "../place/photos";
import type { ActorServiceArgs } from "../types";
import { requireRegion } from "./regions";

export type GetManagedRegionInput = Readonly<{ regionId: RegionId }>;

export type ManagedRegionView = Readonly<{
  /** Content, publication (the `unpublished` reason included), suspension, version. */
  region: Region;
  /** The region's photos in order, the first the cover. */
  photos: readonly PhotoView[];
  suspended: boolean;
  /** Whether viewers can see it (`VisibilityPolicy.isRegionViewable`). */
  viewable: boolean;
  /** In `name`, `address`, `location`, `photos` order; empty when publishable. */
  missingRequirements: readonly RegionRequirement[];
  /** A takedown claim removed photos, until the photo order next changes. */
  photosTakenDown: boolean;
  hasSteward: boolean;
  /**
   * `manage_target` for the actor: whether, and as what (`steward` or
   * `absence_proxy`), they may manage it.
   */
  management: AccessDecision;
}>;

/**
 * Reads one region for its management (REG-06–08, REG-10, REG-11,
 * REG-13, MOD-07; the region operators' navigation): its stewards, and
 * operators whether or not it has stewards (`inspect_target`). Whether the
 * actor may manage it is `manage_target`'s decision, returned as is.
 *
 * - `NotFoundError` without the region, checked before access.
 * - `ForbiddenError` (`inspect_target`).
 */
export async function getManagedRegion({
  container,
  actor,
  input,
}: ActorServiceArgs<GetManagedRegionInput>): Promise<ManagedRegionView> {
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireRegion(ctx, input.regionId);
    const access = await authorizeOnTarget(ctx, actor, "inspect_target", {
      kind: "region",
      id: input.regionId,
    });
    return {
      region: found.entity,
      hasSteward: !Stewardship.isVacant(access.stewardship),
      management: AccessPolicy.decide(access.authority, {
        kind: "manage_target",
        standing: access.standing,
      }),
    };
  });
  const { region } = read;
  const photoIds = PhotoSet.photoIds(region.content.photos);
  const refs = await displayRefsOf(container.photoStorage, photoIds);
  return {
    region,
    photos: photoIds.map((id) => photoView(refs, id)),
    suspended: region.suspension.suspended,
    viewable: VisibilityPolicy.isRegionViewable(region),
    missingRequirements: Region.missingRequirements(region.content),
    photosTakenDown: region.content.photos.takenDown,
    hasSteward: read.hasSteward,
    management: read.management,
  };
}
