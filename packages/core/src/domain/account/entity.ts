import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { EventDraft } from "@repo/core/domain/common/event";
import { AccountId } from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { RehydrationError } from "@repo/core/domain/error";
import { AccountEvents, type AccountWithdrawnEvent } from "./events";

/** A person's registration, identified by one email address. */
export type Account = Readonly<{
  id: AccountId;
  email: EmailAddress;
  version: Version;
}>;

function register(params: Readonly<{ id: string; email: string }>): Account {
  return {
    id: AccountId.create(params.id),
    email: EmailAddress.create(params.email),
    version: Version.initial(),
  };
}

/**
 * Records that a stewardship or a role now points at this account by
 * advancing its version. Saved in the same unit of work as the grant, it
 * puts the grant and a concurrent withdrawal on the same optimistic lock,
 * so only one of them can commit first.
 */
function markReferenced(account: Account): Account {
  return { ...account, version: Version.next(account.version) };
}

/** Drafts the withdrawal event; the usecase deletes the account itself. */
function withdraw(
  account: Account,
  now: Date,
): readonly EventDraft<AccountWithdrawnEvent>[] {
  return [AccountEvents.withdrawn(account.id, now)];
}

type ReconstructInput = Readonly<{
  id: string;
  email: string;
  version: number;
}>;

function reconstruct(input: ReconstructInput): Account {
  try {
    const account = register({ id: input.id, email: input.email });
    if (account.email !== input.email) {
      throw new Error("Stored email is not in its normalized form");
    }
    return { ...account, version: Version.create(input.version) };
  } catch (error) {
    throw new RehydrationError("Stored account violates invariants", error);
  }
}

export const Account = {
  register,
  markReferenced,
  withdraw,
  reconstruct,
};
