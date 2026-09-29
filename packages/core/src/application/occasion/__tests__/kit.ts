import { TownRef } from "@repo/core/domain/area/townRef";
import type { PhotoId } from "@repo/core/domain/common/ids";
import {
  OccasionId,
  PlaceId,
  type RegionId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import type { HoldingStatusRecord } from "@repo/core/domain/occasion/holdingStatusObserver";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import {
  Participation,
  type ParticipationDetails,
} from "@repo/core/domain/occasion/participation";
import { RegionLink } from "@repo/core/domain/occasion/regionLink";
import { Place } from "@repo/core/domain/place/place";
import { sampleProfile } from "@repo/core/domain/place/testing/samples";
import { authorityKit, type Person } from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { registerTestPhotos } from "../../media/__tests__/photoFixtures";
import { cancelOccasion } from "../cancelOccasion";
import { getManagedOccasion } from "../getManagedOccasion";
import type {
  ManagedOccasionView,
  OccasionContentFields,
} from "../managedOccasion";
import { publishOccasion } from "../publishOccasion";
import { recordEndedOccasions } from "../recordEndedOccasions";
import { registerOccasion } from "../registerOccasion";
import { revokeOccasionCancellation } from "../revokeOccasionCancellation";
import { suspendOccasion } from "../suspendOccasion";
import { unpublishOccasion } from "../unpublishOccasion";
import { unsuspendOccasion } from "../unsuspendOccasion";
import { updateOccasionContent } from "../updateOccasionContent";

/** 12:00 in Japan on `day` (`YYYY-MM-DD`). */
export const noonOf = (day: string): string => `${day}T03:00:00.000Z`;

/** The testcases' default 「今日」: 2026-09-30 in Japan, before the default period. */
export const TODAY = "2026-09-30";

/** The default period: 10/1〜10/3. */
export const PERIOD = { start: "2026-10-01", end: "2026-10-03" } as const;

/** Towns of 「テスト用のマスター」 (`spec/testcases/ports/areaCatalog.md`). */
export const Towns = {
  otemachi: TownRef.create({
    areaCode: "1000004",
    municipalityCode: "13101",
    name: "大手町",
  }),
  ginza: TownRef.create({
    areaCode: "1040061",
    municipalityCode: "13102",
    name: "銀座",
  }),
  /** Well-formed but not in the master. */
  missing: TownRef.create({
    areaCode: "1000009",
    municipalityCode: "13101",
    name: "存在しない町",
  }),
};

const KNOWN_TOWNS: readonly TownRef[] = [Towns.otemachi, Towns.ginza];

export const LOCATION = { latitude: 35.6848, longitude: 139.7639 } as const;

/**
 * Content fields a test overrides; the rest default to a complete
 * (publishable) occasion without photos — `register` adds a fresh photo
 * unless `photoIds` is given.
 */
export type FieldsSpec = Partial<OccasionContentFields>;

export function fields(spec: FieldsSpec = {}): OccasionContentFields {
  return {
    name: "秋のマルシェ",
    period: PERIOD,
    address: { town: Towns.otemachi, rest: "1-1" },
    location: LOCATION,
    photoIds: [],
    description: null,
    tagline: null,
    ...spec,
  };
}

/** Only the name: the other fields empty. */
export const nameOnly = (name: string): OccasionContentFields => ({
  name,
  period: null,
  address: null,
  location: null,
  photoIds: [],
  description: null,
  tagline: null,
});

/** The stored content as the fields an edit starts from. */
export function fieldsOf(occasion: Occasion): OccasionContentFields {
  const { content } = occasion;
  const { address, location } = content.venue;
  const town =
    address === null
      ? undefined
      : KNOWN_TOWNS.find(
          (ref) =>
            ref.areaCode === address.areaCode && ref.name === address.town,
        );
  if (address !== null && town === undefined) {
    throw new Error(`No test town for ${address.areaCode}`);
  }
  return {
    name: content.name,
    period:
      content.period === null
        ? null
        : { start: content.period.start, end: content.period.end },
    address:
      address === null || town === undefined
        ? null
        : { town, rest: address.rest },
    location:
      location === null
        ? null
        : { latitude: location.latitude, longitude: location.longitude },
    photoIds: PhotoSet.photoIds(content.photos),
    description: content.description,
    tagline: content.tagline,
  };
}

export type OccasionKit = Awaited<ReturnType<typeof occasionKit>>;

/**
 * Usecase-test kit for Occasion: Authority's kit (people, stewards, roles,
 * `tick`) on a container whose clock reads `today` noon in Japan,
 * occasions made through the usecases, and preconditions other domains or
 * later usecases own (places, participations, region links, takedowns)
 * written through the domain functions and the repositories.
 */
export async function occasionKit(options: Readonly<{ today?: string }> = {}) {
  const a = authorityKit();
  a.clock.set(noonOf(options.today ?? TODAY));
  const { container } = a;
  const newId = () => a.t.idGenerator.next();
  const run = container.unitOfWorkProvider.run.bind(
    container.unitOfWorkProvider,
  );

  /** Moves the clock to noon of `day` in Japan. */
  const setToday = (day: string): void => a.clock.set(noonOf(day));

  const ref = (id: OccasionId) => ({ kind: "occasion", id }) as const;

  /** A new person holding the operator role. */
  async function operator(label?: string): Promise<Person> {
    const who = await a.person(label);
    await a.operators(who);
    return who;
  }

  /** A new person stewarding the occasion (an occasion operator). */
  async function steward(occasionId: OccasionId, label?: string) {
    const who = await a.person(label);
    await a.appoint(ref(occasionId), who);
    return who;
  }

  const photos = (who: Person, count: number) =>
    registerTestPhotos(container, who.actor, count);

  async function photo(who: Person): Promise<PhotoId> {
    const [id] = await photos(who, 1);
    if (id === undefined) throw new Error("no photo");
    return id;
  }

  /**
   * An occasion registered by `who` (an operator), with a fresh photo of
   * theirs unless `spec.photoIds` is given.
   */
  async function register(
    who: Person,
    spec: FieldsSpec = {},
  ): Promise<ManagedOccasionView> {
    const photoIds = spec.photoIds ?? [await photo(who)];
    return registerOccasion({
      container,
      actor: who.actor,
      input: { occasionId: newId(), content: fields({ ...spec, photoIds }) },
    });
  }

  async function published(
    who: Person,
    spec: FieldsSpec = {},
  ): Promise<ManagedOccasionView> {
    const made = await register(who, spec);
    return publishOccasion({
      container,
      actor: who.actor,
      input: { occasionId: made.id },
    });
  }

  async function stored(id: OccasionId) {
    const found = await run(({ occasionRepository }) =>
      occasionRepository.findById(id),
    );
    if (found === null) throw new Error(`no occasion ${id}`);
    return found;
  }

  /** Writes a change straight through the repository (another domain's step). */
  async function change(
    id: OccasionId,
    fn: (occasion: Occasion, now: Date) => Occasion,
  ): Promise<Occasion> {
    const read = await stored(id);
    const next = fn(read.entity, a.tick());
    await run(({ occasionRepository }) =>
      occasionRepository.save(next, read.expectedVersion),
    );
    return next;
  }

  /** Moderation's takedown of `photoIds` from the occasion. */
  const takeDown = (
    id: OccasionId,
    photoIds: readonly [PhotoId, ...PhotoId[]],
  ) =>
    change(
      id,
      (occasion, now) =>
        Occasion.takeDownPhotos(occasion, photoIds, now).entity,
    );

  /** A stored place (Place's own step). */
  async function place(name = "店舗"): Promise<PlaceId> {
    const id = PlaceId.create(newId());
    const { entity } = Place.register(
      { id, profile: sampleProfile({ name }) },
      a.clock.now(),
    );
    await run(({ placeRepository }) => placeRepository.insert(entity));
    return id;
  }

  /** A stored participation of `placeId` (an approval's or addition's step). */
  async function participate(
    occasionId: OccasionId,
    placeId: PlaceId,
    details: ParticipationDetails = { listingIds: [], dates: [] },
  ): Promise<Participation> {
    const { entity } = Participation.establish(
      { key: { occasionId, placeId }, details },
      a.tick(),
    );
    await run(({ participationRepository }) =>
      participationRepository.insert(entity),
    );
    return entity;
  }

  async function participation(occasionId: OccasionId, placeId: PlaceId) {
    const found = await run(({ participationRepository }) =>
      participationRepository.findById({ occasionId, placeId }),
    );
    return found?.entity ?? null;
  }

  /** A stored `linked` region link (`linkRegion`'s step). */
  async function link(
    occasionId: OccasionId,
    regionId: RegionId,
  ): Promise<RegionLink> {
    const { entity } = RegionLink.link(
      null,
      { occasionId, regionId },
      { regionViewable: true },
      a.tick(),
    );
    await run(({ regionLinkRepository }) =>
      regionLinkRepository.insert(entity),
    );
    return entity;
  }

  async function regionLink(occasionId: OccasionId, regionId: RegionId) {
    const found = await run(({ regionLinkRepository }) =>
      regionLinkRepository.findById({ occasionId, regionId }),
    );
    return found?.entity ?? null;
  }

  async function photoOwner(id: PhotoId) {
    const found = await run(({ photoAssetRepository }) =>
      photoAssetRepository.findById(id),
    );
    if (found === null) return undefined;
    return found.entity.stage === "stored" ? found.entity.owner : null;
  }

  async function events(type?: string) {
    const all = await a.t.storedEvents();
    return type === undefined ? all : all.filter((e) => e.type === type);
  }

  const record = (id: OccasionId) =>
    run(({ holdingStatusLedger }) => holdingStatusLedger.find(id));

  /** Stores a holding status record as a job before would have. */
  const putRecord = (entry: HoldingStatusRecord) =>
    run(({ holdingStatusLedger }) => holdingStatusLedger.put(entry));

  /** Runs the daily job with the clock at noon of `day` (default: now). */
  async function runJob(day?: string, over: RequestContainer = container) {
    if (day !== undefined) setToday(day);
    return recordEndedOccasions(over, a.clock.now());
  }

  type Act<R> = (
    args: Readonly<{
      container: RequestContainer;
      actor: Person["actor"];
      input: Readonly<{ occasionId: OccasionId }>;
    }>,
  ) => Promise<R>;

  /** Runs a state-change usecase for `who` on `occasionId`. */
  const act =
    <R>(fn: Act<R>) =>
    (who: Person, occasionId: OccasionId, over: RequestContainer = container) =>
      fn({ container: over, actor: who.actor, input: { occasionId } });

  /** `updateOccasionContent` from the stored content with `spec` applied. */
  async function update(
    who: Person,
    occasionId: OccasionId,
    spec: FieldsSpec,
    options: Readonly<{ version?: number; over?: RequestContainer }> = {},
  ): Promise<ManagedOccasionView> {
    const { entity } = await stored(occasionId);
    return updateOccasionContent({
      container: options.over ?? container,
      actor: who.actor,
      input: {
        occasionId,
        version: options.version ?? entity.version,
        content: { ...fieldsOf(entity), ...spec },
      },
    });
  }

  const unknownOccasion = (): OccasionId => OccasionId.create(newId());

  const versionOf = (read: { expectedVersion: ExpectedVersion<Occasion> }) =>
    read.expectedVersion;

  const today = (): LocalDate => LocalDate.fromInstant(a.clock.now());

  return {
    ...a,
    newId,
    run,
    setToday,
    today,
    ref,
    operator,
    steward,
    photos,
    photo,
    register,
    published,
    stored,
    change,
    takeDown,
    place,
    participate,
    participation,
    link,
    regionLink,
    photoOwner,
    events,
    record,
    putRecord,
    runJob,
    update,
    unknownOccasion,
    versionOf,
    publish: act(publishOccasion),
    unpublish: act(unpublishOccasion),
    cancel: act(cancelOccasion),
    revoke: act(revokeOccasionCancellation),
    suspend: act(suspendOccasion),
    unsuspend: act(unsuspendOccasion),
    get: act(getManagedOccasion),
  };
}
