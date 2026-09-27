import { Account } from "@repo/core/domain/account/entity";
import { RoleRoster } from "@repo/core/domain/authority/roleRoster";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { ServiceArgs } from "../types";
import { requireAccountByEmail } from "./accounts";

export type EstablishFirstOperatorInput = Readonly<{ email: string }>;

/**
 * The service's opening set-up: makes the existing account of `email` the
 * first operator. Not a screen operation — the opening procedure calls
 * it, with no `Actor` and no permission check (no operator exists yet).
 * Succeeds only while the operator roster is unestablished; resending
 * for the same account succeeds without a write. Emits no event.
 */
export async function establishFirstOperator({
  container,
  input,
}: ServiceArgs<EstablishFirstOperatorInput>): Promise<void> {
  const email = EmailAddress.create(input.email);
  await container.unitOfWorkProvider.run(async (ctx) => {
    const first = await requireAccountByEmail(ctx.accountRepository, email);
    const roster = await ctx.roleRosterRepository.find("operator");
    const { entity } = RoleRoster.establishOperators(
      roster.entity,
      first.entity.id,
      container.clock.now(),
    );
    if (entity.version === roster.entity.version) return;
    await ctx.roleRosterRepository.save(entity, roster.expectedVersion);
    await ctx.accountRepository.save(
      Account.markReferenced(first.entity),
      first.expectedVersion,
    );
  });
}
