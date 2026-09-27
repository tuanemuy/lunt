import { FakeIdpProvider } from "@repo/core/adapters/identity/fakeIdp";
import { ExternalIdentityProviders } from "@repo/core/adapters/identity/providers";
import { MailLoginMailSender } from "@repo/core/adapters/login/mailLoginMailSender";
import { WebCryptoLoginSecretGenerator } from "@repo/core/adapters/login/webCryptoLoginSecretGenerator";
import { DoDevInbox } from "@repo/core/adapters/mail/devInbox";
import { InMemoryMailTransport } from "@repo/core/adapters/mail/testing/inMemoryMailTransport";
import { AccountErrorCode } from "@repo/core/domain/account/errorCode";
import type { ExternalIdentity } from "@repo/core/domain/account/externalIdentity";
import type { ExternalIdentityVerifier } from "@repo/core/domain/account/ports/externalIdentityVerifier";
import { BusinessRuleError } from "@repo/core/domain/error";
import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import { GOOGLE_PROVIDER_KEY } from "../../di/account";
import type { AccountServices } from "../services";

export const TEST_APP_URL = "http://localhost:3000";
export const TEST_SECRET_KEY = "test-login-secret-key-0000000000000000";
export const TEST_LOGIN_SETTINGS = {
  challengeValidForMs: 15 * 60 * 1000,
  maxCodeAttempts: 3,
  maxUnexpiredChallenges: 5,
} as const;

/**
 * A verifier a test scripts: answers the next `verify` with whatever was
 * queued (`nextIdentity`), for providers in `known`.
 */
export class ScriptedExternalIdentityVerifier
  implements ExternalIdentityVerifier
{
  readonly calls: { provider: string; proof: string }[] = [];
  nextIdentity: ExternalIdentity = { outcome: "not_authenticated" };

  constructor(private readonly known: readonly string[] = ["google"]) {}

  async verify(provider: string, proof: string): Promise<ExternalIdentity> {
    if (!this.known.includes(provider)) {
      throw new BusinessRuleError(
        AccountErrorCode.UnknownExternalProvider,
        `Unknown external provider: ${provider}`,
      );
    }
    this.calls.push({ provider, proof });
    return this.nextIdentity;
  }
}

/**
 * Account's container ports for usecase tests: fakes for external IO
 * (mail goes to an in-memory transport; the external provider is the
 * development fake), the real adapters for everything else. Tests that
 * need to look at the sent mail pass their own transport through
 * `createTestContainer`'s `overrides` (see `loginFixtures.ts`).
 */
export function createTestAccountServices(
  deps: TestServiceDeps,
  transport: InMemoryMailTransport = new InMemoryMailTransport(),
): AccountServices {
  const providers = new ExternalIdentityProviders(
    new Map([
      [
        GOOGLE_PROVIDER_KEY,
        new FakeIdpProvider({
          secret: TEST_SECRET_KEY,
          appUrl: TEST_APP_URL,
          clock: deps.clock,
        }),
      ],
    ]),
  );
  return {
    loginSettings: TEST_LOGIN_SETTINGS,
    loginSecretGenerator: new WebCryptoLoginSecretGenerator(TEST_SECRET_KEY),
    loginMailSender: new MailLoginMailSender(transport, {
      appUrl: TEST_APP_URL,
      siteName: "Lunt",
      validForMs: TEST_LOGIN_SETTINGS.challengeValidForMs,
    }),
    externalIdentityVerifier: providers,
    externalLoginStarter: providers,
    devInbox: new DoDevInbox(deps.client),
  };
}
