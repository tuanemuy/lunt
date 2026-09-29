import { ApplicationEvents } from "@repo/core/domain/application/events";
import { ReviewPolicy } from "@repo/core/domain/application/reviewPolicy";
import { DateRange } from "@repo/core/domain/common/dateRange";
import { GeoPoint } from "@repo/core/domain/common/geo";
import {
  type ApplicationId,
  type ListingId,
  OccasionId,
  PhotoId,
  type PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { Version } from "@repo/core/domain/common/version";
import { OccasionContent } from "@repo/core/domain/occasion/content";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import {
  Participation,
  type ParticipationDetails,
} from "@repo/core/domain/occasion/participation";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { RegionContent } from "@repo/core/domain/region/content";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { Region } from "@repo/core/domain/region/region";
import type { RequestContainer } from "../../di/types";
import type { GeneratedId } from "../../ports/idGenerator";
import { approveAffiliation } from "../approveAffiliation";
import { approveLeave } from "../approveLeave";
import { approveParticipation } from "../approveParticipation";
import {
  type ActingAs,
  type MembershipKind,
  submitAffiliationChange,
} from "../submitAffiliationChange";
import { submitParticipation } from "../submitParticipation";
import type { Person } from "./kit";
import { reviewKit } from "./reviewKit";

/** The testcases' 10/1 etc.: days of October 2026 (「今日」 is 2026-07-10). */
export const oct = (day: number): LocalDate =>
  LocalDate.parse(`2026-10-${String(day).padStart(2, "0")}`);

const DAY_MS = 24 * 60 * 60 * 1000;

/** The period the steward-seat testcases state: 7 days. */
export const WEEK_REVIEW_POLICY = ReviewPolicy.create({
  proxyAfterMs: 7 * DAY_MS,
});

export type OccasionSpec = Readonly<{
  name?: string;
  /** Defaults to 10/1〜10/3; `null` for none (a draft). */
  period?: readonly [LocalDate, LocalDate] | null;
  state?: "draft" | "published" | "unpublished";
  suspended?: boolean;
  cancelled?: boolean;
}>;

export type RegionSpec = Readonly<{
  name?: string;
  state?: "draft" | "published" | "unpublished";
  suspended?: boolean;
}>;

export type StewardSeatKit = Awaited<ReturnType<typeof stewardSeatKit>>;

/**
 * Application's kit for the steward-seat kinds (所属, 離脱, 参加): the
 * review kit (operator `O`, decisions, the stage-2 submissions) on a
 * container whose review period is 7 days (`week`), plus regions and
 * occasions written straight through their repositories, their stewards,
 * affiliations and participations as other usecases leave them, and the
 * submissions and approvals of these kinds as one-line calls.
 */
export async function stewardSeatKit() {
  const k = await reviewKit();
  const { run, newId } = k;
  const week: RequestContainer = {
    ...k.container,
    reviewPolicy: WEEK_REVIEW_POLICY,
  };

  /** Moves the clock `days` days on. */
  const passDays = (days: number): void => k.clock.advance(days * DAY_MS);

  // --- regions ---------------------------------------------------------------

  async function addRegion(spec: RegionSpec = {}): Promise<RegionId> {
    const id = RegionId.create(newId());
    const now = k.tick();
    let entity: Region = Region.register(
      {
        id,
        content: RegionContent.create({
          name: spec.name ?? "城下町",
          address: SampleAddress.otemachi(),
          location: GeoPoint.create(35.6848, 139.7639),
          photoIds: [PhotoId.create(newId())],
          description: null,
          tagline: null,
        }),
      },
      now,
    ).entity;
    const state = spec.state ?? "published";
    if (state !== "draft") entity = Region.publish(entity, now).entity;
    if (state === "unpublished") entity = Region.unpublish(entity, now).entity;
    if (spec.suspended) entity = Region.suspend(entity, now).entity;
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

  const suspendRegion = (id: RegionId) =>
    changeRegion(id, (r, now) => Region.suspend(r, now).entity);

  const regionRef = (id: RegionId) => ({ kind: "region", id }) as const;

  /** A new person stewarding the region (地域運営者). */
  async function regionSteward(id: RegionId, label?: string): Promise<Person> {
    const who = await k.person(label);
    await k.appoint(regionRef(id), who);
    return who;
  }

  // --- affiliations ----------------------------------------------------------

  async function writeAffiliations(
    placeId: PlaceId,
    change: (a: PlaceAffiliations, now: Date) => PlaceAffiliations,
  ): Promise<void> {
    await run(async ({ placeAffiliationsRepository }) => {
      const read = await placeAffiliationsRepository.findById(placeId);
      const now = k.tick();
      const next = change(
        read?.entity ?? PlaceAffiliations.empty(placeId, now),
        now,
      );
      if (read === null) await placeAffiliationsRepository.insert(next);
      else await placeAffiliationsRepository.save(next, read.expectedVersion);
    });
  }

  /** Stores the place's affiliations with the regions, in order (approvals' outcome). */
  const affiliate = (placeId: PlaceId, ...regionIds: readonly RegionId[]) =>
    writeAffiliations(placeId, (a, now) =>
      regionIds.reduce(
        (acc, regionId) =>
          PlaceAffiliations.affiliate(acc, regionId, now).entity,
        a,
      ),
    );

  /** The region's operator excludes the place (`excludeAffiliatedPlace`'s outcome). */
  const exclude = (placeId: PlaceId, regionId: RegionId) =>
    writeAffiliations(
      placeId,
      (a, now) => PlaceAffiliations.exclude(a, regionId, now).entity,
    );

  /**
   * Stores `regionId` as the chosen representative — also when it is the
   * first affiliation, which `chooseRepresentative` would refuse as
   * already the representative.
   */
  const choose = (placeId: PlaceId, regionId: RegionId) =>
    writeAffiliations(placeId, (a, now) => ({
      ...a,
      chosenRepresentative: regionId,
      version: Version.next(a.version),
      updatedAt: now,
    }));

  async function affiliations(
    placeId: PlaceId,
  ): Promise<PlaceAffiliations | null> {
    const read = await run(({ placeAffiliationsRepository }) =>
      placeAffiliationsRepository.findById(placeId),
    );
    return read?.entity ?? null;
  }

  const affiliatedRegions = async (placeId: PlaceId) =>
    (await affiliations(placeId))?.affiliations.map((a) => a.regionId) ?? [];

  // --- occasions -------------------------------------------------------------

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

  /** An occasion; published, 10/1〜10/3 (upcoming) by default. */
  async function addOccasion(spec: OccasionSpec = {}): Promise<OccasionId> {
    const id = OccasionId.create(newId());
    const now = k.tick();
    let entity: Occasion = Occasion.register(
      { id, content: occasionContent(spec) },
      now,
    ).entity;
    const state = spec.state ?? "published";
    if (state !== "draft") entity = Occasion.publish(entity, now).entity;
    if (state === "unpublished") {
      entity = Occasion.unpublish(entity, now).entity;
    }
    if (spec.cancelled) entity = Occasion.cancel(entity, now).entity;
    if (spec.suspended) entity = Occasion.suspend(entity, now).entity;
    const stored = entity;
    await run(({ occasionRepository }) => occasionRepository.insert(stored));
    return id;
  }

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

  /** The occasion's period becomes `start`〜`end` (`null` clears it). */
  const setPeriod = (
    id: OccasionId,
    range: readonly [LocalDate, LocalDate] | null,
  ) =>
    changeOccasion(
      id,
      (o, now) =>
        Occasion.updateContent(
          o,
          {
            ...o.content,
            period: range === null ? null : DateRange.create(...range),
          },
          now,
        ).entity,
    );

  const cancelOccasion = (id: OccasionId) =>
    changeOccasion(id, (o, now) => Occasion.cancel(o, now).entity);

  const revokeCancellation = (id: OccasionId) =>
    changeOccasion(id, (o, now) => Occasion.revokeCancellation(o, now).entity);

  const suspendOccasion = (id: OccasionId) =>
    changeOccasion(id, (o, now) => Occasion.suspend(o, now).entity);

  const unpublishOccasion = (id: OccasionId) =>
    changeOccasion(id, (o, now) => Occasion.unpublish(o, now).entity);

  const occasionRef = (id: OccasionId) => ({ kind: "occasion", id }) as const;

  /** A new person stewarding the occasion (イベント運営者). */
  async function organizer(id: OccasionId, label?: string): Promise<Person> {
    const who = await k.person(label);
    await k.appoint(occasionRef(id), who);
    return who;
  }

  // --- participations --------------------------------------------------------

  /** Stores the place's participation (an approval's or a direct addition's outcome). */
  async function participate(
    occasionId: OccasionId,
    placeId: PlaceId,
    details: ParticipationDetails = { listingIds: [], dates: [] },
  ): Promise<void> {
    const { entity } = Participation.establish(
      { key: { occasionId, placeId }, details },
      k.tick(),
    );
    await run(({ participationRepository }) =>
      participationRepository.insert(entity),
    );
  }

  async function participation(occasionId: OccasionId, placeId: PlaceId) {
    const found = await run(({ participationRepository }) =>
      participationRepository.findById({ occasionId, placeId }),
    );
    return found?.entity ?? null;
  }

  // --- submissions -----------------------------------------------------------

  type MembershipInput = Readonly<{
    placeId: PlaceId;
    regionId: RegionId;
    id?: GeneratedId;
    container?: RequestContainer;
  }>;

  const membership =
    (kind: MembershipKind, actingAs: ActingAs) =>
    (who: Person, input: MembershipInput) =>
      submitAffiliationChange({
        container: input.container ?? k.container,
        actor: who.actor,
        input: {
          applicationId: input.id ?? k.newApplicationId(),
          kind,
          actingAs,
          placeId: input.placeId,
          regionId: input.regionId,
        },
      });

  const participationApp = (
    who: Person,
    input: Readonly<{
      placeId: PlaceId;
      occasionId: OccasionId;
      listingIds?: readonly ListingId[];
      dates?: readonly LocalDate[];
      id?: GeneratedId;
      container?: RequestContainer;
    }>,
  ) =>
    submitParticipation({
      container: input.container ?? k.container,
      actor: who.actor,
      input: {
        applicationId: input.id ?? k.newApplicationId(),
        placeId: input.placeId,
        occasionId: input.occasionId,
        listingIds: input.listingIds ?? [],
        dates: input.dates ?? [],
      },
    });

  // --- approvals -------------------------------------------------------------

  type Options = Readonly<{ version?: Version; container?: RequestContainer }>;

  const approver =
    (usecase: typeof approveAffiliation) =>
    (who: Person, id: ApplicationId, options: Options = {}) =>
      k.approveAs(usecase, who, id, {
        ...options,
        container: options.container ?? week,
      });

  /** `application.approved` of `id` as the relay delivers it. */
  const approvedEvent = async (id: ApplicationId) =>
    k.delivered(
      ApplicationEvents.approved(
        id,
        (await k.app(id)).target.applicant,
        k.tick(),
      ),
    );

  return {
    ...k,
    week,
    passDays,
    addRegion,
    changeRegion,
    suspendRegion,
    regionRef,
    regionSteward,
    affiliate,
    exclude,
    choose,
    affiliations,
    affiliatedRegions,
    addOccasion,
    changeOccasion,
    setPeriod,
    cancelOccasion,
    revokeCancellation,
    suspendOccasion,
    unpublishOccasion,
    occasionRef,
    organizer,
    participate,
    participation,
    affiliateAsPlace: membership("affiliation", "steward"),
    leaveAsPlace: membership("leave", "steward"),
    affiliateAsIndividual: membership("affiliation", "individual"),
    leaveAsIndividual: membership("leave", "individual"),
    participationApp,
    approveAffiliationAs: approver(approveAffiliation),
    approveLeaveAs: approver(approveLeave),
    approveParticipationAs: approver(approveParticipation),
    approvedEvent,
  };
}
