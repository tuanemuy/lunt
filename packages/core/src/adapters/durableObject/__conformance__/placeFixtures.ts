import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { NotFoundError } from "@repo/core/application/errors";
import type { Address } from "@repo/core/domain/common/address";
import { PhotoId, PlaceId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { PlaceMatchCriteria } from "@repo/core/domain/place/matching";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { Place } from "@repo/core/domain/place/place";
import {
  PlaceProfile,
  type PlaceProfileInput,
} from "@repo/core/domain/place/profile";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import type { ConformanceHarness } from "./harness";

export const PLACE_T0 = new Date("2026-09-01T00:00:00.000Z");

/** Place and photo ids for one test, ascending in mint order (p1 < p2 < …). */
export function placeIds() {
  const ids = new FakeIdGenerator(0x20_0000);
  return {
    place: (): PlaceId => PlaceId.create(ids.next()),
    photo: (): PhotoId => PhotoId.create(ids.next()),
  };
}

export function placeProfile(
  overrides: Partial<PlaceProfileInput> = {},
): PlaceProfile {
  return PlaceProfile.create({
    name: "山田珈琲店",
    photoIds: [],
    description: null,
    address: SampleAddress.otemachi(),
    location: { latitude: 35.6848, longitude: 139.7639 },
    businessHours: null,
    contact: null,
    ...overrides,
  });
}

export function newPlace(
  id: PlaceId,
  overrides: Partial<PlaceProfileInput> = {},
  now: Date = PLACE_T0,
): Place {
  return Place.register({ id, profile: placeProfile(overrides) }, now).entity;
}

export async function insertPlaces(
  h: ConformanceHarness,
  ...places: readonly Place[]
): Promise<void> {
  await h.uow.run(async ({ placeRepository }) => {
    for (const place of places) await placeRepository.insert(place);
  });
}

export function findPlace(
  h: ConformanceHarness,
  id: PlaceId,
): Promise<Versioned<Place> | null> {
  return h.uow.run(({ placeRepository }) => placeRepository.findById(id));
}

export async function getPlace(
  h: ConformanceHarness,
  id: PlaceId,
): Promise<Versioned<Place>> {
  const found = await findPlace(h, id);
  if (found === null) throw new NotFoundError("TEST", `no place ${id}`);
  return found;
}

export function savePlace(
  h: ConformanceHarness,
  place: Place,
  expectedVersion: ExpectedVersion<Place>,
): Promise<void> {
  return h.uow.run(({ placeRepository }) =>
    placeRepository.save(place, expectedVersion),
  );
}

/** Reads `id` and saves `change(place)` against the version read. */
export async function updatePlace(
  h: ConformanceHarness,
  id: PlaceId,
  change: (place: Place) => Place,
): Promise<Place> {
  const read = await getPlace(h, id);
  const next = change(read.entity);
  await savePlace(h, next, read.expectedVersion);
  return next;
}

export const suspended = (place: Place): Place =>
  Place.suspend(place, PLACE_T0).entity;

export type MatchQuery = Readonly<{
  name?: string;
  address?: string;
  includeSuspended: boolean;
}>;

export const ALL_PAGE: Pagination = { page: 1, limit: 100 };

export function matchPlaces(
  h: ConformanceHarness,
  query: MatchQuery,
  pagination: Pagination = ALL_PAGE,
) {
  const criteria = PlaceMatchCriteria.create({
    name: query.name ?? null,
    address: query.address ?? null,
    includeSuspended: query.includeSuspended,
  });
  return h.uow.run(({ placeRepository }) =>
    placeRepository.match(criteria, pagination),
  );
}

type SamplePlace = Readonly<{
  name: string;
  address: Address;
  status: OperatingStatus;
  suspended: boolean;
}>;

/** `spec/testcases/ports/placeRepository.md` 「テスト用の店舗」, p1 … p6. */
const SAMPLE_PLACES: readonly SamplePlace[] = [
  {
    name: "山田珈琲店",
    address: SampleAddress.otemachi("1-1"),
    status: "open",
    suspended: false,
  },
  {
    name: "山田珈琲店 別館",
    address: SampleAddress.ginza("2-2"),
    status: "temporarilyClosed",
    suspended: false,
  },
  {
    name: "純喫茶 山田珈琲店",
    address: SampleAddress.umeda("3-3"),
    status: "permanentlyClosed",
    suspended: false,
  },
  {
    name: "山田",
    address: SampleAddress.umeda("4-4"),
    status: "open",
    suspended: true,
  },
  {
    name: "海の家",
    address: SampleAddress.chiyoda("5-5"),
    status: "open",
    suspended: false,
  },
  {
    name: "Yamada Coffee",
    address: SampleAddress.ginza("6-6"),
    status: "open",
    suspended: false,
  },
];

/**
 * Inserts the six sample places (each built through `Place.register` and
 * `changeOperatingStatus`), then saves p4 suspended. Returns the ids.
 */
export async function insertSamplePlaces(
  h: ConformanceHarness,
): Promise<readonly [PlaceId, PlaceId, PlaceId, PlaceId, PlaceId, PlaceId]> {
  const ids = placeIds();
  const places = SAMPLE_PLACES.map((sample) => {
    const registered = newPlace(ids.place(), {
      name: sample.name,
      address: sample.address,
    });
    return Place.changeOperatingStatus(registered, sample.status, PLACE_T0)
      .entity;
  });
  await insertPlaces(h, ...places);
  for (const [i, sample] of SAMPLE_PLACES.entries()) {
    const place = places[i];
    if (sample.suspended && place !== undefined) {
      await updatePlace(h, place.id, suspended);
    }
  }
  const [p1, p2, p3, p4, p5, p6] = places.map((place) => place.id);
  if (
    p1 === undefined ||
    p2 === undefined ||
    p3 === undefined ||
    p4 === undefined ||
    p5 === undefined ||
    p6 === undefined
  ) {
    throw new Error("six sample places");
  }
  return [p1, p2, p3, p4, p5, p6];
}
