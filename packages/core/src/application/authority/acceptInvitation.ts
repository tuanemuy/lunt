import { Account } from "@repo/core/domain/account/entity";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { InvitationId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { type ActorServiceArgs, persistStewardship } from "./access";
import { requireActorAccount } from "./accounts";

export type AcceptInvitationInput = Readonly<{
  target: StewardedRef;
  invitationId: InvitationId;
}>;

/**
 * The invitee's account accepts and becomes a steward — also of a vacant
 * target, and after the inviter resigned or withdrew. Only the account of
 * the invited address can accept (`Stewardship.acceptInvitation`), so no
 * `AccessPolicy` check. The acceptor's account version advances in the
 * same unit of work (`Account.markReferenced`), so the appointment and a
 * concurrent withdrawal cannot both commit.
 */
export async function acceptInvitation({
  container,
  actor,
  input,
}: ActorServiceArgs<AcceptInvitationInput>): Promise<void> {
  await container.unitOfWorkProvider.run(async (ctx) => {
    const [me, found] = await Promise.all([
      requireActorAccount(ctx.accountRepository, actor),
      ctx.stewardshipRepository.findById(input.target),
    ]);
    const { entity, eventDrafts } = Stewardship.acceptInvitation(
      Stewardship.orVacant(found?.entity ?? null, input.target),
      input.invitationId,
      { accountId: me.entity.id, email: me.entity.email },
      container.clock.now(),
    );
    await persistStewardship(ctx, entity, found?.expectedVersion ?? null);
    await ctx.accountRepository.save(
      Account.markReferenced(me.entity),
      me.expectedVersion,
    );
    ctx.collectEvents(eventDrafts);
  });
}
