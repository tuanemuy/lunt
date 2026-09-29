import { DateRange } from "@repo/core/domain/common/dateRange";
import { GeoPoint } from "@repo/core/domain/common/geo";
import {
  ListingId,
  OccasionId,
  PhotoId,
  type PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { Version } from "@repo/core/domain/common/version";
import { OccasionContent } from "@repo/core/domain/occasion/content";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import {
  Participation,
  type ParticipationKey,
} from "@repo/core/domain/occasion/participation";
import {
  RegionLink,
  type RegionLinkKey,
} from "@repo/core/domain/occasion/regionLink";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { Place } from "@repo/core/domain/place/place";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { RegionContent } from "@repo/core/domain/region/content";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { Region } from "@repo/core/domain/region/region";
import type { Person } from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import {
  listingKit,
  period as offeringPeriod,
} from "../../listing/__tests__/kit";
import { addParticipationDirectly } from "../addParticipationDirectly";
import { changeParticipationByOccasion } from "../changeParticipationByOccasion";
import { changeParticipationByPlace } from "../changeParticipationByPlace";
import { detachRegionLink } from "../detachRegionLink";
import { excludeParticipant } from "../excludeParticipant";
import { linkRegion } from "../linkRegion";
import { restoreRegionLink } from "../restoreRegionLink";
import { unlinkRegion } from "../unlinkRegion";
import { withdrawParticipation } from "../withdrawParticipation";

/** The testcases' 10/1 etc.: days of October 2026 (「今日」 is 2026-07-10). */
export const oct = (day: number): LocalDate =>
  LocalDate.parse(`2026-10-${String(day).padStart(2, "0")}`);

export const sep = (day: number): LocalDate =>
  LocalDate.parse(`2026-09-${String(day).padStart(2, "0")}`);

export type OccasionState = "draft" | "published" | "unpublished";

export type OccasionSpec = Readonly<{
  name?: string;
  /** Defaults to 10/1〜10/3. `null` leaves the period empty (a draft). */
  period?: readonly [LocalDate, LocalDate] | null;
  state?: OccasionState;
  suspended?: boolean;
  cancelled?: boolean;
}>;

export type RegionState = "draft" | "published" | "unpublished";

export type Details = Readonly<{
  listingIds?: readonly ListingId[];
  dates?: readonly LocalDate[];
}>;

export type ParticipationKit = Awaited<ReturnType<typeof participationKit>>;

/**
 * Usecase-test kit for participations and region links: Listing's kit
 * (places, managers, operators, listings, a clock at 2026-07-10 in Japan)
 * plus occasions and regions written straight through their repositories
 * (other usecases' steps), their stewards, participations and links, and
 * runners of this file set's usecases.
 */
export async function participationKit() {
  const k = await listingKit();
  const { run, newId } = k;

  function occasionContent(spec: OccasionSpec): OccasionContent {
    const range = spec.period === undefined ? [oct(1), oct(3)] : spec.period;
    return OccasionContent.create({
      name: spec.name ?? "秋祭り",
      period: range === null ? null : { start: range[0], end: range[1] },
      venue: {
        address: SampleAddress.otemachi(),
        location: GeoPoint.create(35.6848, 139.7639),
      },
      photoIds: [PhotoId.create(newId())],
      description: null,
      tagline: null,
    });
  }

  /** An occasion in the given state; published, 10/1〜10/3 by default. */
  async function occasion(spec: OccasionSpec = {}): Promise<OccasionId> {
    const id = OccasionId.create(newId());
    const now = k.tick();
    let entity: Occasion = Occasion.register(
      { id, content: occasionContent(spec) },
      now,
    ).entity;
    const state = spec.state ?? "published";
    if (state !== "draft") entity = Occasion.publish(entity, now).entity;
    if (state === "unpublished")
      entity = Occasion.unpublish(entity, now).entity;
    if (spec.cancelled) entity = Occasion.cancel(entity, now).entity;
    if (spec.suspended) entity = Occasion.suspend(entity, now).entity;
    const stored = entity;
    await run(({ occasionRepository }) => occasionRepository.insert(stored));
    return id;
  }

  async function storedOccasion(id: OccasionId): Promise<Occasion> {
    const found = await run(({ occasionRepository }) =>
      occasionRepository.findById(id),
    );
    if (found === null) throw new Error(`no occasion ${id}`);
    return found.entity;
  }

  /** Writes a change of the occasion straight through the repository. */
  async function changeOccasion(
    id: OccasionId,
    change: (occasion: Occasion, now: Date) => Occasion,
  ): Promise<void> {
    await run(async ({ occasionRepository }) => {
      const read = await occasionRepository.findById(id);
      if (read === null) throw new Error(`no occasion ${id}`);
      await occasionRepository.save(
        change(read.entity, k.tick()),
        read.expectedVersion,
      );
    });
  }

  /** 延期: the occasion's period becomes `start`〜`end`. */
  const postpone = (id: OccasionId, start: LocalDate, end: LocalDate) =>
    changeOccasion(id, (occasion, now) => {
      const c = occasion.content;
      return Occasion.updateContent(
        occasion,
        { ...c, period: DateRange.create(start, end) },
        now,
      ).entity;
    });

  const occasionRef = (id: OccasionId) => ({ kind: "occasion", id }) as const;
  const regionRef = (id: RegionId) => ({ kind: "region", id }) as const;

  /** A new person stewarding the occasion (イベント運営者). */
  async function organizer(id: OccasionId, label?: string): Promise<Person> {
    const who = await k.person(label);
    await k.appoint(occasionRef(id), who);
    return who;
  }

  /** A new person stewarding the region (地域運営者). */
  async function regionSteward(id: RegionId, label?: string): Promise<Person> {
    const who = await k.person(label);
    await k.appoint(regionRef(id), who);
    return who;
  }

  /** A region in the given state; published by default. */
  async function region(
    state: RegionState = "published",
    options: Readonly<{ suspended?: boolean; name?: string }> = {},
  ): Promise<RegionId> {
    const id = RegionId.create(newId());
    const now = k.tick();
    let entity: Region = Region.register(
      {
        id,
        content: RegionContent.create({
          name: options.name ?? "城下町",
          address: SampleAddress.otemachi(),
          location: GeoPoint.create(35.6848, 139.7639),
          photoIds: [PhotoId.create(newId())],
          description: null,
          tagline: null,
        }),
      },
      now,
    ).entity;
    if (state !== "draft") entity = Region.publish(entity, now).entity;
    if (state === "unpublished") entity = Region.unpublish(entity, now).entity;
    if (options.suspended) entity = Region.suspend(entity, now).entity;
    const stored = entity;
    await run(({ regionRepository }) => regionRepository.insert(stored));
    return id;
  }

  async function changeRegion(
    id: RegionId,
    change: (region: Region, now: Date) => Region,
  ): Promise<void> {
    await run(async ({ regionRepository }) => {
      const read = await regionRepository.findById(id);
      if (read === null) throw new Error(`no region ${id}`);
      await regionRepository.save(
        change(read.entity, k.tick()),
        read.expectedVersion,
      );
    });
  }

  /** Stores the place's affiliation with the region (an approved application). */
  async function affiliate(
    placeId: PlaceId,
    regionId: RegionId,
  ): Promise<void> {
    await run(async ({ placeAffiliationsRepository }) => {
      const read = await placeAffiliationsRepository.findById(placeId);
      const now = k.tick();
      const next = PlaceAffiliations.affiliate(
        read?.entity ?? PlaceAffiliations.empty(placeId, now),
        regionId,
        now,
      ).entity;
      if (read === null) await placeAffiliationsRepository.insert(next);
      else await placeAffiliationsRepository.save(next, read.expectedVersion);
    });
  }

  async function affiliations(placeId: PlaceId) {
    const read = await run(({ placeAffiliationsRepository }) =>
      placeAffiliationsRepository.findById(placeId),
    );
    return read?.entity ?? null;
  }

  async function changePlace(
    id: PlaceId,
    change: (place: Place, now: Date) => Place,
  ): Promise<void> {
    await run(async ({ placeRepository }) => {
      const read = await placeRepository.findById(id);
      if (read === null) throw new Error(`no place ${id}`);
      await placeRepository.save(
        change(read.entity, k.tick()),
        read.expectedVersion,
      );
    });
  }

  const setOperatingStatus = (id: PlaceId, status: OperatingStatus) =>
    changePlace(
      id,
      (place, now) => Place.changeOperatingStatus(place, status, now).entity,
    );

  /** A participation as an approved application establishes it (with its event). */
  async function approved(
    occasionId: OccasionId,
    placeId: PlaceId,
    details: Details = {},
  ): Promise<void> {
    const { entity, eventDrafts } = Participation.establish(
      {
        key: { occasionId, placeId },
        details: {
          listingIds: details.listingIds ?? [],
          dates: [...(details.dates ?? [])].sort(LocalDate.compare),
        },
      },
      k.tick(),
    );
    await run(async ({ participationRepository, collectEvents }) => {
      await participationRepository.insert(entity);
      collectEvents(eventDrafts);
    });
  }

  async function findParticipation(key: ParticipationKey) {
    return run(({ participationRepository }) =>
      participationRepository.findById(key),
    );
  }

  async function storedParticipation(key: ParticipationKey) {
    const found = await findParticipation(key);
    if (found === null) throw new Error("no participation");
    return found;
  }

  /** A `linked` region link written straight through the repository. */
  async function linked(occasionId: OccasionId, regionId: RegionId) {
    const { entity } = RegionLink.link(
      null,
      { occasionId, regionId },
      { regionViewable: true },
      k.tick(),
    );
    await run(({ regionLinkRepository }) =>
      regionLinkRepository.insert(entity),
    );
  }

  async function findLink(key: RegionLinkKey) {
    const found = await run(({ regionLinkRepository }) =>
      regionLinkRepository.findById(key),
    );
    return found?.entity ?? null;
  }

  /** A listing of the place that was deleted after being attached. */
  const absentListingId = (): ListingId => ListingId.create(newId());

  /** 提供開始前: a published listing whose offering starts after today. */
  const upcoming = (who: Person, placeId: PlaceId) =>
    k.published(who, placeId, {
      offering: offeringPeriod("2026-12-01", null),
    });

  /** 提供終了: a published listing whose offering was ended by hand. */
  async function ended(who: Person, placeId: PlaceId) {
    const listing = await k.published(who, placeId);
    await k.end(who, listing.id);
    return listing;
  }

  /** 一時非公開: a listing its manager unpublished. */
  async function unpublished(who: Person, placeId: PlaceId) {
    const listing = await k.published(who, placeId);
    await k.unpublish(who, listing.id);
    return listing;
  }

  type Pair = Readonly<{ occasionId: OccasionId; placeId: PlaceId }>;
  type LinkPair = Readonly<{ occasionId: OccasionId; regionId: RegionId }>;

  const add = (
    who: Person,
    pair: Pair,
    details: Details = {},
    over: RequestContainer = k.container,
  ) =>
    addParticipationDirectly({
      container: over,
      actor: who.actor,
      input: {
        ...pair,
        listingIds: details.listingIds ?? [],
        dates: details.dates ?? [],
      },
    });

  async function versionOf(pair: Pair) {
    return (await storedParticipation(pair)).entity.version;
  }

  const byPlace = async (
    who: Person,
    pair: Pair,
    details: Details,
    options: Readonly<{ version?: Version; over?: RequestContainer }> = {},
  ) =>
    changeParticipationByPlace({
      container: options.over ?? k.container,
      actor: who.actor,
      input: {
        ...pair,
        version: options.version ?? (await versionOf(pair)),
        listingIds: details.listingIds ?? [],
        dates: details.dates ?? [],
      },
    });

  const byOccasion = async (
    who: Person,
    pair: Pair,
    details: Details,
    options: Readonly<{ version?: Version; over?: RequestContainer }> = {},
  ) =>
    changeParticipationByOccasion({
      container: options.over ?? k.container,
      actor: who.actor,
      input: {
        ...pair,
        version: options.version ?? (await versionOf(pair)),
        listingIds: details.listingIds ?? [],
        dates: details.dates ?? [],
      },
    });

  const withdraw = (who: Person, pair: Pair, over = k.container) =>
    withdrawParticipation({ container: over, actor: who.actor, input: pair });

  const exclude = (who: Person, pair: Pair, over = k.container) =>
    excludeParticipant({ container: over, actor: who.actor, input: pair });

  const link = (who: Person, pair: LinkPair, over = k.container) =>
    linkRegion({ container: over, actor: who.actor, input: pair });

  const unlink = (who: Person, pair: LinkPair, over = k.container) =>
    unlinkRegion({ container: over, actor: who.actor, input: pair });

  const detach = (who: Person, pair: LinkPair, over = k.container) =>
    detachRegionLink({ container: over, actor: who.actor, input: pair });

  const restore = (who: Person, pair: LinkPair, over = k.container) =>
    restoreRegionLink({ container: over, actor: who.actor, input: pair });

  return {
    ...k,
    occasion,
    storedOccasion,
    changeOccasion,
    postpone,
    occasionRef,
    regionRef,
    organizer,
    regionSteward,
    region,
    changeRegion,
    changePlace,
    affiliate,
    affiliations,
    setOperatingStatus,
    approved,
    findParticipation,
    storedParticipation,
    linked,
    findLink,
    absentListingId,
    upcoming,
    ended,
    unpublished,
    add,
    byPlace,
    byOccasion,
    withdraw,
    exclude,
    link,
    unlink,
    detach,
    restore,
  };
}
