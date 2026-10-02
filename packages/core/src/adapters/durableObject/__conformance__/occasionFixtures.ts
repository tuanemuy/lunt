import type { OccasionId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { HoldingStatusRecord } from "@repo/core/domain/occasion/holdingStatusObserver";
import type { Occasion } from "@repo/core/domain/occasion/occasion";
import type {
  Participation,
  ParticipationKey,
} from "@repo/core/domain/occasion/participation";
import type {
  RegionLink,
  RegionLinkKey,
} from "@repo/core/domain/occasion/regionLink";
import type { ConformanceHarness } from "./harness";

export {
  day,
  type OccasionFactory,
  occasionFactory,
} from "@repo/core/domain/occasion/testing/samples";

type H = ConformanceHarness;

export const page = (p: number, limit = 100): Pagination => ({
  page: p,
  limit,
});

export const keyword = (input: string): SearchKeyword =>
  SearchKeyword.create(input);

export async function insertOccasions(
  h: H,
  ...occasions: readonly Occasion[]
): Promise<void> {
  await h.uow.run(async ({ occasionRepository }) => {
    for (const occasion of occasions) await occasionRepository.insert(occasion);
  });
}

export function findOccasion(
  h: H,
  id: OccasionId,
): Promise<Versioned<Occasion> | null> {
  return h.uow.run(({ occasionRepository }) => occasionRepository.findById(id));
}

export async function getOccasion(
  h: H,
  id: OccasionId,
): Promise<Versioned<Occasion>> {
  const found = await findOccasion(h, id);
  if (found === null) throw new Error(`no occasion ${id}`);
  return found;
}

export function saveOccasion(
  h: H,
  occasion: Occasion,
  expectedVersion: ExpectedVersion<Occasion>,
): Promise<void> {
  return h.uow.run(({ occasionRepository }) =>
    occasionRepository.save(occasion, expectedVersion),
  );
}

/** Reads the occasion, applies `change` and saves it against the version read. */
export async function updateOccasion(
  h: H,
  id: OccasionId,
  change: (occasion: Occasion) => Occasion,
): Promise<Occasion> {
  const read = await getOccasion(h, id);
  const next = change(read.entity);
  await saveOccasion(h, next, read.expectedVersion);
  return next;
}

export async function insertParticipations(
  h: H,
  ...participations: readonly Participation[]
): Promise<void> {
  await h.uow.run(async ({ participationRepository }) => {
    for (const p of participations) await participationRepository.insert(p);
  });
}

export function findParticipation(
  h: H,
  key: ParticipationKey,
): Promise<Versioned<Participation> | null> {
  return h.uow.run(({ participationRepository }) =>
    participationRepository.findById(key),
  );
}

export async function getParticipation(
  h: H,
  key: ParticipationKey,
): Promise<Versioned<Participation>> {
  const found = await findParticipation(h, key);
  if (found === null) throw new Error("no participation");
  return found;
}

export async function insertRegionLinks(
  h: H,
  ...links: readonly RegionLink[]
): Promise<void> {
  await h.uow.run(async ({ regionLinkRepository }) => {
    for (const link of links) await regionLinkRepository.insert(link);
  });
}

export function findRegionLink(
  h: H,
  key: RegionLinkKey,
): Promise<Versioned<RegionLink> | null> {
  return h.uow.run(({ regionLinkRepository }) =>
    regionLinkRepository.findById(key),
  );
}

export async function getRegionLink(
  h: H,
  key: RegionLinkKey,
): Promise<Versioned<RegionLink>> {
  const found = await findRegionLink(h, key);
  if (found === null) throw new Error("no region link");
  return found;
}

export function putRecord(h: H, record: HoldingStatusRecord): Promise<void> {
  return h.uow.run(({ holdingStatusLedger }) =>
    holdingStatusLedger.put(record),
  );
}
