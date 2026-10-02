import { fakeIdpProof } from "@repo/core/adapters/fake/testing/fakeIdpFlow";
import { ExternalProviderKey } from "@repo/core/domain/account/externalIdentity";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { describe, expect, it } from "vitest";
import { beginExternalLogin } from "../beginExternalLogin";
import { loginWithExternalAccount } from "../loginWithExternalAccount";
import { createLoginTestContext, expectBusinessCode } from "./loginFixtures";
import {
  ScriptedExternalIdentityVerifier,
  TEST_SECRET_KEY,
} from "./testServices";

const EMAIL = "hanako@example.com";

function scripted() {
  const verifier = new ScriptedExternalIdentityVerifier(["google"]);
  const t = createLoginTestContext({
    overrides: () => ({ externalIdentityVerifier: verifier }),
  });
  const login = (provider = "google") =>
    loginWithExternalAccount({
      container: t.container,
      input: { provider, proof: "opaque-proof" },
    });
  return { t, verifier, login };
}

describe("loginWithExternalAccount", () => {
  it("loginWithExternalAccount#1 ExternalIdentityVerifier.verify が verified とメールアドレスを返す。そのメールアドレスのアカウントがない / 提供元と証明を渡して実行する", async () => {
    const { t, verifier, login } = scripted();
    verifier.nextIdentity = {
      outcome: "verified",
      email: EmailAddress.create(EMAIL),
    };
    const result = await login();
    const account = await t.accountOf(EMAIL);
    expect(result).toEqual({ accountId: account?.id, email: EMAIL });
    expect(verifier.calls).toEqual([
      { provider: "google", proof: "opaque-proof" },
    ]);
    expect(await t.storedEvents()).toEqual([]);
  });

  it("loginWithExternalAccount#2 verify が verified とメールアドレスを返す。そのメールアドレスのアカウントが、メールアドレスでのログインで作られている / 提供元と証明を渡して実行する", async () => {
    const { t, verifier, login } = scripted();
    const issued = await t.start(EMAIL);
    const byMail = await t.byCode(issued.challengeId, issued.code);
    const before = await t.container.unitOfWorkProvider.run(
      ({ accountRepository }) => accountRepository.findById(byMail.accountId),
    );
    verifier.nextIdentity = {
      outcome: "verified",
      email: EmailAddress.create(EMAIL),
    };
    expect(await login()).toEqual(byMail);
    const after = await t.container.unitOfWorkProvider.run(
      ({ accountRepository }) => accountRepository.findById(byMail.accountId),
    );
    expect(after).toEqual(before);
  });

  it("loginWithExternalAccount#3 verify が email_unavailable を返す / 提供元と証明を渡して実行する", async () => {
    const { t, verifier, login } = scripted();
    verifier.nextIdentity = { outcome: "email_unavailable" };
    await expectBusinessCode(login(), "ACCOUNT_VERIFIED_EMAIL_REQUIRED");
    expect(await t.accountOf(EMAIL)).toBeNull();
  });

  it("loginWithExternalAccount#4 verify が not_authenticated を返す / 提供元と証明を渡して実行する", async () => {
    const { t, verifier, login } = scripted();
    verifier.nextIdentity = { outcome: "not_authenticated" };
    await expectBusinessCode(
      login(),
      "ACCOUNT_EXTERNAL_LOGIN_NOT_AUTHENTICATED",
    );
    expect(await t.accountOf(EMAIL)).toBeNull();
  });

  it("loginWithExternalAccount#5 なし / 設定にない提供元と証明を渡して実行する", async () => {
    const { t, verifier, login } = scripted();
    verifier.nextIdentity = {
      outcome: "verified",
      email: EmailAddress.create(EMAIL),
    };
    await expectBusinessCode(
      login("facebook"),
      "ACCOUNT_UNKNOWN_EXTERNAL_PROVIDER",
    );
    expect(await t.accountOf(EMAIL)).toBeNull();
  });

  it("logs in end to end through the development fake provider", async () => {
    const t = createLoginTestContext();
    const provider = ExternalProviderKey.create("google");
    const started = await beginExternalLogin({
      container: t.container,
      input: {
        provider: "google",
        redirectUri: "http://localhost:3000/login/external/google/callback",
      },
    });
    expect(started.authorizationUrl).toMatch(
      /^http:\/\/localhost:3000\/__dev\/idp\/authorize\?/,
    );
    const proof = await fakeIdpProof({
      starter: t.container.externalLoginStarter,
      provider,
      secret: TEST_SECRET_KEY,
      now: t.clock.now(),
      choice: { kind: "verified", email: "Taro@Example.com" },
    });
    const result = await loginWithExternalAccount({
      container: t.container,
      input: { provider: "google", proof },
    });
    expect(result.email).toBe("taro@example.com");
    expect((await t.accountOf("taro@example.com"))?.id).toBe(result.accountId);
  });

  it("refuses to start a login with an unconfigured provider", async () => {
    const t = createLoginTestContext();
    await expectBusinessCode(
      beginExternalLogin({
        container: t.container,
        input: { provider: "unknown", redirectUri: "http://localhost:3000/cb" },
      }),
      "ACCOUNT_UNKNOWN_EXTERNAL_PROVIDER",
    );
  });
});
