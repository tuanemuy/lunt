import { LinkToken, LoginCode } from "@repo/core/domain/account/loginSecret";
import type { LoginSecretGenerator } from "@repo/core/domain/account/ports/loginSecretGenerator";
import { describe, expect, it } from "vitest";

/** The same string with its last character replaced by a different one. */
function oneCharOff(value: string): string {
  const last = value.at(-1) ?? "0";
  const replacement = /[0-8]/.test(last)
    ? String(Number(last) + 1)
    : last === "9"
      ? "0"
      : last === "a"
        ? "b"
        : "a";
  return `${value.slice(0, -1)}${replacement}`;
}

/** `spec/testcases/ports/loginSecretGenerator.md`. */
export function describeLoginSecretGeneratorContract(
  makeGenerator: () => LoginSecretGenerator,
): void {
  describe("LoginSecretGenerator contract", () => {
    it("loginSecretGenerator#1 なし / generate() の linkToken を LinkToken.create、code を LoginCode.create に渡す", async () => {
      const { linkToken, code } = await makeGenerator().generate();
      expect(LinkToken.create(linkToken)).toBe(linkToken);
      expect(LoginCode.create(code)).toBe(code);
      for (const value of [linkToken, code]) {
        expect(value.length).toBeGreaterThan(0);
        expect(value).toBe(value.trim());
      }
    });

    it("loginSecretGenerator#2 なし / generate() を1000回呼ぶ", async () => {
      const generator = makeGenerator();
      const tokens = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        tokens.add((await generator.generate()).linkToken);
      }
      expect(tokens.size).toBe(1000);
    });

    it("loginSecretGenerator#3 generate() で得た linkToken / 同じ linkToken で digest を2回呼ぶ", async () => {
      const generator = makeGenerator();
      const { linkToken } = await generator.generate();
      expect(await generator.digest(linkToken)).toBe(
        await generator.digest(linkToken),
      );
    });

    it("loginSecretGenerator#4 generate() で得た code / 同じ code で digest を2回呼ぶ", async () => {
      const generator = makeGenerator();
      const { code } = await generator.generate();
      expect(await generator.digest(code)).toBe(await generator.digest(code));
    });

    it("loginSecretGenerator#5 generate() を2回呼んで得た、違う2つの linkToken / それぞれ digest", async () => {
      const generator = makeGenerator();
      const first = (await generator.generate()).linkToken;
      const second = (await generator.generate()).linkToken;
      expect(first).not.toBe(second);
      expect(await generator.digest(first)).not.toBe(
        await generator.digest(second),
      );
    });

    it("loginSecretGenerator#6 generate() で得た code と、1文字だけ違うコード / それぞれ digest", async () => {
      const generator = makeGenerator();
      const { code } = await generator.generate();
      const typo = LoginCode.create(oneCharOff(code));
      expect(typo).not.toBe(code);
      expect(await generator.digest(code)).not.toBe(
        await generator.digest(typo),
      );
    });

    it("loginSecretGenerator#7 generate() で得た linkToken と code / それぞれ digest", async () => {
      const generator = makeGenerator();
      const { linkToken, code } = await generator.generate();
      for (const secret of [linkToken, code]) {
        const digest = await generator.digest(secret);
        expect(digest.length).toBeGreaterThan(0);
        expect(digest).not.toBe(secret);
      }
    });

    it("loginSecretGenerator#8 LinkToken.create で作った、generate() によらない値 / digest", async () => {
      const generator = makeGenerator();
      const typed = LinkToken.create("  typed-by-a-person-123  ");
      const digest = await generator.digest(typed);
      expect(digest.length).toBeGreaterThan(0);
      expect(digest).not.toBe(typed);
      expect(await generator.digest(LinkToken.create(typed))).toBe(digest);
    });
  });
}
