import { readLoginMail } from "@repo/core/adapters/shared/mailLoginMailSender";
import { LinkToken, LoginCode } from "@repo/core/domain/account/loginSecret";
import { describe, expect, it } from "vitest";
import { ConflictError } from "../../errors";
import type { UnitOfWorkProvider } from "../../execution/unitOfWork";
import { startEmailLogin } from "../startEmailLogin";
import {
  createLoginTestContext,
  expectBusinessCode,
  MAX_CODE_ATTEMPTS,
  VALID_FOR_MS,
  wrongCode,
} from "./loginFixtures";
import { TEST_APP_URL, TEST_LOGIN_SETTINGS } from "./testServices";

/** A login test context with `maxUnexpiredChallenges` = 3. */
const capped = () =>
  createLoginTestContext({
    overrides: () => ({
      loginSettings: { ...TEST_LOGIN_SETTINGS, maxUnexpiredChallenges: 3 },
    }),
  });

const EMAIL = "hanako@example.com";

describe("startEmailLogin", () => {
  it("startEmailLogin#1 そのメールアドレスのアカウントがない / 新しい LoginChallengeId と、形式の正しいメールアドレスで実行する", async () => {
    const t = createLoginTestContext();
    const now = t.clock.now();
    const challengeId = t.newChallengeId();
    await expect(
      startEmailLogin({
        container: t.container,
        input: { challengeId, email: " Hanako@Example.com " },
      }),
    ).resolves.toBeUndefined();

    const mails = t.transport.sentTo(EMAIL);
    expect(t.transport.sent).toHaveLength(1);
    expect(mails).toHaveLength(1);
    const { linkToken, code } = readLoginMail(
      mails[0]?.text ?? "",
      TEST_APP_URL,
    );
    if (linkToken === null || code === null) throw new Error("incomplete mail");

    const stored = await t.challenge(challengeId);
    expect(stored?.entity).toMatchObject({
      status: "pending",
      failedCodeAttempts: 0,
      email: EMAIL,
      expiresAt: new Date(now.getTime() + VALID_FOR_MS),
    });
    const secrets = t.container.loginSecretGenerator;
    expect(stored?.entity.linkTokenDigest).toBe(
      await secrets.digest(LinkToken.create(linkToken)),
    );
    expect(stored?.entity.codeDigest).toBe(
      await secrets.digest(LoginCode.create(code)),
    );
    const persisted = JSON.stringify(stored?.entity);
    expect(persisted).not.toContain(linkToken);
    expect(persisted).not.toContain(code);

    expect(await t.accountOf(EMAIL)).toBeNull();
    expect(await t.storedEvents()).toEqual([]);
  });

  it("startEmailLogin#2 そのメールアドレスのアカウントがある / 新しい LoginChallengeId と、そのメールアドレスで実行する", async () => {
    const t = createLoginTestContext();
    const account = await t.register(EMAIL);
    const challengeId = t.newChallengeId();
    await expect(
      startEmailLogin({
        container: t.container,
        input: { challengeId, email: EMAIL },
      }),
    ).resolves.toBeUndefined();
    expect(t.transport.sentTo(EMAIL)).toHaveLength(1);
    expect((await t.challenge(challengeId))?.entity.status).toBe("pending");
    expect(await t.accountOf(EMAIL)).toEqual(account);
  });

  it("startEmailLogin#3 なし / 形式の正しくないメールアドレスで実行する", async () => {
    const t = createLoginTestContext();
    const challengeId = t.newChallengeId();
    await expectBusinessCode(
      startEmailLogin({
        container: t.container,
        input: { challengeId, email: "not-an-address" },
      }),
      "COMMON_INVALID_EMAIL_ADDRESS",
    );
    expect(t.transport.sent).toHaveLength(0);
    expect(await t.challenge(challengeId)).toBeNull();
  });

  it("startEmailLogin#4 同じ LoginChallengeId・同じメールアドレスのログインの確認が保存されている / 同じ LoginChallengeId・同じメールアドレスで送り直す", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    const before = await t.challenge(issued.challengeId);
    t.clock.advance(60_000);
    await expect(
      startEmailLogin({
        container: t.container,
        input: { challengeId: issued.challengeId, email: EMAIL },
      }),
    ).resolves.toBeUndefined();
    expect(t.transport.sent).toHaveLength(1);
    expect(await t.challenge(issued.challengeId)).toEqual(before);
  });

  it("startEmailLogin#5 ある LoginChallengeId のログインの確認が保存されている / 同じ LoginChallengeId と、違うメールアドレスで実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    const before = await t.challenge(issued.challengeId);
    await expect(
      startEmailLogin({
        container: t.container,
        input: { challengeId: issued.challengeId, email: "taro@example.com" },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(t.transport.sent).toHaveLength(1);
    expect(t.transport.sentTo("taro@example.com")).toHaveLength(0);
    expect(await t.challenge(issued.challengeId)).toEqual(before);
  });

  it("startEmailLogin#6 同じ新しい LoginChallengeId・同じメールアドレスの要求 X、Y がある。X が判定の run を終えてメールを送る間に、Y が保存までを終える / X の書き込みの run を実行する", async () => {
    const t = createLoginTestContext();
    const challengeId = t.newChallengeId();
    const run = () =>
      startEmailLogin({
        container: t.container,
        input: { challengeId, email: EMAIL },
      });
    // X's send: Y runs to completion before X's mail is accepted.
    t.transport.beforeAccept = async () => {
      await run();
    };
    await expect(run()).resolves.toBeUndefined();

    const [yMail, xMail] = t.transport.sentTo(EMAIL);
    expect(t.transport.sent).toHaveLength(2);
    const tokenOf = (text: string) =>
      /token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";
    const stored = await t.challenge(challengeId);
    const digest = (token: string) =>
      t.container.loginSecretGenerator.digest(LinkToken.create(token));
    expect(stored?.entity.linkTokenDigest).toBe(
      await digest(tokenOf(yMail?.text ?? "")),
    );
    expect(stored?.entity.linkTokenDigest).not.toBe(
      await digest(tokenOf(xMail?.text ?? "")),
    );
    await expectBusinessCode(
      t.byLink(tokenOf(xMail?.text ?? "")),
      "ACCOUNT_LOGIN_CHALLENGE_INVALID",
    );
  });

  it("startEmailLogin#7 あるメールアドレスに pending のログインの確認がある / 同じメールアドレスと、別の LoginChallengeId で実行する", async () => {
    const t = createLoginTestContext();
    const first = await t.start(EMAIL);
    const firstBefore = await t.challenge(first.challengeId);
    const second = await t.start(EMAIL);
    expect(second.challengeId).not.toBe(first.challengeId);
    expect(t.transport.sentTo(EMAIL)).toHaveLength(2);
    expect((await t.challenge(second.challengeId))?.entity.status).toBe(
      "pending",
    );
    expect(await t.challenge(first.challengeId)).toEqual(firstBefore);
    const account = await t.byCode(first.challengeId, first.code);
    expect(account.email).toBe(EMAIL);
  });

  it("startEmailLogin#8 maxUnexpiredChallenges = 3。あるメールアドレスに、有効期間を過ぎていないログインの確認が3件ある（pending・redeemed・exhausted を1件ずつ） / 同じメールアドレスと、新しい LoginChallengeId で実行する", async () => {
    const t = capped();
    await t.start(EMAIL);
    const redeemed = await t.start(EMAIL);
    await t.byLink(redeemed.linkToken);
    const exhausted = await t.start(EMAIL);
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await t
        .byCode(exhausted.challengeId, wrongCode(exhausted.code))
        .catch(() => {});
    }
    expect((await t.challenge(exhausted.challengeId))?.entity.status).toBe(
      "exhausted",
    );
    const mailsBefore = t.transport.sent.length;
    const challengeId = t.newChallengeId();
    await expectBusinessCode(
      startEmailLogin({
        container: t.container,
        input: { challengeId, email: EMAIL },
      }),
      "ACCOUNT_LOGIN_REQUESTS_EXCEEDED",
    );
    expect(t.transport.sent).toHaveLength(mailsBefore);
    expect(await t.challenge(challengeId)).toBeNull();
  });

  it("startEmailLogin#9 maxUnexpiredChallenges = 3。あるメールアドレスに、有効期間を過ぎていないログインの確認が2件と、有効期間を過ぎたログインの確認が1件ある / 同じメールアドレスと、新しい LoginChallengeId で実行する", async () => {
    const t = capped();
    await t.start(EMAIL);
    t.clock.advance(VALID_FOR_MS);
    await t.start(EMAIL);
    await t.start(EMAIL);
    const issued = await t.start(EMAIL);
    expect(t.transport.sentTo(EMAIL)).toHaveLength(4);
    expect((await t.challenge(issued.challengeId))?.entity.status).toBe(
      "pending",
    );
  });

  it("startEmailLogin#10 maxUnexpiredChallenges = 3。あるメールアドレスに、有効期間を過ぎていないログインの確認が3件あり、そのうち1件は LoginChallengeId X / X・同じメールアドレスで送り直す", async () => {
    const t = capped();
    await t.start(EMAIL);
    const X = await t.start(EMAIL);
    await t.start(EMAIL);
    const before = await t.challenge(X.challengeId);
    await expect(
      startEmailLogin({
        container: t.container,
        input: { challengeId: X.challengeId, email: EMAIL },
      }),
    ).resolves.toBeUndefined();
    expect(t.transport.sentTo(EMAIL)).toHaveLength(3);
    expect(await t.challenge(X.challengeId)).toEqual(before);
  });

  it("startEmailLogin#11 maxUnexpiredChallenges = 3。メールアドレス A に有効期間を過ぎていないログインの確認が3件ある / 別のメールアドレス B と、新しい LoginChallengeId で実行する", async () => {
    const t = capped();
    for (let i = 0; i < 3; i++) await t.start("a@example.com");
    const issued = await t.start("b@example.com");
    expect(t.transport.sentTo("b@example.com")).toHaveLength(1);
    expect((await t.challenge(issued.challengeId))?.entity.status).toBe(
      "pending",
    );
  });

  it("answers the cap the same whether or not the address has an account", async () => {
    const t = capped();
    await t.register(EMAIL);
    for (let i = 0; i < 3; i++) await t.start(EMAIL);
    await expectBusinessCode(t.start(EMAIL), "ACCOUNT_LOGIN_REQUESTS_EXCEEDED");
  });

  it("succeeds without writing when a concurrent resend of the same request commits between its re-read and its commit", async () => {
    const t = createLoginTestContext();
    const challengeId = t.newChallengeId();
    const inner = t.container.unitOfWorkProvider;
    let runs = 0;
    // X's second (writing) run has re-read nothing and buffered its insert;
    // Y runs to completion before X commits.
    const racing: UnitOfWorkProvider = {
      run: (fn) => {
        runs += 1;
        const mine = runs;
        return inner.run(async (ctx) => {
          const result = await fn(ctx);
          if (mine === 2) {
            await startEmailLogin({
              container: t.container,
              input: { challengeId, email: EMAIL },
            });
          }
          return result;
        });
      },
    };
    await expect(
      startEmailLogin({
        container: { ...t.container, unitOfWorkProvider: racing },
        input: { challengeId, email: EMAIL },
      }),
    ).resolves.toBeUndefined();
    const [xMail, yMail] = t.transport.sentTo(EMAIL);
    expect(t.transport.sent).toHaveLength(2);
    const stored = await t.challenge(challengeId);
    const digest = (text: string) =>
      t.container.loginSecretGenerator.digest(
        LinkToken.create(readLoginMail(text, TEST_APP_URL).linkToken ?? ""),
      );
    expect(stored?.entity.linkTokenDigest).toBe(
      await digest(yMail?.text ?? ""),
    );
    expect(stored?.entity.linkTokenDigest).not.toBe(
      await digest(xMail?.text ?? ""),
    );
  });

  it("still answers ConflictError when the concurrent request used another address", async () => {
    const t = createLoginTestContext();
    const challengeId = t.newChallengeId();
    const inner = t.container.unitOfWorkProvider;
    let runs = 0;
    const racing: UnitOfWorkProvider = {
      run: (fn) => {
        runs += 1;
        const mine = runs;
        return inner.run(async (ctx) => {
          const result = await fn(ctx);
          if (mine === 2) {
            await startEmailLogin({
              container: t.container,
              input: { challengeId, email: "taro@example.com" },
            });
          }
          return result;
        });
      },
    };
    await expect(
      startEmailLogin({
        container: { ...t.container, unitOfWorkProvider: racing },
        input: { challengeId, email: EMAIL },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await t.challenge(challengeId))?.entity.email).toBe(
      "taro@example.com",
    );
  });

  it("stores nothing when the mail cannot be sent", async () => {
    const t = createLoginTestContext();
    const challengeId = t.newChallengeId();
    t.transport.fail();
    await expect(
      startEmailLogin({
        container: t.container,
        input: { challengeId, email: EMAIL },
      }),
    ).rejects.toMatchObject({ name: "SystemError" });
    expect(await t.challenge(challengeId)).toBeNull();
    await t.start(EMAIL, challengeId);
    expect((await t.challenge(challengeId))?.entity.status).toBe("pending");
  });
});
