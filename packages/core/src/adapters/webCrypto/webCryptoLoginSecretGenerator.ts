import {
  LinkToken,
  LoginCode,
  SecretDigest,
} from "@repo/core/domain/account/loginSecret";
import type { LoginSecretGenerator } from "@repo/core/domain/account/ports/loginSecretGenerator";
import { hmacSha256, toBase64Url } from "@repo/core/lib/crypto";

const LINK_TOKEN_BYTES = 32;
const CODE_DIGITS = 6;
const CODE_SPACE = 10 ** CODE_DIGITS;
// Largest multiple of CODE_SPACE below 2^32: drawing below it keeps every
// code equally likely.
const UNBIASED_LIMIT = Math.floor(2 ** 32 / CODE_SPACE) * CODE_SPACE;

function randomCode(): string {
  const draw = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(draw);
    const value = draw[0] ?? 0;
    if (value < UNBIASED_LIMIT) {
      return String(value % CODE_SPACE).padStart(CODE_DIGITS, "0");
    }
  }
}

/**
 * `LoginSecretGenerator` on WebCrypto. Link tokens are 256 random bits
 * (base64url); codes are 6 uniformly random digits, easy to type. Digests
 * are HMAC-SHA-256 under a server key, so a leaked table of 6-digit code
 * digests cannot be reversed by trying every code without that key.
 */
export class WebCryptoLoginSecretGenerator implements LoginSecretGenerator {
  constructor(private readonly key: string) {}

  async generate(): Promise<
    Readonly<{ linkToken: LinkToken; code: LoginCode }>
  > {
    const bytes = new Uint8Array(LINK_TOKEN_BYTES);
    crypto.getRandomValues(bytes);
    return {
      linkToken: LinkToken.create(toBase64Url(bytes)),
      code: LoginCode.create(randomCode()),
    };
  }

  async digest(secret: LinkToken | LoginCode): Promise<SecretDigest> {
    return SecretDigest.create(
      await hmacSha256(this.key, `lunt/login-secret/v1:${secret}`),
    );
  }
}
