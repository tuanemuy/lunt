import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { NotFoundError } from "@repo/core/application/errors";
import { GeoPoint } from "@repo/core/domain/common/geo";
import { PhotoId, PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import {
  RegionContent,
  type RegionContentInput,
} from "@repo/core/domain/region/content";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { Region } from "@repo/core/domain/region/region";
import type { ConformanceHarness } from "./harness";

export const REGION_T0 = new Date("2026-09-01T00:00:00.000Z");

/** Region, place and photo ids for one test, ascending in mint order. */
export function regionIds() {
  const ids = new FakeIdGenerator(0x70_0000);
  return {
    region: (): RegionId => RegionId.create(ids.next()),
    place: (): PlaceId => PlaceId.create(ids.next()),
    photo: (): PhotoId => PhotoId.create(ids.next()),
  };
}

/** A clock for fixtures: every call is one minute after the previous. */
export function ticker(start: Date = REGION_T0) {
  let at = start.getTime();
  return (): Date => {
    at += 60_000;
    return new Date(at);
  };
}

/** Content with every field entered (name 谷中, 大手町 1-1). */
export function regionContent(
  overrides: Partial<RegionContentInput> = {},
): RegionContent {
  return RegionContent.create({
    name: "谷中",
    address: SampleAddress.otemachi(),
    location: GeoPoint.create(35.7266, 139.7669),
    photoIds: [],
    description: "下町の路地",
    tagline: "路地を歩く",
    ...overrides,
  });
}

/** Content with nothing entered. */
export function emptyRegionContent(): RegionContent {
  return RegionContent.create({
    name: null,
    address: null,
    location: null,
    photoIds: [],
    description: null,
    tagline: null,
  });
}

export function newRegion(
  id: RegionId,
  content: RegionContent = regionContent(),
  now: Date = REGION_T0,
): Region {
  return Region.register({ id, content }, now).entity;
}

/** A published region with `photoIds` (at least one). */
export function publishedRegion(
  id: RegionId,
  photoIds: readonly [PhotoId, ...PhotoId[]],
  overrides: Partial<RegionContentInput> = {},
  now: Date = REGION_T0,
): Region {
  return Region.publish(
    newRegion(id, regionContent({ photoIds, ...overrides }), now),
    now,
  ).entity;
}

export async function insertRegions(
  h: Pick<ConformanceHarness, "uow">,
  ...regions: readonly Region[]
): Promise<void> {
  await h.uow.run(async ({ regionRepository }) => {
    for (const region of regions) await regionRepository.insert(region);
  });
}

export function findRegion(
  h: Pick<ConformanceHarness, "uow">,
  id: RegionId,
): Promise<Versioned<Region> | null> {
  return h.uow.run(({ regionRepository }) => regionRepository.findById(id));
}

export async function getRegion(
  h: Pick<ConformanceHarness, "uow">,
  id: RegionId,
): Promise<Versioned<Region>> {
  const found = await findRegion(h, id);
  if (found === null) throw new NotFoundError("TEST", `no region ${id}`);
  return found;
}

export function saveRegion(
  h: Pick<ConformanceHarness, "uow">,
  region: Region,
  expectedVersion: ExpectedVersion<Region>,
): Promise<void> {
  return h.uow.run(({ regionRepository }) =>
    regionRepository.save(region, expectedVersion),
  );
}

/** Reads the region, applies `change` and saves it in one unit of work. */
export async function updateRegion(
  h: Pick<ConformanceHarness, "uow">,
  id: RegionId,
  change: (region: Region) => Region,
): Promise<Region> {
  return h.uow.run(async ({ regionRepository }) => {
    const read = await regionRepository.findById(id);
    if (read === null) throw new NotFoundError("TEST", `no region ${id}`);
    const next = change(read.entity);
    await regionRepository.save(next, read.expectedVersion);
    return next;
  });
}

/** A place's aggregate affiliated with `regionIds` in order, one tick apart. */
export function affiliated(
  placeId: PlaceId,
  regionIdsInOrder: readonly RegionId[],
  tick: () => Date = ticker(),
): PlaceAffiliations {
  return regionIdsInOrder.reduce(
    (a, regionId) => PlaceAffiliations.affiliate(a, regionId, tick()).entity,
    PlaceAffiliations.empty(placeId, REGION_T0),
  );
}

export async function insertAffiliations(
  h: Pick<ConformanceHarness, "uow">,
  ...aggregates: readonly PlaceAffiliations[]
): Promise<void> {
  await h.uow.run(async ({ placeAffiliationsRepository }) => {
    for (const a of aggregates) await placeAffiliationsRepository.insert(a);
  });
}

export function findAffiliations(
  h: Pick<ConformanceHarness, "uow">,
  placeId: PlaceId,
): Promise<Versioned<PlaceAffiliations> | null> {
  return h.uow.run(({ placeAffiliationsRepository }) =>
    placeAffiliationsRepository.findById(placeId),
  );
}

export async function getAffiliations(
  h: Pick<ConformanceHarness, "uow">,
  placeId: PlaceId,
): Promise<Versioned<PlaceAffiliations>> {
  const found = await findAffiliations(h, placeId);
  if (found === null) {
    throw new NotFoundError("TEST", `no affiliations of ${placeId}`);
  }
  return found;
}

/** Reads the aggregate, applies `change` and saves it in one unit of work. */
export async function updateAffiliations(
  h: Pick<ConformanceHarness, "uow">,
  placeId: PlaceId,
  change: (a: PlaceAffiliations) => PlaceAffiliations,
): Promise<PlaceAffiliations> {
  return h.uow.run(async ({ placeAffiliationsRepository }) => {
    const read = await placeAffiliationsRepository.findById(placeId);
    if (read === null) {
      throw new NotFoundError("TEST", `no affiliations of ${placeId}`);
    }
    const next = change(read.entity);
    await placeAffiliationsRepository.save(next, read.expectedVersion);
    return next;
  });
}

export function affiliatedPlaces(
  h: Pick<ConformanceHarness, "uow">,
  regionId: RegionId,
  pagination = { page: 1, limit: 100 },
) {
  return h.uow.run(({ placeAffiliationsRepository }) =>
    placeAffiliationsRepository.findAffiliatedPlaces(regionId, pagination),
  );
}
