import type {
  DomainEventBase,
  EventDraft,
} from "@repo/core/domain/common/event";
import type { AccountId } from "@repo/core/domain/common/ids";

export type AccountWithdrawnEvent = DomainEventBase<
  "account.withdrawn",
  { accountId: AccountId }
>;

export type AccountEvent = AccountWithdrawnEvent;

export const AccountEvents = {
  withdrawn: (
    accountId: AccountId,
    now: Date,
  ): EventDraft<AccountWithdrawnEvent> => ({
    type: "account.withdrawn",
    payload: { accountId },
    occurredAt: now,
    aggregateId: accountId,
  }),
};
