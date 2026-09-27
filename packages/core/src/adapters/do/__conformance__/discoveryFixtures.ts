import type { PlaceId } from "@repo/core/domain/common/ids";
import type { PlaceEntry } from "@repo/core/domain/discovery/entry";
import type { DetailQueries } from "@repo/core/domain/discovery/ports/detailQueries";
import type { ReferenceQueries } from "@repo/core/domain/discovery/ports/referenceQueries";
import { ViewProjection } from "@repo/core/domain/discovery/viewProjection";
import {
  Listing,
  type PublishedListing,
} from "@repo/core/domain/listing/listing";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { Place } from "@repo/core/domain/place/place";
import type { PlaceProfileInput } from "@repo/core/domain/place/profile";
import type { ConformanceHarness } from "./harness";
import { insertListings, listingFactory, period } from "./listingFixtures";
import { insertPlaces, newPlace, PLACE_T0 } from "./placeFixtures";

/** A fresh store plus Discovery's read ports over it. */
export type DiscoveryHarness = ConformanceHarness &
  Readonly<{
    detailQueries: DetailQueries;
    referenceQueries: ReferenceQueries;
  }>;

export type DiscoveryHarnessFactory = () => Promise<DiscoveryHarness>;

/** The 「今日」 of the Discovery suites: the listing fixtures' day. */
export { TODAY } from "./listingFixtures";

export type PlaceSpec = Readonly<{
  status?: OperatingStatus;
  photos?: number;
  suspended?: boolean;
  /** Other profile fields (`PlaceProfile.create` input). */
  profile?: Partial<Omit<PlaceProfileInput, "photoIds">>;
}>;

/**
 * Places and listings built through their domains and stored through their
 * repositories (never SQL), with one id source so ids ascend in mint order
 * and every later listing is published later.
 */
export function discoveryWorld(h: DiscoveryHarness) {
  const f = listingFactory();

  const buildPlace = (spec: PlaceSpec = {}): Place => {
    const registered = newPlace(f.place(), {
      ...spec.profile,
      photoIds: Array.from(
        { length: spec.photos ?? 0 },
        () => f.photo().photoId,
      ),
    });
    const operating =
      spec.status === undefined || spec.status === "open"
        ? registered
        : Place.changeOperatingStatus(registered, spec.status, PLACE_T0).entity;
    return spec.suspended === true
      ? Place.suspend(operating, PLACE_T0).entity
      : operating;
  };

  const place = async (spec: PlaceSpec = {}): Promise<Place> => {
    const built = buildPlace(spec);
    await insertPlaces(h, built);
    return built;
  };

  const store = async <L extends Listing>(listing: L): Promise<L> => {
    await insertListings(h, listing);
    return listing;
  };

  /** Published and available on `TODAY` (no offering set). */
  const available = (placeId: PlaceId, at?: Date) =>
    store(f.published(placeId, {}, at));

  /** Published, starting after `TODAY`. */
  const upcoming = (placeId: PlaceId, startsOn = "2026-07-20") =>
    store(f.published(placeId, { offering: period(startsOn, null) }));

  /** Published, its period over before `TODAY`. */
  const endedBySchedule = (placeId: PlaceId) =>
    store(f.published(placeId, { offering: period(null, "2026-07-01") }));

  /** Published, ended by its manager. */
  const endedByHand = (placeId: PlaceId) => store(f.manuallyEnded(placeId));

  const draft = (placeId: PlaceId) => store(f.draft(placeId));

  const unpublished = (placeId: PlaceId) => store(f.unpublished(placeId));

  /** Published, then unpublished because every photo was taken down. */
  const takenDown = (placeId: PlaceId) => {
    const published = f.published(placeId);
    const [photo] = published.content.photos.items;
    return store(
      Listing.takeDownPhotos(published, [photo.photoId], f.tick()).entity,
    );
  };

  /** Published, then suspended by the operator. */
  const suspendedListing = (placeId: PlaceId) =>
    store(f.suspended(f.published(placeId)));

  /** Saves `change(stored)` against the version read. */
  const updateListing = async (
    listing: Listing,
    change: (stored: Listing) => Listing,
  ): Promise<Listing> =>
    h.uow.run(async ({ listingRepository }) => {
      const read = await listingRepository.findById(listing.id);
      if (read === null) throw new Error(`no listing ${listing.id}`);
      const next = change(read.entity);
      await listingRepository.save(next, read.expectedVersion);
      return next;
    });

  const updatePlace = async (
    place: Place,
    change: (stored: Place) => Place,
  ): Promise<Place> =>
    h.uow.run(async ({ placeRepository }) => {
      const read = await placeRepository.findById(place.id);
      if (read === null) throw new Error(`no place ${place.id}`);
      const next = change(read.entity);
      await placeRepository.save(next, read.expectedVersion);
      return next;
    });

  const deleteListing = (listing: Listing): Promise<void> =>
    h.uow.run(async ({ listingRepository }) => {
      const read = await listingRepository.findById(listing.id);
      if (read === null) throw new Error(`no listing ${listing.id}`);
      await listingRepository.delete(listing.id, read.expectedVersion);
    });

  /** The entry the port must return, by `ViewProjection.placeEntry`. */
  const entryOf = (p: Place, listings: readonly Listing[] = []): PlaceEntry =>
    ViewProjection.placeEntry(p, null, [], listings);

  return {
    f,
    buildPlace,
    place,
    store,
    available,
    upcoming,
    endedBySchedule,
    endedByHand,
    draft,
    unpublished,
    takenDown,
    suspendedListing,
    updateListing,
    updatePlace,
    deleteListing,
    entryOf,
    suspendPlace: (p: Place) =>
      updatePlace(p, (stored) => Place.suspend(stored, PLACE_T0).entity),
    unsuspendPlace: (p: Place) =>
      updatePlace(p, (stored) => Place.unsuspend(stored, PLACE_T0).entity),
  };
}

export type DiscoveryWorld = ReturnType<typeof discoveryWorld>;

export const listingIdsOf = (
  entries: readonly Readonly<{ listing: PublishedListing }>[],
) => entries.map((entry) => entry.listing.id);
