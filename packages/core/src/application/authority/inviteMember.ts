import { Stewardship } from "@repo/core/domain/authority/stewardship";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { InvitationId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { ConflictError } from "../errors";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import { authorizeOnTarget, persistStewardship } from "./access";
import { requireExistingTarget } from "./targets";

export type InviteMemberInput = Readonly<{
  target: StewardedRef;
  /** Minted by the caller and kept across resends (idempotent create). */
  invitationId: GeneratedId;
  email: string;
}>;

/**
 * Adds an invitation to an email address (`invite_member`: the target's
 * stewards only). The address need not have an account. Resending the
 * same id and address succeeds without a write; the same id with another
 * address is a `ConflictError`.
 *
 * - `NotFoundError` (`{PLACE|REGION|OCCASION}_NOT_FOUND`) without the
 *   target, checked before access.
 */
export async function inviteMember({
  container,
  actor,
  input,
}: ActorServiceArgs<InviteMemberInput>): Promise<void> {
  const email = EmailAddress.create(input.email);
  const invitationId = InvitationId.create(input.invitationId);
  await requireExistingTarget(container.stewardedTargetDirectory, input.target);
  await container.unitOfWorkProvider.run(async (ctx) => {
    const { stewardship, expectedVersion } = await authorizeOnTarget(
      ctx,
      actor,
      "invite_member",
      input.target,
    );
    const params = { invitationId, email };
    switch (Stewardship.classifyInvite(stewardship, params)) {
      case "replay":
        return;
      case "conflict":
        throw new ConflictError(
          "INVITATION_ID_CONFLICT",
          "The invitation id is already used for another email address",
        );
      case "new":
        break;
    }
    const addressee = await ctx.accountRepository.findByEmail(email);
    const { entity, eventDrafts } = Stewardship.invite(
      stewardship,
      params,
      addressee?.entity.id ?? null,
      container.clock.now(),
    );
    await persistStewardship(ctx, entity, expectedVersion);
    ctx.collectEvents(eventDrafts);
  });
}
