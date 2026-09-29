import type { Address } from "@repo/core/domain/common/address";
import { GeoPoint } from "@repo/core/domain/common/geo";
import {
  ListingId,
  OccasionId,
  PhotoId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { OccasionContent } from "../content";
import {
  Occasion,
  type PublishedOccasion,
  type UnpublishedOccasion,
} from "../occasion";
import { Participation, type ParticipationDetails } from "../participation";
import { RegionLink } from "../regionLink";

export const day = (iso: string): LocalDate => LocalDate.parse(iso);

export const SAMPLE_LOCATION = GeoPoint.create(35.6812, 139.7671);

/** Everything `OccasionContent.create` takes, each optional. */
export type OccasionSpec = Readonly<{
  name?: string | null;
  /** `[start, end]` as `YYYY-MM-DD`; `null` for none. */
  period?: readonly [string, string] | null;
  address?: Address | null;
  location?: GeoPoint | null;
  /** A count of fresh photos, or the photo ids themselves. */
  photos?: number | readonly PhotoId[];
  description?: string | null;
  tagline?: string | null;
}>;

/**
 * Occasions, participations and region links built through the domain
 * (never SQL), with ids minted in ascending order (UUIDv7-shaped, as
 * adapters accept on rehydration) and a clock that moves forward on every
 * build. `seed` separates the id ranges of factories used side by side.
 */
export function occasionFactory(seed = 0x0c_0000) {
  let n = seed;
  const nextId = (): string => {
    n += 1;
    return `ffffffff-ffff-7fff-8fff-${n.toString(16).padStart(12, "0")}`;
  };
  let clock = Date.parse("2026-09-01T00:00:00.000Z");
  const tick = (): Date => {
    clock += 60_000;
    return new Date(clock);
  };
  const occasionId = (): OccasionId => OccasionId.create(nextId());
  const place = (): PlaceId => PlaceId.create(nextId());
  const region = (): RegionId => RegionId.create(nextId());
  const listing = (): ListingId => ListingId.create(nextId());
  const photo = (): PhotoId => PhotoId.create(nextId());

  /** Content; by default complete (publishable) with one photo. */
  const content = (spec: OccasionSpec = {}): OccasionContent => {
    const photos =
      spec.photos === undefined
        ? [photo()]
        : typeof spec.photos === "number"
          ? Array.from({ length: spec.photos }, photo)
          : spec.photos;
    const period =
      spec.period === undefined ? ["2026-10-01", "2026-10-03"] : spec.period;
    return OccasionContent.create({
      name: spec.name === undefined ? "イベント" : spec.name,
      period:
        period === null ? null : { start: day(period[0]), end: day(period[1]) },
      venue: {
        address:
          spec.address === undefined ? SampleAddress.otemachi() : spec.address,
        location: spec.location === undefined ? SAMPLE_LOCATION : spec.location,
      },
      photoIds: photos,
      description: spec.description ?? null,
      tagline: spec.tagline ?? null,
    });
  };

  /** A draft holding only what `spec` gives (no default fields). */
  const bare = (spec: OccasionSpec = {}): OccasionContent =>
    content({
      name: null,
      period: null,
      address: null,
      location: null,
      photos: 0,
      ...spec,
    });

  const draft = (
    spec: OccasionSpec = {},
    at: Date = tick(),
    id: OccasionId = occasionId(),
  ) => Occasion.register({ id, content: content(spec) }, at).entity;

  /** A draft holding only what `spec` gives (`bare`). */
  const bareDraft = (
    spec: OccasionSpec = {},
    at: Date = tick(),
    id: OccasionId = occasionId(),
  ) => Occasion.register({ id, content: bare(spec) }, at).entity;

  const published = (
    spec: OccasionSpec = {},
    at: Date = tick(),
    id: OccasionId = occasionId(),
  ): PublishedOccasion => Occasion.publish(draft(spec, at, id), at).entity;

  const unpublished = (
    spec: OccasionSpec = {},
    at: Date = tick(),
  ): UnpublishedOccasion => Occasion.unpublish(published(spec, at), at).entity;

  const suspended = (occasion: Occasion, at: Date = tick()): Occasion =>
    Occasion.suspend(occasion, at).entity;

  const cancelled = (occasion: Occasion, at: Date = tick()): Occasion =>
    Occasion.cancel(occasion, at).entity;

  const participation = (
    occasionIdValue: OccasionId,
    placeId: PlaceId,
    details: ParticipationDetails = { listingIds: [], dates: [] },
    at: Date = tick(),
  ): Participation =>
    Participation.establish(
      { key: { occasionId: occasionIdValue, placeId }, details },
      at,
    ).entity;

  const regionLink = (
    occasionIdValue: OccasionId,
    regionId: RegionId,
    at: Date = tick(),
  ): RegionLink =>
    RegionLink.link(
      null,
      { occasionId: occasionIdValue, regionId },
      { regionViewable: true },
      at,
    ).entity;

  const detached = (link: RegionLink, at: Date = tick()): RegionLink =>
    RegionLink.detach(link, at).entity;

  return {
    nextId,
    tick,
    occasionId,
    place,
    region,
    listing,
    photo,
    content,
    bare,
    draft,
    bareDraft,
    published,
    unpublished,
    suspended,
    cancelled,
    participation,
    regionLink,
    detached,
  };
}

export type OccasionFactory = ReturnType<typeof occasionFactory>;
