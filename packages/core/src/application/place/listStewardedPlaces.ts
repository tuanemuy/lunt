import { StewardedTargetOrder } from "@repo/core/domain/authority/stewardedTarget";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { PlaceId } from "@repo/core/domain/common/ids";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { Place } from "@repo/core/domain/place/place";
import { type PlaceName, PlaceProfile } from "@repo/core/domain/place/profile";
import type { ActorServiceArgs } from "../types";
import { displayRefsOf, type PhotoView, photoView } from "./photos";

export type StewardedPlaceView = Readonly<{
  placeId: PlaceId;
  name: PlaceName;
  cover: PhotoView | null;
  operatingStatus: OperatingStatus;
  suspended: boolean;
}>;

const PAGE_SIZE = 100;

/**
 * The places the actor stewards, suspended ones included, `PlaceId`
 * ascending (SHP-05, REG-01, EVT-01). Empty when there are none. Regions
 * and occasions the actor stewards are not places and are left out.
 */
export async function listStewardedPlaces({
  container,
  actor,
}: ActorServiceArgs<Readonly<Record<never, never>>>): Promise<
  readonly StewardedPlaceView[]
> {
  const places = await container.unitOfWorkProvider.run(async (ctx) => {
    const ids: PlaceId[] = [];
    for (let page = 1; ; page += 1) {
      const { items, count } =
        await ctx.stewardshipRepository.findPageBySteward(actor.accountId, {
          page,
          limit: PAGE_SIZE,
        });
      for (const { entity } of items) {
        if (entity.target.kind === "place") ids.push(entity.target.id);
      }
      if (items.length === 0 || page * PAGE_SIZE >= count) break;
    }
    const found: Place[] = [];
    for (let i = 0; i < ids.length; i += IdBatch.maxSize) {
      found.push(
        ...(await ctx.placeRepository.findByIds(
          ids.slice(i, i + IdBatch.maxSize),
        )),
      );
    }
    return found.sort((a, b) =>
      StewardedTargetOrder.compare(Place.ref(a), Place.ref(b)),
    );
  });
  const covers = places.flatMap((place) => {
    const cover = PlaceProfile.cover(place.profile);
    return cover === null ? [] : [cover];
  });
  const refs = await displayRefsOf(container.photoStorage, covers);
  return places.map((place) => {
    const cover = PlaceProfile.cover(place.profile);
    return {
      placeId: place.id,
      name: place.profile.name,
      cover: cover === null ? null : photoView(refs, cover),
      operatingStatus: place.operatingStatus,
      suspended: Place.isSuspended(place),
    };
  });
}
