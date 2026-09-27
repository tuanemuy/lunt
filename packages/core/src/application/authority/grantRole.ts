import { Account } from "@repo/core/domain/account/entity";
import type { Role } from "@repo/core/domain/authority/role";
import { RoleRoster } from "@repo/core/domain/authority/roleRoster";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { ActorServiceArgs } from "../types";
import { authorizeRole } from "./access";
import { requireAccountByEmail } from "./accounts";

export type GrantRoleInput = Readonly<{ role: Role; email: string }>;

/**
 * An operator appoints an existing account as editor or grants it the
 * operator role (`operate_service`), the operator itself included. No
 * consent is needed. The account's version advances in the same unit of
 * work (`Account.markReferenced`), serializing the grant with a
 * concurrent withdrawal.
 */
export async function grantRole({
  container,
  actor,
  input,
}: ActorServiceArgs<GrantRoleInput>): Promise<void> {
  const email = EmailAddress.create(input.email);
  await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const grantee = await requireAccountByEmail(ctx.accountRepository, email);
    const roster = await ctx.roleRosterRepository.find(input.role);
    const { entity, eventDrafts } = RoleRoster.grant(
      roster.entity,
      grantee.entity.id,
      container.clock.now(),
    );
    await ctx.roleRosterRepository.save(entity, roster.expectedVersion);
    await ctx.accountRepository.save(
      Account.markReferenced(grantee.entity),
      grantee.expectedVersion,
    );
    ctx.collectEvents(eventDrafts);
  });
}
