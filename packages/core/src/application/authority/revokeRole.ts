import type { Role } from "@repo/core/domain/authority/role";
import { RoleRoster } from "@repo/core/domain/authority/roleRoster";
import type { AccountId } from "@repo/core/domain/common/ids";
import type { ActorServiceArgs } from "../types";
import { authorizeRole } from "./access";

export type RevokeRoleInput = Readonly<{ role: Role; accountId: AccountId }>;

/**
 * An operator removes a holder from a role (`operate_service`). The last
 * editor can go; the last operator cannot (`AUTHORITY_LAST_OPERATOR`),
 * and the roster's optimistic lock keeps concurrent revocations from
 * emptying it.
 */
export async function revokeRole({
  container,
  actor,
  input,
}: ActorServiceArgs<RevokeRoleInput>): Promise<void> {
  await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const roster = await ctx.roleRosterRepository.find(input.role);
    const { entity, eventDrafts } = RoleRoster.removeHolder(
      roster.entity,
      input.accountId,
      "revoked",
      container.clock.now(),
    );
    await ctx.roleRosterRepository.save(entity, roster.expectedVersion);
    ctx.collectEvents(eventDrafts);
  });
}
