import type { AuthorityEvent } from "@repo/core/domain/authority/events";
import type { AuthorityRepositories } from "@repo/core/domain/authority/ports/unitOfWork";
import { ROLES, type Role } from "@repo/core/domain/authority/role";
import { RoleRoster } from "@repo/core/domain/authority/roleRoster";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { EventDraft } from "@repo/core/domain/common/event";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { AccountId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";

/**
 * Every stewardship `accountId` is a steward of, read page by page
 * (`findPageBySteward`) in its listing order.
 */
export async function findAllStewardshipsOf(
  ctx: Pick<AuthorityRepositories, "stewardshipRepository">,
  accountId: AccountId,
): Promise<readonly Versioned<Stewardship>[]> {
  const all: Versioned<Stewardship>[] = [];
  for (let page = 1; ; page += 1) {
    const { items, count } = await ctx.stewardshipRepository.findPageBySteward(
      accountId,
      { page, limit: IdBatch.maxSize },
    );
    all.push(...items);
    if (items.length === 0 || all.length >= count) return all;
  }
}

/** What withdrawing would do to the account's authority. */
export type AuthorityLossPreview = Readonly<{
  /** The first role (in `ROLES` order) the account cannot be removed from. */
  blockedBy: Readonly<{ role: Role; reason: "last_operator" }> | null;
  /** Targets left without a steward, in `findPageBySteward` order. */
  vacates: readonly StewardedRef[];
}>;

/**
 * Reads, without writing, what `removeAllAuthorityOf` would do — the same
 * `Stewardship.removal` / `RoleRoster.removal` judgments it applies at
 * commit. For Account's `previewWithdrawal`; run inside a read-only
 * unit of work.
 */
export async function previewAuthorityLoss(
  ctx: AuthorityRepositories,
  accountId: AccountId,
): Promise<AuthorityLossPreview> {
  const stewardships = await findAllStewardshipsOf(ctx, accountId);
  const rosters = await Promise.all(
    ROLES.map((role) => ctx.roleRosterRepository.find(role)),
  );
  const blocked = rosters.find(
    ({ entity }) =>
      RoleRoster.removal(entity, accountId).outcome === "last_operator",
  );
  return {
    blockedBy:
      blocked === undefined
        ? null
        : { role: blocked.entity.role, reason: "last_operator" },
    vacates: stewardships.flatMap(({ entity }) => {
      const removal = Stewardship.removal(entity, accountId);
      return removal.outcome === "removable" && removal.vacates
        ? [entity.target]
        : [];
    }),
  };
}

/**
 * Removes `accountId` from every stewardship and every role roster it is
 * in (`reason: "withdrawn"`) and returns the event drafts to collect —
 * `authority.steward_removed` per stewardship, `authority.stewardship_vacated`
 * per target left vacant, `authority.role_revoked` per roster. For
 * Account's `withdraw`, in the same unit of work as the account's
 * `delete`: the stewardships and rosters are saved against the versions
 * read here, so a concurrent appointment, grant or revocation makes the
 * whole withdrawal a `ConflictError`. Throws `AUTHORITY_LAST_OPERATOR`
 * (nothing is written) when the account is the only operator.
 */
export async function removeAllAuthorityOf(
  ctx: AuthorityRepositories,
  accountId: AccountId,
  now: Date,
): Promise<readonly EventDraft<AuthorityEvent>[]> {
  const stewardships = await findAllStewardshipsOf(ctx, accountId);
  const rosters = await Promise.all(
    ROLES.map((role) => ctx.roleRosterRepository.find(role)),
  );
  const drafts: EventDraft<AuthorityEvent>[] = [];
  const rosterWrites = rosters
    .filter(
      ({ entity }) =>
        RoleRoster.removal(entity, accountId).outcome !== "not_held",
    )
    .map(({ entity, expectedVersion }) => {
      const removed = RoleRoster.removeHolder(
        entity,
        accountId,
        "withdrawn",
        now,
      );
      drafts.push(...removed.eventDrafts);
      return { roster: removed.entity, expectedVersion };
    });
  for (const { entity, expectedVersion } of stewardships) {
    const removed = Stewardship.removeSteward(
      entity,
      accountId,
      "withdrawn",
      now,
    );
    drafts.push(...removed.eventDrafts);
    await ctx.stewardshipRepository.save(removed.entity, expectedVersion);
  }
  for (const { roster, expectedVersion } of rosterWrites) {
    await ctx.roleRosterRepository.save(roster, expectedVersion);
  }
  return drafts;
}
