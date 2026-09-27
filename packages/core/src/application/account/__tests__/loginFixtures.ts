import { readLoginMail } from "@repo/core/adapters/login/mailLoginMailSender";
import { InMemoryMailTransport } from "@repo/core/adapters/mail/testing/inMemoryMailTransport";
import { Account } from "@repo/core/domain/account/entity";
import {
  type LoginChallenge,
  LoginChallengeId,
} from "@repo/core/domain/account/loginChallenge";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import { expect } from "vitest";
import { FakeIdGenerator } from "../../__tests__/fakes/fakeIdGenerator";
import {
  createTestContainer,
  type TestContainerOptions,
  type TestContext,
} from "../../__tests__/testContainer";
import type { GeneratedId } from "../../ports/idGenerator";
import { completeLoginByCode } from "../completeLoginByCode";
import { completeLoginByLink } from "../completeLoginByLink";
import { startEmailLogin } from "../startEmailLogin";
import {
  createTestAccountServices,
  TEST_APP_URL,
  TEST_LOGIN_SETTINGS,
} from "./testServices";

export type IssuedLogin = Readonly<{
  challengeId: GeneratedId;
  email: string;
  linkToken: string;
  code: string;
}>;

export type LoginTestContext = TestContext &
  Readonly<{
    transport: InMemoryMailTransport;
    /** A fresh browser-minted challenge id. */
    newChallengeId(): GeneratedId;
    /** `startEmailLogin`, then the link token and code of the mail it sent. */
    start(email: string, challengeId?: GeneratedId): Promise<IssuedLogin>;
    byLink(linkToken: string): ReturnType<typeof completeLoginByLink>;
    byCode(
      challengeId: string,
      code: string,
    ): ReturnType<typeof completeLoginByCode>;
    challenge(id: string): Promise<Versioned<LoginChallenge> | null>;
    accountOf(email: string): Promise<Account | null>;
    /** Registers an account directly, as an earlier login would have. */
    register(email: string): Promise<Account>;
  }>;

/** A code differing from `code` in its last digit. */
export function wrongCode(code: string): string {
  const last = Number(code.at(-1));
  return `${code.slice(0, -1)}${(last + 1) % 10}`;
}

export const VALID_FOR_MS = TEST_LOGIN_SETTINGS.challengeValidForMs;
export const MAX_CODE_ATTEMPTS = TEST_LOGIN_SETTINGS.maxCodeAttempts;

/**
 * The usecase test container with Account's services over an in-memory
 * mail transport the test reads, plus the steps login tests share.
 */
export function createLoginTestContext(
  options: TestContainerOptions = {},
): LoginTestContext {
  const transport = new InMemoryMailTransport();
  const ctx = createTestContainer({
    ...options,
    overrides: (deps) => ({
      ...createTestAccountServices(deps, transport),
      ...(options.overrides?.(deps) ?? {}),
    }),
  });
  const challengeIds = new FakeIdGenerator(0x5_0000);
  const { container } = ctx;

  const lastMailTo = (email: string) => {
    const to = EmailAddress.create(email);
    const mail = transport.sentTo(to).at(-1);
    if (mail === undefined) throw new Error(`no mail to ${to}`);
    const read = readLoginMail(mail.text, TEST_APP_URL);
    if (read.linkToken === null || read.code === null) {
      throw new Error("the login mail lacks its link or code");
    }
    return { linkToken: read.linkToken, code: read.code };
  };

  const self: LoginTestContext = {
    ...ctx,
    transport,
    newChallengeId: () => challengeIds.next(),
    start: async (email, challengeId = challengeIds.next()) => {
      await startEmailLogin({ container, input: { challengeId, email } });
      return { challengeId, email, ...lastMailTo(email) };
    },
    byLink: (linkToken) =>
      completeLoginByLink({ container, input: { linkToken } }),
    byCode: (challengeId, code) =>
      completeLoginByCode({ container, input: { challengeId, code } }),
    challenge: (id) =>
      container.unitOfWorkProvider.run(({ loginChallengeRepository }) =>
        loginChallengeRepository.findById(LoginChallengeId.create(id)),
      ),
    accountOf: async (email) =>
      (
        await container.unitOfWorkProvider.run(({ accountRepository }) =>
          accountRepository.findByEmail(EmailAddress.create(email)),
        )
      )?.entity ?? null,
    register: async (email) => {
      const account = Account.register({
        id: container.idGenerator.next(),
        email,
      });
      await container.unitOfWorkProvider.run(({ accountRepository }) =>
        accountRepository.insert(account),
      );
      return account;
    },
  };
  return self;
}

/** Asserts `promise` rejects with a `BusinessRuleError` of `code`. */
export async function expectBusinessCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toMatchObject({ name: "BusinessRuleError", code });
}
