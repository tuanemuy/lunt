import { Account } from "@repo/core/domain/account/entity";
import { Application } from "@repo/core/domain/application/application";
import {
  type PlaceRef,
  Stewardship,
} from "@repo/core/domain/authority/stewardship";
import { persistStewardship } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import {
  type ApprovalOutcome,
  type ApproveApplicationInput,
  approveApplication,
} from "./approval";

export type ApproveStewardshipClaimInput = ApproveApplicationInput;

/**
 * An operator approves a stewardship claim (SHP-10, CM-01): the applicant
 * joins the place's stewards (`Stewardship.appointByApproval`, which
 * stores `authority.steward_appointed` with `via: "application"`), and
 * the applicant's account is marked referenced so a concurrent withdrawal
 * and this appointment cannot both commit. A suspended place is claimed
 * all the same. A claim filed with a registration is decided only after
 * that registration's approval. When the applicant has become a steward,
 * or the companion registration ended unapproved, the claim lapses
 * instead (returned, not thrown).
 *
 * - `NotFoundError` (none, or not a claim); `ForbiddenError`.
 * - The status code when not under review;
 *   `APPLICATION_REGISTRATION_PENDING`;
 *   `APPLICATION_APPLICANT_WITHDRAWN` (the applicant's account is gone —
 *   the claim stays under review until the withdrawal's consumer
 *   withdraws it); `ConflictError` when the application changed since
 *   `version`, or the stewardship or account changed before the commit.
 */
export async function approveStewardshipClaim({
  container,
  actor,
  input,
}: ActorServiceArgs<ApproveStewardshipClaimInput>): Promise<ApprovalOutcome> {
  return approveApplication({
    container,
    actor,
    input,
    kind: "stewardship",
    reflect: async (ctx, app, _premise, now) => {
      const ref: PlaceRef = { kind: "place", id: app.target.placeId };
      const [stewardship, account] = await Promise.all([
        ctx.stewardshipRepository.findById(ref),
        ctx.accountRepository.findById(app.target.applicant.accountId),
      ]);
      const appointee = Application.requireApplicantAccount(
        app,
        account === null
          ? null
          : { accountId: account.entity.id, email: account.entity.email },
      );
      const { entity, eventDrafts } = Stewardship.appointByApproval(
        Stewardship.orVacant(stewardship?.entity ?? null, ref),
        appointee,
        now,
      );
      await persistStewardship(
        ctx,
        entity,
        stewardship?.expectedVersion ?? null,
      );
      if (account !== null) {
        await ctx.accountRepository.save(
          Account.markReferenced(account.entity),
          account.expectedVersion,
        );
      }
      return { eventDrafts };
    },
  });
}
