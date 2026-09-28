import type { Account } from "@repo/core/domain/account/entity";
import type { AccountRepositories } from "@repo/core/domain/account/ports/unitOfWork";
import type { AuthorityRepositories } from "@repo/core/domain/authority/ports/unitOfWork";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type {
  AccountId,
  InfoReportId,
  PlaceId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import type { InfoReport } from "@repo/core/domain/moderation/infoReport";
import type {
  ContentDirectory,
  ContentSummary,
} from "@repo/core/domain/moderation/ports/contentDirectory";
import type { ModerationRepositories } from "@repo/core/domain/moderation/ports/unitOfWork";
import type { TakedownClaim } from "@repo/core/domain/moderation/takedownClaim";
import { NotFoundError } from "../errors";

export const TAKEDOWN_CLAIM_NOT_FOUND = "TAKEDOWN_CLAIM_NOT_FOUND";
export const INFO_REPORT_NOT_FOUND = "INFO_REPORT_NOT_FOUND";

const chunks = <T>(items: readonly T[]): readonly (readonly T[])[] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += IdBatch.maxSize) {
    result.push(items.slice(i, i + IdBatch.maxSize));
  }
  return result;
};

export async function requireTakedownClaim(
  ctx: Pick<ModerationRepositories, "takedownClaimRepository">,
  id: TakedownClaimId,
): Promise<Versioned<TakedownClaim>> {
  const found = await ctx.takedownClaimRepository.findById(id);
  if (found === null) {
    throw new NotFoundError(
      TAKEDOWN_CLAIM_NOT_FOUND,
      "The takedown claim does not exist",
    );
  }
  return found;
}

export async function requireInfoReport(
  ctx: Pick<ModerationRepositories, "infoReportRepository">,
  id: InfoReportId,
): Promise<Versioned<InfoReport>> {
  const found = await ctx.infoReportRepository.findById(id);
  if (found === null) {
    throw new NotFoundError(
      INFO_REPORT_NOT_FOUND,
      "The info report does not exist",
    );
  }
  return found;
}

/**
 * Whether the place has a steward now: none stored, or a vacant
 * stewardship, reads as none (`spec/usecases/moderation.md` 「共通の扱い」).
 */
export async function placeHasSteward(
  ctx: Pick<AuthorityRepositories, "stewardshipRepository">,
  placeId: PlaceId,
): Promise<boolean> {
  const [found] = await ctx.stewardshipRepository.findByTargets([
    { kind: "place", id: placeId },
  ]);
  return found !== undefined && !Stewardship.isVacant(found);
}

/** Existing accounts among `ids`, any number (100 per read); withdrawn ones are absent. */
export async function readAccounts(
  ctx: Pick<AccountRepositories, "accountRepository">,
  ids: readonly AccountId[],
): Promise<ReadonlyMap<AccountId, Account>> {
  const unique = [...new Set(ids)];
  const found = await Promise.all(
    chunks(unique).map((batch) => ctx.accountRepository.findByIds(batch)),
  );
  return new Map(found.flat().map((account) => [account.id, account]));
}

/**
 * `ContentDirectory.describe` over any number of targets (100 per call),
 * keyed by `ContentRef.key`. A target missing from the map is gone.
 */
export async function describeTargets(
  directory: ContentDirectory,
  targets: readonly ContentRef[],
): Promise<ReadonlyMap<string, ContentSummary>> {
  const unique = [
    ...new Map(targets.map((target) => [ContentRef.key(target), target])),
  ].map(([, target]) => target);
  const found = await Promise.all(
    chunks(unique).map((batch) => directory.describe(batch)),
  );
  return new Map(
    found.flat().map((summary) => [ContentRef.key(summary.target), summary]),
  );
}
