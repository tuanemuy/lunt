import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { AccountId, InvitationId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { type ActorServiceArgs, authorizeOnTarget } from "./access";
import { findAccountsByIds } from "./accounts";

export type ViewMembersInput = Readonly<{ target: StewardedRef }>;

export type MemberView = Readonly<{
  accountId: AccountId;
  email: EmailAddress;
  isSelf: boolean;
  since: Date;
}>;

export type PendingInvitationView = Readonly<{
  invitationId: InvitationId;
  email: EmailAddress;
  invitedAt: Date;
}>;

export type ViewMembersOutput = Readonly<{
  vacant: boolean;
  /** Oldest appointment first. */
  stewards: readonly MemberView[];
  /** Oldest invitation first. */
  invitations: readonly PendingInvitationView[];
}>;

/**
 * A target's stewards (with email addresses) and pending invitations
 * (`view_members`: its stewards, and operators whether or not it has
 * stewards).
 */
export async function viewMembers({
  container,
  actor,
  input,
}: ActorServiceArgs<ViewMembersInput>): Promise<ViewMembersOutput> {
  return container.unitOfWorkProvider.run(async (ctx) => {
    const { stewardship } = await authorizeOnTarget(
      ctx,
      actor,
      "view_members",
      input.target,
    );
    const stewards = Stewardship.stewards(stewardship);
    const accounts = await findAccountsByIds(
      ctx.accountRepository,
      stewards.map((steward) => steward.accountId),
    );
    return {
      vacant: Stewardship.isVacant(stewardship),
      stewards: stewards.flatMap((steward) => {
        const account = accounts.get(steward.accountId);
        return account === undefined
          ? []
          : [
              {
                accountId: steward.accountId,
                email: account.email,
                isSelf: steward.accountId === actor.accountId,
                since: steward.since,
              },
            ];
      }),
      invitations: stewardship.invitations.map((invitation) => ({
        invitationId: invitation.id,
        email: invitation.email,
        invitedAt: invitation.invitedAt,
      })),
    };
  });
}
