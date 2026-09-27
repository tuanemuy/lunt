import {
  type CodeRedemption,
  LoginChallenge,
  LoginChallengeId,
} from "@repo/core/domain/account/loginChallenge";
import { LoginCode } from "@repo/core/domain/account/loginSecret";
import type { ServiceArgs } from "../types";
import {
  expectedVersionOf,
  type LoginResult,
  resolveLoginAccount,
  toLoginResult,
} from "./loginAccount";

export type CompleteLoginByCodeInput = Readonly<{
  /**
   * The `challengeId` the same browser passed to `startEmailLogin`. An id
   * of the wrong format simply matches no challenge.
   */
  challengeId: string;
  code: string;
}>;

type Settled =
  | Readonly<{ kind: "loggedIn"; result: LoginResult }>
  | Readonly<{
      kind: "mismatch";
      error: Extract<CodeRedemption, { outcome: "mismatch" }>["error"];
    }>;

/**
 * ACC-01 / KEP-04: redeems a login challenge by the code typed in the
 * browser that asked for the mail, and answers the account to log in —
 * creating it on the first login of the address. Redeeming closes the
 * link too.
 *
 * A wrong code is saved — one more failed attempt, or `exhausted` at
 * `maxCodeAttempts` (I-18) — and committed before its error is thrown, so
 * failed attempts are never lost. Concurrent attempts are serialized by
 * the challenge's optimistic lock (the loser gets `ConflictError`).
 *
 * Errors: `BusinessRuleError` `ACCOUNT_LOGIN_CODE_MISMATCH` (wrong code;
 * may retry), `ACCOUNT_LOGIN_CHALLENGE_INVALID` (unknown, used, expired,
 * or exhausted — including by this attempt), `ACCOUNT_INVALID_LOGIN_SECRET`
 * (blank code); `ConflictError` (concurrent redemption or registration).
 */
export async function completeLoginByCode({
  container,
  input,
}: ServiceArgs<CompleteLoginByCodeInput>): Promise<LoginResult> {
  const digest = await container.loginSecretGenerator.digest(
    LoginCode.create(input.code),
  );
  const parsedId = container.idGenerator.parse(input.challengeId);
  const now = container.clock.now();
  const settled = await container.unitOfWorkProvider.run(
    async ({
      loginChallengeRepository,
      accountRepository,
    }): Promise<Settled> => {
      const found =
        parsedId === null
          ? null
          : await loginChallengeRepository.findById(
              LoginChallengeId.create(parsedId),
            );
      const redemption = LoginChallenge.redeemByCode(
        found?.entity ?? null,
        digest,
        container.loginSettings.maxCodeAttempts,
        now,
      );
      const expected = expectedVersionOf(found);
      if (redemption.outcome === "mismatch") {
        await loginChallengeRepository.save(redemption.challenge, expected);
        return { kind: "mismatch", error: redemption.error };
      }
      const { account, registered } = await resolveLoginAccount(
        accountRepository,
        redemption.challenge.email,
        container.idGenerator,
      );
      await loginChallengeRepository.save(redemption.challenge, expected);
      if (registered) await accountRepository.insert(account);
      return { kind: "loggedIn", result: toLoginResult(account) };
    },
  );
  if (settled.kind === "mismatch") throw settled.error;
  return settled.result;
}
