import { expectBusinessRuleError } from "@repo/core/adapters/durableObject/__conformance__/assertions";
import type { ExternalProviderKey } from "@repo/core/domain/account/externalIdentity";
import type { ExternalIdentityVerifier } from "@repo/core/domain/account/ports/externalIdentityVerifier";
import { describe, expect, it } from "vitest";

/**
 * How a backend supplies the proofs the cases need. A missing builder
 * skips its cases: against Google, a valid proof needs an interactive
 * login, so only the invalid and cancelled proofs are automated (see the
 * manual procedure in the P1 report).
 */
export type ProofBuilders = Readonly<{
  /** A valid proof of an account whose verified address is `email`. */
  verified?: (email: string) => Promise<string>;
  /** A valid proof of an account without an email address. */
  noEmail?: () => Promise<string>;
  /** A valid proof of an account whose address the provider has not verified. */
  unverified?: () => Promise<string>;
  /** Tampered, expired and foreign proofs — as many as the backend can make. */
  invalid?: () => Promise<readonly string[]>;
  /** The proof of a person who cancelled or refused at the provider. */
  cancelled?: () => Promise<string>;
}>;

export type ExternalIdentityVerifierHarness = Readonly<{
  verifier: ExternalIdentityVerifier;
  provider: ExternalProviderKey;
  unknownProvider: ExternalProviderKey;
  proofs: ProofBuilders;
}>;

/** `spec/testcases/ports/externalIdentityVerifier.md`. */
export function describeExternalIdentityVerifierContract(
  name: string,
  makeHarness: () => Promise<ExternalIdentityVerifierHarness>,
  available: Readonly<Record<keyof ProofBuilders, boolean>>,
): void {
  const required = <K extends keyof ProofBuilders>(
    proofs: ProofBuilders,
    key: K,
  ): NonNullable<ProofBuilders[K]> => {
    const builder = proofs[key];
    if (builder === undefined) throw new Error(`${name} cannot build ${key}`);
    return builder as NonNullable<ProofBuilders[K]>;
  };

  describe(`ExternalIdentityVerifier contract (${name})`, () => {
    it.skipIf(!available.verified)(
      "externalIdentityVerifier#1 設定にある提供元。提供元が確認済みとしたメールアドレスを持つ外部アカウントの、有効な証明 / verify(provider, proof)",
      async () => {
        const h = await makeHarness();
        const proof = await required(
          h.proofs,
          "verified",
        )("  Hanako.Verified@Example.COM ");
        expect(await h.verifier.verify(h.provider, proof)).toEqual({
          outcome: "verified",
          email: "hanako.verified@example.com",
        });
      },
    );

    it.skipIf(!available.noEmail)(
      "externalIdentityVerifier#2 設定にある提供元。メールアドレスを持たない外部アカウントの、有効な証明 / verify(provider, proof)",
      async () => {
        const h = await makeHarness();
        const proof = await required(h.proofs, "noEmail")();
        expect(await h.verifier.verify(h.provider, proof)).toEqual({
          outcome: "email_unavailable",
        });
      },
    );

    it.skipIf(!available.unverified)(
      "externalIdentityVerifier#3 設定にある提供元。メールアドレスはあるが、提供元で確認済みでない外部アカウントの、有効な証明 / verify(provider, proof)",
      async () => {
        const h = await makeHarness();
        const proof = await required(h.proofs, "unverified")();
        expect(await h.verifier.verify(h.provider, proof)).toEqual({
          outcome: "email_unavailable",
        });
      },
    );

    it.skipIf(!available.invalid)(
      "externalIdentityVerifier#4 設定にある提供元。無効な証明（改ざんされている、期限を過ぎている、その提供元のものでない） / verify(provider, proof)",
      async () => {
        const h = await makeHarness();
        const proofs = await required(h.proofs, "invalid")();
        expect(proofs.length).toBeGreaterThan(0);
        for (const proof of proofs) {
          expect(await h.verifier.verify(h.provider, proof)).toEqual({
            outcome: "not_authenticated",
          });
        }
      },
    );

    it.skipIf(!available.cancelled)(
      "externalIdentityVerifier#5 設定にある提供元。利用者が認証または承認をやめて戻ったことを表す証明 / verify(provider, proof)",
      async () => {
        const h = await makeHarness();
        const proof = await required(h.proofs, "cancelled")();
        expect(await h.verifier.verify(h.provider, proof)).toEqual({
          outcome: "not_authenticated",
        });
      },
    );

    it("externalIdentityVerifier#6 設定にない提供元 / verify(provider, proof)", async () => {
      const h = await makeHarness();
      await expectBusinessRuleError(
        h.verifier.verify(h.unknownProvider, "any-proof"),
        "ACCOUNT_UNKNOWN_EXTERNAL_PROVIDER",
      );
    });

    it.skipIf(!available.verified)(
      "externalIdentityVerifier#7 設定にある提供元。同じ外部アカウントの有効な証明を2つ / それぞれ verify",
      async () => {
        const h = await makeHarness();
        const build = required(h.proofs, "verified");
        const first = await build("same@example.com");
        const second = await build("same@example.com");
        expect(first).not.toBe(second);
        const expected = { outcome: "verified", email: "same@example.com" };
        expect(await h.verifier.verify(h.provider, first)).toEqual(expected);
        expect(await h.verifier.verify(h.provider, second)).toEqual(expected);
        expect(await h.verifier.verify(h.provider, first)).toEqual(expected);
      },
    );
  });
}
