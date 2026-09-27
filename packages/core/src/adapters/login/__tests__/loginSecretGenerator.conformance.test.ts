import { describe, expect, it } from "vitest";
import { describeLoginSecretGeneratorContract } from "../__conformance__/loginSecretGenerator";
import { WebCryptoLoginSecretGenerator } from "../webCryptoLoginSecretGenerator";

// The production adapter is pure WebCrypto: it runs as-is in Node. There is
// no separate fake — usecase tests use this adapter too.
describeLoginSecretGeneratorContract(
  () => new WebCryptoLoginSecretGenerator("conformance-key-0000000000000000"),
);

describe("WebCryptoLoginSecretGenerator", () => {
  it("mints six-digit codes and 256-bit base64url link tokens", async () => {
    const generator = new WebCryptoLoginSecretGenerator("k".repeat(32));
    for (let i = 0; i < 50; i++) {
      const { linkToken, code } = await generator.generate();
      expect(code).toMatch(/^\d{6}$/);
      expect(linkToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it("keys its digests: another key gives another digest", async () => {
    const a = new WebCryptoLoginSecretGenerator("a".repeat(32));
    const b = new WebCryptoLoginSecretGenerator("b".repeat(32));
    const { code } = await a.generate();
    expect(await a.digest(code)).not.toBe(await b.digest(code));
  });
});
