import type { LinkToken, LoginCode, SecretDigest } from "../loginSecret";

/**
 * Mints a login mail's secrets and turns secrets into digests
 * (`spec/domains/account.md` 「LoginSecretGenerator」).
 *
 * - `generate`: fresh secrets per call; link tokens never repeat, so a
 *   token alone identifies its challenge. Both values pass
 *   `LinkToken.create` / `LoginCode.create` unchanged.
 * - `digest`: deterministic and injective — equal digests mean equal
 *   inputs — non-empty and different from its input. Works for any
 *   value, including what a user typed.
 *
 * Unguessable values, digests that cannot be reversed, and a code a
 * person can type are the adapter's responsibility.
 */
export interface LoginSecretGenerator {
  generate(): Promise<Readonly<{ linkToken: LinkToken; code: LoginCode }>>;
  digest(secret: LinkToken | LoginCode): Promise<SecretDigest>;
}
