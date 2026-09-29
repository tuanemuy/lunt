import {
  type AccessDecision,
  AccessPolicy,
} from "@repo/core/domain/authority/accessPolicy";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { PlaceId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { Place } from "@repo/core/domain/place/place";
import { authorizeOnTarget } from "../authority/access";
import {
  type AffiliatedRegionView,
  affiliatedRegionViews,
  readPlaceRegions,
} from "../discovery/placeRegions";
import type { ActorServiceArgs } from "../types";
import { displayRefsOf, type PhotoView, photoView } from "./photos";
import { requirePlace } from "./places";

export type GetManagedPlaceInput = Readonly<{ placeId: PlaceId }>;

export type ManagedPlaceView = Readonly<{
  /** Profile, operating status, suspension, dates and version. */
  place: Place;
  /** The place's photos in order, the first the cover. */
  photos: readonly PhotoView[];
  suspended: boolean;
  /** A takedown claim removed photos, until the photo order next changes. */
  photosTakenDown: boolean;
  hasSteward: boolean;
  /** `manage_target` for the actor: whether, and as what, they may manage it. */
  management: AccessDecision;
  /** Regions the place belongs to (any state), first affiliation first. */
  regions: readonly AffiliatedRegionView[];
}>;

/**
 * Reads one place for its management, suspended or not (SHP-05–07,
 * SHP-13, LST-01, LST-15, LST-16, MOD-08, MOD-09): its stewards, and
 * operators whether or not it has stewards (`inspect_target`). Whether
 * the actor may act on it is `manage_target`'s decision, returned as is.
 *
 * - `ForbiddenError` (`inspect_target`).
 * - `NotFoundError` without the place.
 */
export async function getManagedPlace({
  container,
  actor,
  input,
}: ActorServiceArgs<GetManagedPlaceInput>): Promise<ManagedPlaceView> {
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const access = await authorizeOnTarget(ctx, actor, "inspect_target", {
      kind: "place",
      id: input.placeId,
    });
    const found = await requirePlace(ctx, input.placeId);
    return {
      place: found.entity,
      regions: affiliatedRegionViews(
        await readPlaceRegions(ctx, input.placeId),
      ),
      hasSteward: !Stewardship.isVacant(access.stewardship),
      management: AccessPolicy.decide(access.authority, {
        kind: "manage_target",
        standing: access.standing,
      }),
    };
  });
  const photoIds = PhotoSet.photoIds(read.place.profile.photos);
  const refs = await displayRefsOf(container.photoStorage, photoIds);
  return {
    place: read.place,
    photos: photoIds.map((id) => photoView(refs, id)),
    suspended: Place.isSuspended(read.place),
    photosTakenDown: read.place.profile.photos.takenDown,
    hasSteward: read.hasSteward,
    management: read.management,
    regions: read.regions,
  };
}
