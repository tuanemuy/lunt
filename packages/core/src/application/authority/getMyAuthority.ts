import { ROLES, type Role } from "@repo/core/domain/authority/role";
import type { StewardedTargetSummary } from "@repo/core/domain/authority/stewardedTarget";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import { ContentRef } from "@repo/core/domain/common/refs";
import type { ActorServiceArgs } from "../types";

export type GetMyAuthorityInput = Readonly<{ pagination: Pagination }>;

export type GetMyAuthorityOutput = Readonly<{
  /**
   * The page of targets the actor stewards (not merely invited to), in
   * `findPageBySteward` order. `name` is `null` for an unnamed draft, or
   * when the directory does not know the target.
   */
  stewarded: PaginationResult<StewardedTargetSummary>;
  /** In `ROLES` order. */
  roles: readonly Role[];
}>;

/**
 * The signed-in account's stewarded targets (a page, with names) and
 * roles. Reads only the actor's own authority; no permission check.
 */
export async function getMyAuthority({
  container,
  actor,
  input,
}: ActorServiceArgs<GetMyAuthorityInput>): Promise<GetMyAuthorityOutput> {
  const { page, roles } = await container.unitOfWorkProvider.run(
    async (ctx) => {
      const [page, roles] = await Promise.all([
        ctx.stewardshipRepository.findPageBySteward(
          actor.accountId,
          input.pagination,
        ),
        ctx.roleRosterRepository.findRolesOf(actor.accountId),
      ]);
      return { page, roles };
    },
  );
  const targets = page.items.map((item) => item.entity.target);
  const names = new Map(
    (await container.stewardedTargetDirectory.describe(targets)).map(
      (summary) => [ContentRef.key(summary.target), summary.name],
    ),
  );
  return {
    stewarded: {
      items: targets.map((target) => ({
        target,
        name: names.get(ContentRef.key(target)) ?? null,
      })),
      count: page.count,
    },
    roles: ROLES.filter((role) => roles.has(role)),
  };
}
