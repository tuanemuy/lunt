import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { InvitationId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { ActorServiceArgs } from "./access";
import { requireActorAccount } from "./accounts";

export type CheckInvitationInput = Readonly<{
  target: StewardedRef;
  invitationId: InvitationId;
}>;

export type CheckInvitationOutput =
  | Readonly<{
      status: "acceptable";
      target: StewardedRef;
      /** `null` for an unnamed draft region / occasion. */
      name: string | null;
    }>
  | Readonly<{
      status: "addressed_to_other" | "not_found" | "already_steward";
    }>;

/**
 * Whether the signed-in account can accept the invitation found by
 * target and id; when it can, the target's kind and name — even for a
 * target viewers cannot see. Reasons it cannot are output, not errors.
 */
export async function checkInvitation({
  container,
  actor,
  input,
}: ActorServiceArgs<CheckInvitationInput>): Promise<CheckInvitationOutput> {
  const status = await container.unitOfWorkProvider.run(async (ctx) => {
    const [me, found] = await Promise.all([
      requireActorAccount(ctx.accountRepository, actor),
      ctx.stewardshipRepository.findById(input.target),
    ]);
    return Stewardship.invitationStatusFor(
      Stewardship.orVacant(found?.entity ?? null, input.target),
      input.invitationId,
      { accountId: me.entity.id, email: me.entity.email },
    );
  });
  if (status !== "acceptable") return { status };
  const [summary] = await container.stewardedTargetDirectory.describe([
    input.target,
  ]);
  return { status, target: input.target, name: summary?.name ?? null };
}
