import { FakeClock } from "@repo/core/application/__tests__/fakes/fakeClock";
import {
  ExternalLoginProof,
  type PendingExternalLogin,
} from "@repo/core/application/account/externalLogin";
import { ExternalProviderKey } from "@repo/core/domain/account/externalIdentity";
import { describe, expect } from "vitest";
import { describeExternalIdentityVerifierContract } from "../__conformance__/externalIdentityVerifier";
import { FakeIdpProvider } from "../fakeIdp";
import { GoogleOidcProvider } from "../googleOidc";
import { ExternalIdentityProviders } from "../providers";
import { fakeIdpProof, TEST_REDIRECT_URI } from "../testing/fakeIdpFlow";

const PROVIDER = ExternalProviderKey.create("google");
const UNKNOWN = ExternalProviderKey.create("unknown-provider");
const SECRET = "fake-idp-conformance-secret-000000000";

/** Replaces the value of `code` in a proof's callback with `code(old)`. */
function withCode(proof: string, code: (old: string) => string): string {
  const decoded = ExternalLoginProof.decode(proof);
  if (decoded === null) throw new Error("not a proof");
  const params = new URLSearchParams(decoded.callbackQuery);
  params.set("code", code(params.get("code") ?? ""));
  return ExternalLoginProof.encode(decoded, `?${params}`);
}

// The development fake provider, driven through the same browser round
// trip the app uses.
describeExternalIdentityVerifierContract(
  "fake provider",
  async () => {
    const clock = new FakeClock();
    const providers = (secret: string) =>
      new ExternalIdentityProviders(
        new Map([
          [
            PROVIDER,
            new FakeIdpProvider({
              secret,
              appUrl: "http://localhost:3000",
              clock,
            }),
          ],
        ]),
      );
    const verifier = providers(SECRET);
    const proof = (choice: Parameters<typeof fakeIdpProof>[0]["choice"]) =>
      fakeIdpProof({
        starter: verifier,
        provider: PROVIDER,
        secret: SECRET,
        now: clock.now(),
        choice,
      });
    return {
      verifier,
      provider: PROVIDER,
      unknownProvider: UNKNOWN,
      proofs: {
        verified: (email) => proof({ kind: "verified", email }),
        noEmail: () => proof({ kind: "no_email" }),
        unverified: () =>
          proof({ kind: "unverified", email: "unverified@example.com" }),
        cancelled: () => proof({ kind: "cancel" }),
        invalid: async () => {
          // Each proof below differs from `valid` in one respect only, and
          // `valid` itself verifies, so every check must hold on its own.
          const valid = await proof({
            kind: "verified",
            email: "a@example.com",
          });
          expect(await verifier.verify(PROVIDER, valid)).toMatchObject({
            outcome: "verified",
          });
          const decoded = ExternalLoginProof.decode(valid);
          if (decoded === null) throw new Error("not a proof");
          const alter = (change: Partial<typeof decoded>) =>
            ExternalLoginProof.encode(
              { ...decoded, ...change },
              change.callbackQuery ?? decoded.callbackQuery,
            );
          const tampered = withCode(valid, (code) => {
            const [body = "", signature = ""] = code.split(".");
            const flipped = signature.startsWith("A") ? "B" : "A";
            return `${body}.${flipped}${signature.slice(1)}`;
          });
          const expired = await fakeIdpProof({
            starter: verifier,
            provider: PROVIDER,
            secret: SECRET,
            now: new Date(clock.now().getTime() - 10 * 60 * 1000),
            choice: { kind: "verified", email: "a@example.com" },
          });
          const foreign = await fakeIdpProof({
            starter: providers("another-server-secret-00000000000000"),
            provider: PROVIDER,
            secret: "another-server-secret-00000000000000",
            now: clock.now(),
            choice: { kind: "verified", email: "a@example.com" },
          });
          const otherNonce = alter({ nonce: "another-attempt-nonce" });
          const otherVerifier = alter({ codeVerifier: "v".repeat(43) });
          const otherRedirect = alter({
            redirectUri: "http://localhost:3000/elsewhere/callback",
          });
          const otherState = alter({ state: "another-attempt-state" });
          return [
            tampered,
            expired,
            foreign,
            otherNonce,
            otherVerifier,
            otherRedirect,
            otherState,
            "not-a-proof",
          ];
        },
      },
    };
  },
  {
    verified: true,
    noEmail: true,
    unverified: true,
    invalid: true,
    cancelled: true,
  },
);

// Google, only with credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) and
// network access. A valid proof needs a person to log in, so only the
// cases with invalid or cancelled proofs run here; the rest are checked by
// hand (P1 report: real-connection verification).
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleReady =
  googleClientId !== undefined && googleClientSecret !== undefined;

describe.skipIf(!googleReady)("Google credentials present", () => {
  describeExternalIdentityVerifierContract(
    "Google",
    async () => {
      const verifier = new ExternalIdentityProviders(
        new Map([
          [
            PROVIDER,
            new GoogleOidcProvider({
              clientId: googleClientId ?? "",
              clientSecret: googleClientSecret ?? "",
            }),
          ],
        ]),
      );
      const pending = async (): Promise<PendingExternalLogin> =>
        (await verifier.begin(PROVIDER, TEST_REDIRECT_URI)).pending;
      return {
        verifier,
        provider: PROVIDER,
        unknownProvider: UNKNOWN,
        proofs: {
          invalid: async () => {
            const attempt = await pending();
            const fakeCode = withCode(
              ExternalLoginProof.encode(attempt, `?state=${attempt.state}`),
              () => "4/0AanotAcodeGoogleEverIssued",
            );
            const foreignState = ExternalLoginProof.encode(
              attempt,
              `?code=anything&state=not-${attempt.state}`,
            );
            return [fakeCode, foreignState, "not-a-proof"];
          },
          cancelled: async () => {
            const attempt = await pending();
            return ExternalLoginProof.encode(
              attempt,
              `?error=access_denied&state=${attempt.state}`,
            );
          },
        },
      };
    },
    {
      verified: false,
      noEmail: false,
      unverified: false,
      invalid: true,
      cancelled: true,
    },
  );
});
