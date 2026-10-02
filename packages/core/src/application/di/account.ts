import {
  FakeIdpProvider,
  FakeIdpScreen,
} from "@repo/core/adapters/fake/fakeIdp";
import { GoogleOidcProvider } from "@repo/core/adapters/google/googleOidc";
import {
  type ExternalIdentityProvider,
  ExternalIdentityProviders,
} from "@repo/core/adapters/shared/externalIdentityProviders";
import { MailLoginMailSender } from "@repo/core/adapters/shared/mailLoginMailSender";
import { WebCryptoLoginSecretGenerator } from "@repo/core/adapters/webCrypto/webCryptoLoginSecretGenerator";
import { content } from "@repo/core/config";
import { ExternalProviderKey } from "@repo/core/domain/account/externalIdentity";
import { z } from "zod";
import type { AccountServices, LoginSettings } from "../account/services";
import { createMailTransport, type MailEnv, readMailSettings } from "./mail";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Account's wiring reads (all strings, all optional). */
export type AccountEnv = MailEnv &
  Readonly<{
    APP_URL: string;
    /** `fake` (default; development tools only) or `google`. */
    EXTERNAL_IDP?: string | undefined;
    GOOGLE_CLIENT_ID?: string | undefined;
    /** Secret: `wrangler secret put GOOGLE_CLIENT_SECRET`. */
    GOOGLE_CLIENT_SECRET?: string | undefined;
    /** Login link and code lifetime in ms (default 15 minutes). */
    LOGIN_CHALLENGE_TTL_MS?: string | undefined;
    /** Wrong codes that close a login challenge (default 5). */
    LOGIN_MAX_CODE_ATTEMPTS?: string | undefined;
    /** Unexpired login mails an address may have at once (default 5). */
    LOGIN_MAX_UNEXPIRED_CHALLENGES?: string | undefined;
  }>;

/** The key the login screen and the callback route use for Google. */
export const GOOGLE_PROVIDER_KEY = ExternalProviderKey.create("google");

export const DEFAULT_LOGIN_CHALLENGE_TTL_MS = 15 * 60 * 1000;
export const DEFAULT_LOGIN_MAX_CODE_ATTEMPTS = 5;
export const DEFAULT_LOGIN_MAX_UNEXPIRED_CHALLENGES = 5;

const loginSettingsSchema = z.object({
  challengeValidForMs: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_LOGIN_CHALLENGE_TTL_MS),
  maxCodeAttempts: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_LOGIN_MAX_CODE_ATTEMPTS),
  maxUnexpiredChallenges: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_LOGIN_MAX_UNEXPIRED_CHALLENGES),
});

export function readLoginSettings(env: AccountEnv): LoginSettings {
  return loginSettingsSchema.parse({
    challengeValidForMs: env.LOGIN_CHALLENGE_TTL_MS,
    maxCodeAttempts: env.LOGIN_MAX_CODE_ATTEMPTS,
    maxUnexpiredChallenges: env.LOGIN_MAX_UNEXPIRED_CHALLENGES,
  });
}

const identitySchema = z.discriminatedUnion("idp", [
  z.object({ idp: z.literal("fake") }),
  z.object({
    idp: z.literal("google"),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  }),
]);

export type ExternalIdpSettings = z.infer<typeof identitySchema>;

/**
 * Which provider stands behind the `google` key: the real Google, or the
 * development fake (refused unless the development tools are on).
 */
export function readExternalIdpSettings(
  env: AccountEnv,
  devTools: boolean,
): ExternalIdpSettings {
  const parsed = identitySchema.parse({
    idp: env.EXTERNAL_IDP ?? "fake",
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });
  if (parsed.idp === "fake" && !devTools) {
    throw new Error(
      "EXTERNAL_IDP=fake needs DEV_TOOLS=1; set EXTERNAL_IDP=google",
    );
  }
  return parsed;
}

export function createAccountServices(
  env: AccountEnv,
  deps: ServiceDeps,
): AccountServices {
  const loginSettings = readLoginSettings(env);
  const mail = createMailTransport(
    readMailSettings(env, deps.runtime.devTools),
    deps,
  );
  const idp = readExternalIdpSettings(env, deps.runtime.devTools);
  const google: ExternalIdentityProvider =
    idp.idp === "google"
      ? new GoogleOidcProvider({
          clientId: idp.clientId,
          clientSecret: idp.clientSecret,
        })
      : new FakeIdpProvider({
          secret: deps.runtime.sessionSecret,
          appUrl: env.APP_URL,
          clock: deps.shared.clock,
        });
  const providers = new ExternalIdentityProviders(
    new Map([[GOOGLE_PROVIDER_KEY, google]]),
  );
  return {
    loginSettings,
    loginSecretGenerator: new WebCryptoLoginSecretGenerator(
      deps.runtime.sessionSecret,
    ),
    loginMailSender: new MailLoginMailSender(mail.transport, {
      appUrl: env.APP_URL,
      siteName: content.siteName,
      validForMs: loginSettings.challengeValidForMs,
    }),
    externalIdentityVerifier: providers,
    externalLoginStarter: providers,
    devInbox: mail.devInbox,
    fakeIdp:
      idp.idp === "fake"
        ? new FakeIdpScreen({
            secret: deps.runtime.sessionSecret,
            appUrl: env.APP_URL,
          })
        : null,
  };
}
