import type { GeoPoint } from "@repo/core/domain/common/geo";
import type {
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { PlaceEntry } from "@repo/core/domain/discovery/entry";
import type { DetailQueries } from "@repo/core/domain/discovery/ports/detailQueries";
import type { ExplorationQueries } from "@repo/core/domain/discovery/ports/explorationQueries";
import type { FeedCandidateQueries } from "@repo/core/domain/discovery/ports/feedCandidateQueries";
import type { KeywordSearchQueries } from "@repo/core/domain/discovery/ports/keywordSearchQueries";
import type { ReferenceQueries } from "@repo/core/domain/discovery/ports/referenceQueries";
import { ViewProjection } from "@repo/core/domain/discovery/viewProjection";
import {
  Listing,
  type PublishedListing,
} from "@repo/core/domain/listing/listing";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type { Participation } from "@repo/core/domain/occasion/participation";
import { RegionLink } from "@repo/core/domain/occasion/regionLink";
import type { OccasionSpec } from "@repo/core/domain/occasion/testing/samples";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { Place } from "@repo/core/domain/place/place";
import type { PlaceProfileInput } from "@repo/core/domain/place/profile";
import type { RegionContentInput } from "@repo/core/domain/region/content";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { Region } from "@repo/core/domain/region/region";
import type { ConformanceHarness } from "./harness";
import { insertListings, listingFactory, period } from "./listingFixtures";
import {
  insertOccasions,
  insertParticipations,
  insertRegionLinks,
  occasionFactory,
} from "./occasionFixtures";
import { insertPlaces, newPlace, PLACE_T0 } from "./placeFixtures";
import {
  insertAffiliations,
  insertRegions,
  regionContent,
} from "./regionFixtures";

/** A fresh store plus Discovery's read ports over it. */
export type DiscoveryHarness = ConformanceHarness &
  Readonly<{
    detailQueries: DetailQueries;
    referenceQueries: ReferenceQueries;
    explorationQueries: ExplorationQueries;
    keywordSearchQueries: KeywordSearchQueries;
    feedCandidateQueries: FeedCandidateQueries;
  }>;

export type DiscoveryHarnessFactory = () => Promise<DiscoveryHarness>;

/** The 「今日」 of the Discovery suites: the listing fixtures' day. */
export { TODAY } from "./listingFixtures";

/**
 * Holding periods around `TODAY` (2026-07-10): upcoming, ongoing and
 * ended on that day.
 */
export const PERIODS = {
  upcoming: ["2026-07-20", "2026-07-22"],
  ongoing: ["2026-07-08", "2026-07-12"],
  ended: ["2026-07-01", "2026-07-05"],
} as const satisfies Record<string, readonly [string, string]>;

export type RegionState = "published" | "draft" | "unpublished" | "suspended";

export type RegionSpec = Readonly<{
  state?: RegionState;
  name?: string;
  location?: GeoPoint;
  /** How many photos (1 by default). */
  photos?: number;
  /** Other content (`RegionContent.create` input). */
  content?: Partial<Omit<RegionContentInput, "photoIds">>;
}>;

export type OccasionState =
  | "published"
  | "draft"
  | "unpublished"
  | "suspended"
  | "cancelled";

export type DiscoveryOccasionSpec = OccasionSpec &
  Readonly<{ state?: OccasionState }>;

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

  const o = occasionFactory();

  /** A region built through the domain, stored in `spec.state` (published by default). */
  const region = async (spec: RegionSpec = {}): Promise<Region> => {
    const at = f.tick();
    const registered = Region.register(
      {
        id: o.region(),
        content: regionContent({
          ...spec.content,
          ...(spec.name === undefined ? {} : { name: spec.name }),
          ...(spec.location === undefined ? {} : { location: spec.location }),
          photoIds: Array.from({ length: spec.photos ?? 1 }, o.photo),
        }),
      },
      at,
    ).entity;
    const state = spec.state ?? "published";
    const built =
      state === "draft"
        ? registered
        : state === "unpublished"
          ? Region.unpublish(Region.publish(registered, at).entity, at).entity
          : state === "suspended"
            ? Region.suspend(Region.publish(registered, at).entity, at).entity
            : Region.publish(registered, at).entity;
    await insertRegions(h, built);
    return built;
  };

  /** Saves `change(stored)` of the region against the version read. */
  const updateRegion = (
    target: Region,
    change: (stored: Region) => Region,
  ): Promise<Region> =>
    h.uow.run(async ({ regionRepository }) => {
      const read = await regionRepository.findById(target.id);
      if (read === null) throw new Error(`no region ${target.id}`);
      const next = change(read.entity);
      await regionRepository.save(next, read.expectedVersion);
      return next;
    });

  /**
   * Affiliates the place with `regionIds` in that order (one tick apart)
   * and, when given, chooses `representative`; stored as one aggregate.
   */
  const affiliate = async (
    placeId: PlaceId,
    regionIds: readonly RegionId[],
    representative?: RegionId,
  ): Promise<PlaceAffiliations> => {
    const joined = regionIds.reduce(
      (a, regionId) =>
        PlaceAffiliations.affiliate(a, regionId, f.tick()).entity,
      PlaceAffiliations.empty(placeId, f.tick()),
    );
    const chosen =
      representative === undefined
        ? joined
        : PlaceAffiliations.chooseRepresentative(
            joined,
            representative,
            f.tick(),
          ).entity;
    await insertAffiliations(h, chosen);
    return chosen;
  };

  /** Saves `change(stored)` of the place's affiliations against the version read. */
  const updateAffiliations = (
    placeId: PlaceId,
    change: (stored: PlaceAffiliations) => PlaceAffiliations,
  ): Promise<PlaceAffiliations> =>
    h.uow.run(async ({ placeAffiliationsRepository }) => {
      const read = await placeAffiliationsRepository.findById(placeId);
      if (read === null) throw new Error(`no affiliations of ${placeId}`);
      const next = change(read.entity);
      await placeAffiliationsRepository.save(next, read.expectedVersion);
      return next;
    });

  /**
   * An occasion built through the domain (upcoming on `TODAY` unless
   * `period` says otherwise), stored in `spec.state` (published by default).
   */
  const occasion = async (
    spec: DiscoveryOccasionSpec = {},
  ): Promise<Occasion> => {
    const { state = "published", ...content } = spec;
    const at = f.tick();
    const withPeriod = { period: PERIODS.upcoming, ...content };
    const built =
      state === "draft"
        ? o.draft(withPeriod, at)
        : state === "unpublished"
          ? o.unpublished(withPeriod, at)
          : state === "suspended"
            ? o.suspended(o.published(withPeriod, at), at)
            : state === "cancelled"
              ? o.cancelled(o.published(withPeriod, at), at)
              : o.published(withPeriod, at);
    await insertOccasions(h, built);
    return built;
  };

  /** Saves `change(stored)` of the occasion against the version read. */
  const updateOccasion = (
    target: Occasion,
    change: (stored: Occasion) => Occasion,
  ): Promise<Occasion> =>
    h.uow.run(async ({ occasionRepository }) => {
      const read = await occasionRepository.findById(target.id);
      if (read === null) throw new Error(`no occasion ${target.id}`);
      const next = change(read.entity);
      await occasionRepository.save(next, read.expectedVersion);
      return next;
    });

  /** The place takes part in the occasion (established at `at`, else a tick). */
  const participate = async (
    occasionId: OccasionId,
    placeId: PlaceId,
    details: Readonly<{
      listingIds?: readonly ListingId[];
      dates?: readonly LocalDate[];
    }> = {},
    at: Date = f.tick(),
  ): Promise<Participation> => {
    const built = o.participation(
      occasionId,
      placeId,
      { listingIds: details.listingIds ?? [], dates: details.dates ?? [] },
      at,
    );
    await insertParticipations(h, built);
    return built;
  };

  /** Removes the participation (withdrawn) against the version read. */
  const dissolveParticipation = (participation: Participation) =>
    h.uow.run(async ({ participationRepository }) => {
      const read = await participationRepository.findById(participation.key);
      if (read === null) throw new Error("no participation");
      await participationRepository.delete(
        participation.key,
        read.expectedVersion,
      );
    });

  /** Links the region to the occasion (at `at`, else a tick); `detached` detaches it at once. */
  const link = async (
    occasionId: OccasionId,
    regionId: RegionId,
    options: Readonly<{ detached?: boolean; at?: Date }> = {},
  ): Promise<RegionLink> => {
    const linked = o.regionLink(occasionId, regionId, options.at ?? f.tick());
    const built = options.detached === true ? o.detached(linked) : linked;
    await insertRegionLinks(h, built);
    return built;
  };

  /** Saves `change(stored)` of the link against the version read. */
  const updateLink = (
    target: RegionLink,
    change: (stored: RegionLink) => RegionLink,
  ): Promise<RegionLink> =>
    h.uow.run(async ({ regionLinkRepository }) => {
      const read = await regionLinkRepository.findById(target.key);
      if (read === null) throw new Error("no region link");
      const next = change(read.entity);
      await regionLinkRepository.save(next, read.expectedVersion);
      return next;
    });

  const restoreLink = (target: RegionLink) =>
    updateLink(target, (stored) => RegionLink.restore(stored, f.tick()).entity);

  const unlink = (target: RegionLink) =>
    h.uow.run(async ({ regionLinkRepository }) => {
      const read = await regionLinkRepository.findById(target.key);
      if (read === null) throw new Error("no region link");
      await regionLinkRepository.delete(
        RegionLink.unlink(read.entity),
        read.expectedVersion,
      );
    });

  /**
   * The entry the port must return, by `ViewProjection.placeEntry`: the
   * place's listings (for the substitute cover), and its affiliations and
   * the regions they may name.
   */
  const entryOf = (
    p: Place,
    listings: readonly Listing[] = [],
    ties: Readonly<{
      affiliations: PlaceAffiliations | null;
      regions: readonly Region[];
    }> = { affiliations: null, regions: [] },
  ): PlaceEntry =>
    ViewProjection.placeEntry(p, ties.affiliations, ties.regions, listings);

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
    o,
    region,
    updateRegion,
    unpublishRegion: (r: Region) =>
      updateRegion(r, (stored) => Region.unpublish(stored, f.tick()).entity),
    affiliate,
    updateAffiliations,
    occasion,
    updateOccasion,
    unpublishOccasion: (e: Occasion) =>
      updateOccasion(
        e,
        (stored) => Occasion.unpublish(stored, f.tick()).entity,
      ),
    participate,
    dissolveParticipation,
    link,
    updateLink,
    restoreLink,
    unlink,
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
