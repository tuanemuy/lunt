import type { TakedownClaimId } from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import type { ResolvedTakedownClaim } from "@repo/core/domain/moderation/takedownClaim";
import { TakedownOutcomeMail } from "@repo/core/domain/notification/mail";
import type { MailKey } from "@repo/core/domain/notification/occurrenceKey";
import type { RequestContainer } from "../di/types";
import { SystemError, SystemErrorCode } from "../errors";
import { defineConsumer } from "../events/consumer";
import { describeContents } from "./labels";

type Pending = Readonly<{ claim: ResolvedTakedownClaim; key: MailKey }>;

/**
 * Reads the resolved claim and whether its outcome mail was dispatched,
 * in one read-only `run`; `null` when it was.
 */
async function readPending(
  container: RequestContainer,
  claimId: TakedownClaimId,
): Promise<Pending | null> {
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.takedownClaimRepository.findById(claimId);
    if (found === null || found.entity.status !== "resolved") {
      // `takedown_claim.resolved` is emitted only when a claim is
      // resolved, and claims are never deleted.
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Takedown claim ${claimId} is not a resolved claim`,
      );
    }
    const claim = found.entity;
    const key = TakedownOutcomeMail.keyOf(claim);
    const [dispatched] = await ctx.mailDispatchLedger.findDispatched([key]);
    return dispatched === undefined ? { claim, key } : null;
  });
}

/**
 * `sendTakedownOutcome` (MOD-01, MOD-02): mails a resolved claim's
 * outcome to the claimant's address — whether or not action was taken —
 * unless the ledger records it as sent. The target is named whether
 * viewers can see it or not (`null` once it is gone). The claim is not
 * written and no event is emitted; a failed send leaves no record, so the
 * relay's redelivery sends it. At least once: a send whose record fails,
 * or two overlapping consumptions, can mail it twice.
 */
export async function sendTakedownOutcomeOf(
  container: RequestContainer,
  claimId: TakedownClaimId,
): Promise<void> {
  const pending = await readPending(container, claimId);
  if (pending === null) return;
  const { claim, key } = pending;
  const target = claim.ground.target;
  const names = await describeContents(container.contentDirectory, [target]);
  const mail = TakedownOutcomeMail.compose(
    claim,
    names.get(ContentRef.key(target)) ?? null,
  );
  await container.mailer.send(
    container.notificationMailRenderer.renderTakedownOutcome(mail),
  );
  await container.unitOfWorkProvider.run(({ mailDispatchLedger }) =>
    mailDispatchLedger.record(key),
  );
}

/** The `sendTakedownOutcome` consumer of `takedown_claim.resolved`. */
export const sendTakedownOutcome = defineConsumer(
  ["takedown_claim.resolved"],
  (container, event) => sendTakedownOutcomeOf(container, event.payload.claimId),
);
