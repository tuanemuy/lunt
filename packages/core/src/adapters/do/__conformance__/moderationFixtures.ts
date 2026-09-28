import { NotFoundError } from "@repo/core/application/errors";
import type {
  InfoReportId,
  PlaceId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { InfoReport } from "@repo/core/domain/moderation/infoReport";
import type { TakedownClaim } from "@repo/core/domain/moderation/takedownClaim";
import type { ConformanceHarness } from "./harness";

export {
  type ModerationSamples,
  moderationSamples,
} from "@repo/core/domain/moderation/testing/samples";

export const page = (p: number, limit = 100): Pagination => ({
  page: p,
  limit,
});

export async function insertClaims(
  h: ConformanceHarness,
  ...claims: readonly TakedownClaim[]
): Promise<void> {
  await h.uow.run(async ({ takedownClaimRepository }) => {
    for (const claim of claims) await takedownClaimRepository.insert(claim);
  });
}

export function findClaim(
  h: ConformanceHarness,
  id: TakedownClaimId,
): Promise<Versioned<TakedownClaim> | null> {
  return h.uow.run(({ takedownClaimRepository }) =>
    takedownClaimRepository.findById(id),
  );
}

export async function getClaim(
  h: ConformanceHarness,
  id: TakedownClaimId,
): Promise<Versioned<TakedownClaim>> {
  const found = await findClaim(h, id);
  if (found === null) throw new NotFoundError("TEST", `no claim ${id}`);
  return found;
}

export function saveClaim(
  h: ConformanceHarness,
  claim: TakedownClaim,
  expectedVersion: ExpectedVersion<TakedownClaim>,
): Promise<void> {
  return h.uow.run(({ takedownClaimRepository }) =>
    takedownClaimRepository.save(claim, expectedVersion),
  );
}

export function findOpenClaims(
  h: ConformanceHarness,
  pagination: Pagination = page(1),
) {
  return h.uow.run(({ takedownClaimRepository }) =>
    takedownClaimRepository.findOpen(pagination),
  );
}

export async function insertReports(
  h: ConformanceHarness,
  ...reports: readonly InfoReport[]
): Promise<void> {
  await h.uow.run(async ({ infoReportRepository }) => {
    for (const report of reports) await infoReportRepository.insert(report);
  });
}

export function findReport(
  h: ConformanceHarness,
  id: InfoReportId,
): Promise<Versioned<InfoReport> | null> {
  return h.uow.run(({ infoReportRepository }) =>
    infoReportRepository.findById(id),
  );
}

export async function getReport(
  h: ConformanceHarness,
  id: InfoReportId,
): Promise<Versioned<InfoReport>> {
  const found = await findReport(h, id);
  if (found === null) throw new NotFoundError("TEST", `no report ${id}`);
  return found;
}

export function saveReport(
  h: ConformanceHarness,
  report: InfoReport,
  expectedVersion: ExpectedVersion<InfoReport>,
): Promise<void> {
  return h.uow.run(({ infoReportRepository }) =>
    infoReportRepository.save(report, expectedVersion),
  );
}

export function findUnresolvedReports(
  h: ConformanceHarness,
  pagination: Pagination = page(1),
) {
  return h.uow.run(({ infoReportRepository }) =>
    infoReportRepository.findUnresolved(pagination),
  );
}

export function findRequestedByPlace(
  h: ConformanceHarness,
  placeId: PlaceId,
  pagination: Pagination = page(1),
) {
  return h.uow.run(({ infoReportRepository }) =>
    infoReportRepository.findConfirmationRequestedByPlace(placeId, pagination),
  );
}

export const idsOf = <T extends Readonly<{ id: string }>>(
  items: readonly T[],
): readonly T["id"][] => items.map((item) => item.id);
