import type { Actor } from "@repo/core/domain/common/actor";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { RequestContainer } from "../di/types";
import { UnauthorizedError } from "../errors";

export type MyAccount = Readonly<{ email: EmailAddress }>;

/**
 * ACC-01 / MY-01, MY-02: the logged-in account's email address. Reads only
 * the actor's own account, in a unit of work without writes.
 *
 * Errors: `UnauthorizedError` `ACCOUNT_NOT_FOUND` when the account was
 * withdrawn after the `Actor` was built (`spec/domains/index.md`
 * 「操作する人」).
 */
export async function getMyAccount({
  container,
  actor,
}: Readonly<{
  container: RequestContainer;
  actor: Actor;
}>): Promise<MyAccount> {
  const found = await container.unitOfWorkProvider.run(
    ({ accountRepository }) => accountRepository.findById(actor.accountId),
  );
  if (found === null) {
    throw new UnauthorizedError("ACCOUNT_NOT_FOUND", "Not logged in");
  }
  return { email: found.entity.email };
}
