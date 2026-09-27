import { Account } from "@repo/core/domain/account/entity";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { AccountId } from "@repo/core/domain/common/ids";
import { ForbiddenError } from "../errors";
import type { ServiceArgs } from "../types";

export type DevSignInInput = Readonly<{ email: string }>;

function assertDevTools(devTools: boolean): void {
  if (!devTools) {
    throw new ForbiddenError(
      "DEV_TOOLS_DISABLED",
      "Development tools are disabled",
    );
  }
}

/**
 * Development tool: the email address of the logged-in account, for the
 * session page. `null` when the account no longer exists.
 */
export async function devDescribeAccount({
  container,
  input,
}: ServiceArgs<Readonly<{ accountId: AccountId }>>): Promise<Readonly<{
  accountId: AccountId;
  email: EmailAddress;
}> | null> {
  assertDevTools(container.runtime.devTools);
  const found = await container.unitOfWorkProvider.run(
    ({ accountRepository }) => accountRepository.findById(input.accountId),
  );
  return found === null
    ? null
    : { accountId: found.entity.id, email: found.entity.email };
}

/**
 * Development tool (design.md D-07): resolves the account of `email`,
 * creating it when absent, so a developer can act as any account
 * without the mail round trip. Refused unless the development tools are
 * on. Not a Lunt usecase — the real logins are Account's
 * `completeLoginBy*` / `loginWithExternalAccount`.
 */
export async function devSignIn({
  container,
  input,
}: ServiceArgs<DevSignInInput>): Promise<Readonly<{ accountId: AccountId }>> {
  assertDevTools(container.runtime.devTools);
  const email = EmailAddress.create(input.email);
  return container.unitOfWorkProvider.run(async ({ accountRepository }) => {
    const existing = await accountRepository.findByEmail(email);
    if (existing !== null) return { accountId: existing.entity.id };
    const account = Account.register({
      id: container.idGenerator.next(),
      email,
    });
    await accountRepository.insert(account);
    return { accountId: account.id };
  });
}
