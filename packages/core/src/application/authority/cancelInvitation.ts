import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { InvitationId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { ActorServiceArgs } from "../types";
import { authorizeOnTarget, persistStewardship } from "./access";

export type CancelInvitationInput = Readonly<{
  target: StewardedRef;
  invitationId: InvitationId;
}>;

/**
 * Removes a pending invitation (`cancel_invitation`: the target's
 * stewards, or an operator standing in while it is vacant). No event.
 */
export async function cancelInvitation({
  container,
  actor,
  input,
}: ActorServiceArgs<CancelInvitationInput>): Promise<void> {
  await container.unitOfWorkProvider.run(async (ctx) => {
    const { stewardship, expectedVersion } = await authorizeOnTarget(
      ctx,
      actor,
      "cancel_invitation",
      input.target,
    );
    const { entity, eventDrafts } = Stewardship.cancelInvitation(
      stewardship,
      input.invitationId,
    );
    await persistStewardship(ctx, entity, expectedVersion);
    ctx.collectEvents(eventDrafts);
  });
}
