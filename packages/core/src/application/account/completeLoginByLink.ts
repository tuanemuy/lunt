import { LoginChallenge } from "@repo/core/domain/account/loginChallenge";
import { LinkToken } from "@repo/core/domain/account/loginSecret";
import type { ServiceArgs } from "../types";
import {
  expectedVersionOf,
  type LoginResult,
  resolveLoginAccount,
  toLoginResult,
} from "./loginAccount";

export type CompleteLoginByLinkInput = Readonly<{
  /** The `token` query parameter of the login mail's link. */
  linkToken: string;
}>;

/**
 * ACC-01 / KEP-04: redeems a login challenge by its mail's link, in
 * whichever browser opened it, and answers the account to log in —
 * creating it on the first login of the address. Redeeming closes the
 * code too. One unit of work: the challenge's `save` and, when new, the
 * account's `insert` commit together; a conflict rolls both back, leaving
 * the link usable for a retry. No domain event.
 *
 * Errors: `BusinessRuleError` `ACCOUNT_LOGIN_CHALLENGE_INVALID` (unknown,
 * used, exhausted or expired — never told apart),
 * `ACCOUNT_INVALID_LOGIN_SECRET` (blank token); `ConflictError` (a
 * concurrent redemption, or the same address registered concurrently).
 */
export async function completeLoginByLink({
  container,
  input,
}: ServiceArgs<CompleteLoginByLinkInput>): Promise<LoginResult> {
  const digest = await container.loginSecretGenerator.digest(
    LinkToken.create(input.linkToken),
  );
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(
    async ({ loginChallengeRepository, accountRepository }) => {
      const found =
        await loginChallengeRepository.findByLinkTokenDigest(digest);
      const redeemed = LoginChallenge.redeemByLink(
        found?.entity ?? null,
        digest,
        now,
      );
      const { account, registered } = await resolveLoginAccount(
        accountRepository,
        redeemed.email,
        container.idGenerator,
      );
      await loginChallengeRepository.save(redeemed, expectedVersionOf(found));
      if (registered) await accountRepository.insert(account);
      return toLoginResult(account);
    },
  );
}
