import type { AccountId } from "@repo/core/domain/common/ids";
import type { RequestContainer } from "../di/types";
import { defineConsumer } from "../events/consumer";

/**
 * Deletes every bookmark of a withdrawn account (ACC-04, V-53), in a unit of
 * work of its own — eventually consistent with the withdrawal, which a
 * withdrawn account can no longer sign in to observe. Idempotent. A save
 * committed after it by a request racing the withdrawal stays, unread: the
 * `AccountId` is never reused.
 */
export async function purgeBookmarksOf(
  container: RequestContainer,
  accountId: AccountId,
): Promise<void> {
  await container.unitOfWorkProvider.run(({ bookmarkRepository }) =>
    bookmarkRepository.removeAllByAccount(accountId),
  );
}

/** The `purgeBookmarksOnWithdrawal` consumer of `account.withdrawn`. */
export const purgeBookmarksOnWithdrawal = defineConsumer(
  ["account.withdrawn"],
  (container, event) => purgeBookmarksOf(container, event.payload.accountId),
);
