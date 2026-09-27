import type {
  ExternalIdentity,
  ExternalProviderKey,
} from "../externalIdentity";

/**
 * Verifies what a person brought back from an external account provider
 * (`spec/domains/account.md` 「ExternalIdentityVerifier」). `proof` is
 * opaque here; the adapter defines it.
 *
 * - `verified` only with an address the provider marks as verified;
 *   `email_unavailable` when there is none or it is unverified;
 *   `not_authenticated` when the proof is invalid or the person
 *   cancelled.
 * - An unconfigured `provider` is `BusinessRuleError`
 *   (`ACCOUNT_UNKNOWN_EXTERNAL_PROVIDER`).
 * - The three outcomes come only from an actual provider answer: an
 *   outage or a network failure is a `SystemError`, never
 *   `not_authenticated`.
 * - Nothing is stored; no link between the external account and a Lunt
 *   account is kept.
 */
export interface ExternalIdentityVerifier {
  verify(
    provider: ExternalProviderKey,
    proof: string,
  ): Promise<ExternalIdentity>;
}
