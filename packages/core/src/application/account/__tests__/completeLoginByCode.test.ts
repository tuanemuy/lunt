import { describe, expect, it } from "vitest";
import {
  createLoginTestContext,
  expectBusinessCode,
  type LoginTestContext,
  MAX_CODE_ATTEMPTS,
  VALID_FOR_MS,
  wrongCode,
} from "./loginFixtures";

const EMAIL = "hanako@example.com";
const INVALID = "ACCOUNT_LOGIN_CHALLENGE_INVALID";
const MISMATCH = "ACCOUNT_LOGIN_CODE_MISMATCH";

async function failTimes(
  t: LoginTestContext,
  challengeId: string,
  code: string,
  times: number,
): Promise<void> {
  for (let i = 0; i < times; i++) {
    await expectBusinessCode(t.byCode(challengeId, wrongCode(code)), MISMATCH);
  }
}

describe("completeLoginByCode", () => {
  it("uses maxCodeAttempts = 3", () => {
    expect(MAX_CODE_ATTEMPTS).toBe(3);
  });

  it("completeLoginByCode#1 有効期間内の pending のログインの確認がある。そのメールアドレスのアカウントがない / その LoginChallengeId と正しいコードで実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    const result = await t.byCode(issued.challengeId, issued.code);
    const account = await t.accountOf(EMAIL);
    expect(result).toEqual({ accountId: account?.id, email: EMAIL });
    expect((await t.challenge(issued.challengeId))?.entity.status).toBe(
      "redeemed",
    );
    expect(await t.storedEvents()).toEqual([]);
  });

  it("completeLoginByCode#2 有効期間内の pending のログインの確認がある。そのメールアドレスのアカウントがある / その LoginChallengeId と正しいコードで実行する", async () => {
    const t = createLoginTestContext();
    const existing = await t.register(EMAIL);
    const issued = await t.start(EMAIL);
    expect(await t.byCode(issued.challengeId, issued.code)).toEqual({
      accountId: existing.id,
      email: EMAIL,
    });
    expect(await t.accountOf(EMAIL)).toEqual(existing);
  });

  it("completeLoginByCode#3 有効期間内の pending、failedCodeAttempts = 0 のログインの確認がある。そのメールアドレスのアカウントがない / 正しくないコードで実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    await expectBusinessCode(
      t.byCode(issued.challengeId, wrongCode(issued.code)),
      MISMATCH,
    );
    expect((await t.challenge(issued.challengeId))?.entity).toMatchObject({
      status: "pending",
      failedCodeAttempts: 1,
    });
    expect(await t.accountOf(EMAIL)).toBeNull();
  });

  it("completeLoginByCode#4 上のケースの後（failedCodeAttempts = 1） / 正しいコードで実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    await failTimes(t, issued.challengeId, issued.code, 1);
    const result = await t.byCode(issued.challengeId, issued.code);
    expect(result.email).toBe(EMAIL);
    expect((await t.challenge(issued.challengeId))?.entity.status).toBe(
      "redeemed",
    );
  });

  it("completeLoginByCode#5 有効期間内の pending、failedCodeAttempts = 2 のログインの確認がある / 正しくないコードで実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    await failTimes(t, issued.challengeId, issued.code, 2);
    expect((await t.challenge(issued.challengeId))?.entity).toMatchObject({
      failedCodeAttempts: 2,
    });
    await expectBusinessCode(
      t.byCode(issued.challengeId, wrongCode(issued.code)),
      INVALID,
    );
    expect((await t.challenge(issued.challengeId))?.entity.status).toBe(
      "exhausted",
    );
  });

  it("completeLoginByCode#6 誤入力の上限に達した（exhausted）ログインの確認がある / 正しいコードで実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    await failTimes(t, issued.challengeId, issued.code, 2);
    await expectBusinessCode(
      t.byCode(issued.challengeId, wrongCode(issued.code)),
      INVALID,
    );
    await expectBusinessCode(
      t.byCode(issued.challengeId, issued.code),
      INVALID,
    );
    expect(await t.accountOf(EMAIL)).toBeNull();
  });

  it("completeLoginByCode#7 リンクで使用済み（redeemed）のログインの確認がある / その LoginChallengeId と正しいコードで実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    await t.byLink(issued.linkToken);
    await expectBusinessCode(
      t.byCode(issued.challengeId, issued.code),
      INVALID,
    );
  });

  it("completeLoginByCode#8 pending のログインの確認があり、有効期間を過ぎている / その LoginChallengeId と正しいコードで実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    t.clock.advance(VALID_FOR_MS);
    const before = await t.challenge(issued.challengeId);
    await expectBusinessCode(
      t.byCode(issued.challengeId, issued.code),
      INVALID,
    );
    const after = await t.challenge(issued.challengeId);
    expect(after).toEqual(before);
    expect(after?.entity).toMatchObject({
      status: "pending",
      failedCodeAttempts: 0,
    });
  });

  it("completeLoginByCode#9 なし / 保存されていない LoginChallengeId で実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    await expectBusinessCode(
      t.byCode(t.newChallengeId(), issued.code),
      INVALID,
    );
    await expectBusinessCode(t.byCode("not-an-id", issued.code), INVALID);
  });

  it("completeLoginByCode#10 あるメールアドレスに、有効期間内の pending のログインの確認が2つある / 一方を正しいコードで使用した後、他方を正しいコードで使用する", async () => {
    const t = createLoginTestContext();
    const first = await t.start(EMAIL);
    const second = await t.start(EMAIL);
    const a = await t.byCode(first.challengeId, first.code);
    const b = await t.byCode(second.challengeId, second.code);
    expect(b).toEqual(a);
  });

  it("refuses a blank code as ACCOUNT_INVALID_LOGIN_SECRET without counting it", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    await expectBusinessCode(
      t.byCode(issued.challengeId, "   "),
      "ACCOUNT_INVALID_LOGIN_SECRET",
    );
    expect((await t.challenge(issued.challengeId))?.entity).toMatchObject({
      failedCodeAttempts: 0,
    });
  });
});
