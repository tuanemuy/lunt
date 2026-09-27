import type { AccountId } from "@repo/core/domain/common/ids";
import type { RequestContainer } from "../di/types";
import { defineConsumer } from "../events/consumer";

/**
 * Deletes every notification of a withdrawn account (ACC-04), in a unit of
 * work of its own — eventually consistent with the withdrawal, which is
 * fine because a withdrawn account can no longer sign in to read them.
 * Idempotent: with nothing left, it changes nothing.
 */
export async function purgeNotificationsOf(
  container: RequestContainer,
  accountId: AccountId,
): Promise<void> {
  await container.unitOfWorkProvider.run(({ notificationRepository }) =>
    notificationRepository.removeAllByRecipient(accountId),
  );
}

/** The `purgeNotificationsOnWithdrawal` consumer of `account.withdrawn`. */
export const purgeNotificationsOnWithdrawal = defineConsumer(
  ["account.withdrawn"],
  (container, event) =>
    purgeNotificationsOf(container, event.payload.accountId),
);
