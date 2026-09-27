import type { AccountId } from "@repo/core/domain/common/ids";

/**
 * The signed-in account performing an operation. The boundary builds it only
 * after confirming the account exists; a withdrawn account's request is
 * treated as signed-out. Operations open to signed-out users (browsing,
 * takedown claims) do not require one.
 */
export type Actor = Readonly<{ accountId: AccountId }>;
