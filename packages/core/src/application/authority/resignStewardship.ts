import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { ActorServiceArgs } from "../types";
import { authorizeOnTarget, persistStewardship } from "./access";

export type ResignStewardshipInput = Readonly<{ target: StewardedRef }>;

/**
 * The actor gives up their own stewardship of the target (`resign`).
 * Irreversible; the last steward leaves the target vacant and pending
 * invitations stay.
 */
export async function resignStewardship({
  container,
  actor,
  input,
}: ActorServiceArgs<ResignStewardshipInput>): Promise<void> {
  await container.unitOfWorkProvider.run(async (ctx) => {
    const { stewardship, expectedVersion } = await authorizeOnTarget(
      ctx,
      actor,
      "resign",
      input.target,
    );
    const { entity, eventDrafts } = Stewardship.removeSteward(
      stewardship,
      actor.accountId,
      "resigned",
      container.clock.now(),
    );
    await persistStewardship(ctx, entity, expectedVersion);
    ctx.collectEvents(eventDrafts);
  });
}
