import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { AccountId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import {
  type ActorServiceArgs,
  authorizeRole,
  persistStewardship,
} from "./access";

export type RevokeStewardInput = Readonly<{
  target: StewardedRef;
  accountId: AccountId;
}>;

/**
 * An operator removes a chosen steward from the target
 * (`operate_service`). Irreversible; the last steward's removal leaves the
 * target vacant with its pending invitations. The removed account's other
 * stewardships and roles do not change.
 */
export async function revokeSteward({
  container,
  actor,
  input,
}: ActorServiceArgs<RevokeStewardInput>): Promise<void> {
  await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const found = await ctx.stewardshipRepository.findById(input.target);
    const { entity, eventDrafts } = Stewardship.removeSteward(
      Stewardship.orVacant(found?.entity ?? null, input.target),
      input.accountId,
      "revoked",
      container.clock.now(),
    );
    await persistStewardship(ctx, entity, found?.expectedVersion ?? null);
    ctx.collectEvents(eventDrafts);
  });
}
