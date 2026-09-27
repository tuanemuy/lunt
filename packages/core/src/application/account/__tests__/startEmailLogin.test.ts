import { readLoginMail } from "@repo/core/adapters/login/mailLoginMailSender";
import { LinkToken, LoginCode } from "@repo/core/domain/account/loginSecret";
import { describe, expect, it } from "vitest";
import { ConflictError } from "../../errors";
import { startEmailLogin } from "../startEmailLogin";
import {
  createLoginTestContext,
  expectBusinessCode,
  VALID_FOR_MS,
} from "./loginFixtures";
import { TEST_APP_URL } from "./testServices";

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
