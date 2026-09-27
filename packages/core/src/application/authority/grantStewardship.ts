import { Account } from "@repo/core/domain/account/entity";
import {
  type GrantableRef,
  Stewardship,
} from "@repo/core/domain/authority/stewardship";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { NotFoundError } from "../errors";
import type { ActorServiceArgs } from "../types";
import { authorizeRole, persistStewardship } from "./access";
import { requireAccountByEmail } from "./accounts";

export type GrantStewardshipInput = Readonly<{
  /** A region or an occasion; places cannot be granted. */
  target: GrantableRef;
  email: string;
}>;

/**
 * An operator makes an existing account a steward of a region or an
 * occasion, whatever its publication state (`operate_service`). No
 * consent is needed; a pending invitation to the address disappears with
 * the appointment. The target's existence is checked through
 * `StewardedTargetDirectory` before the unit of work starts.
 */
export async function grantStewardship({
  container,
  actor,
  input,
}: ActorServiceArgs<GrantStewardshipInput>): Promise<void> {
  const email = EmailAddress.create(input.email);
  const described = await container.stewardedTargetDirectory.describe([
    input.target,
  ]);
  if (described.length === 0) {
    throw new NotFoundError("TARGET_NOT_FOUND", "The target does not exist");
  }
  await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const appointee = await requireAccountByEmail(ctx.accountRepository, email);
    const found = await ctx.stewardshipRepository.findById(input.target);
    const { entity, eventDrafts } = Stewardship.grant(
      Stewardship.orVacant(found?.entity ?? null, input.target),
      { accountId: appointee.entity.id, email: appointee.entity.email },
      container.clock.now(),
    );
    await persistStewardship(ctx, entity, found?.expectedVersion ?? null);
    await ctx.accountRepository.save(
      Account.markReferenced(appointee.entity),
      appointee.expectedVersion,
    );
    ctx.collectEvents(eventDrafts);
  });
}
