import {
  LoginChallenge,
  LoginChallengeId,
} from "@repo/core/domain/account/loginChallenge";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import { ConflictError } from "../errors";
import type { GeneratedId } from "../ports/idGenerator";
import type { ServiceArgs } from "../types";

export type StartEmailLoginInput = Readonly<{
  /**
   * Minted by the browser per "send me the mail" action and resent
   * unchanged when that same request is retried; the code form sends it
   * back to `completeLoginByCode`. Parse it at the transport boundary
   * (`parseGeneratedId`).
   */
  challengeId: GeneratedId;
  email: string;
}>;

/** `LOGIN_CHALLENGE_ID_CONFLICT`: the id was issued for another address. */
export const LOGIN_CHALLENGE_ID_CONFLICT = "LOGIN_CHALLENGE_ID_CONFLICT";

type Replay = "issue" | "replay";

function judge(
  existing: Versioned<LoginChallenge> | null,
  email: EmailAddress,
): Replay {
  if (existing === null) return "issue";
  if (LoginChallenge.isReplayOf(existing.entity, email)) return "replay";
  throw new ConflictError(
    LOGIN_CHALLENGE_ID_CONFLICT,
    "The login challenge id was already issued for another address",
  );
}

/**
 * ACC-01 / MY-02: issues a login challenge for `email` and sends the mail
 * carrying its link and code. Answers the same whether or not an account
 * exists, and creates none. Returns nothing: neither the secrets nor
 * whether the account exists leave this function.
 *
 * Idempotent per `challengeId`: the same id and address again is a no-op
 * success (the mail already went out); the same id with another address
 * is `ConflictError`. The mail is sent between two units of work — a
 * read-only one that settles replays before sending, and a writing one
 * that re-checks the id and stores the challenge — so a failed send stores
 * nothing, and a challenge is stored only for a mail that was accepted.
 *
 * Errors: `BusinessRuleError` `COMMON_INVALID_EMAIL_ADDRESS` (nothing
 * sent); `ConflictError` `LOGIN_CHALLENGE_ID_CONFLICT`; `SystemError` from
 * the mail transport or the store.
 */
export async function startEmailLogin({
  container,
  input,
}: ServiceArgs<StartEmailLoginInput>): Promise<void> {
  const email = EmailAddress.create(input.email);
  const id = LoginChallengeId.create(input.challengeId);
  const now = container.clock.now();

  const found = await container.unitOfWorkProvider.run(
    ({ loginChallengeRepository }) => loginChallengeRepository.findById(id),
  );
  if (judge(found, email) === "replay") return;

  const secrets = container.loginSecretGenerator;
  const { linkToken, code } = await secrets.generate();
  const [linkTokenDigest, codeDigest] = await Promise.all([
    secrets.digest(linkToken),
    secrets.digest(code),
  ]);
  await container.loginMailSender.send({ to: email, linkToken, code });

  await container.unitOfWorkProvider.run(
    async ({ loginChallengeRepository }) => {
      const stored = await loginChallengeRepository.findById(id);
      if (judge(stored, email) === "replay") return;
      await loginChallengeRepository.insert(
        LoginChallenge.issue(
          {
            id,
            email,
            linkTokenDigest,
            codeDigest,
            validForMs: container.loginSettings.challengeValidForMs,
          },
          now,
        ),
      );
    },
  );
}
