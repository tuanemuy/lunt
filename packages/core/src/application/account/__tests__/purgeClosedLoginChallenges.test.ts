import { describe, expect, it } from "vitest";
import { dailyJobs } from "../../workers/dailyJobRegistry";
import { runDailyJobs } from "../../workers/dailyJobs";
import {
  purgeClosedLoginChallenges,
  purgeClosedLoginChallengesJob,
} from "../purgeClosedLoginChallenges";
import {
  createLoginTestContext,
  expectBusinessCode,
  type IssuedLogin,
  type LoginTestContext,
  MAX_CODE_ATTEMPTS,
  VALID_FOR_MS,
  wrongCode,
} from "./loginFixtures";

const MINUTE = 60 * 1000;

const purge = (t: LoginTestContext) =>
  purgeClosedLoginChallenges({ container: t.container, now: t.clock.now() });

/** One challenge in each state, at a moment only `usable` is usable. */
async function oneOfEach(t: LoginTestContext) {
  const expired = await t.start("expired@example.com");
  t.clock.advance(10 * MINUTE);
  const redeemed = await t.start("redeemed@example.com");
  const exhausted = await t.start("exhausted@example.com");
  const usable = await t.start("usable@example.com");
  await t.byLink(redeemed.linkToken);
  for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
    await t
      .byCode(exhausted.challengeId, wrongCode(exhausted.code))
      .catch(() => {});
  }
  t.clock.advance(VALID_FOR_MS - 10 * MINUTE + 1);
  return { expired, redeemed, exhausted, usable };
}

async function remaining(
  t: LoginTestContext,
  issued: readonly IssuedLogin[],
): Promise<readonly string[]> {
  const found = await Promise.all(
    issued.map(async (i) => ((await t.challenge(i.challengeId)) ? i : null)),
  );
  return found.filter((i) => i !== null).map((i) => i.email);
}

describe("purgeClosedLoginChallenges", () => {
  it("purgeClosedLoginChallenges#1 redeemed のログインの確認、exhausted のログインの確認、有効期間を過ぎた pending のログインの確認、有効期間内の pending のログインの確認が1件ずつある / 実行する", async () => {
    const t = createLoginTestContext();
    const all = await oneOfEach(t);
    expect((await t.challenge(all.exhausted.challengeId))?.entity.status).toBe(
      "exhausted",
    );
    await purge(t);
    expect(await remaining(t, Object.values(all))).toEqual([
      "usable@example.com",
    ]);
    expect(await t.storedEvents()).toEqual([]);
  });

  it("purgeClosedLoginChallenges#2 上のケースの後 / もう一度実行する", async () => {
    const t = createLoginTestContext();
    const all = await oneOfEach(t);
    await purge(t);
    const before = await t.challenge(all.usable.challengeId);
    await expect(purge(t)).resolves.toBeUndefined();
    expect(await remaining(t, Object.values(all))).toEqual([
      "usable@example.com",
    ]);
    expect(await t.challenge(all.usable.challengeId)).toEqual(before);
  });

  it("purgeClosedLoginChallenges#3 ログインの確認が1件もない / 実行する", async () => {
    const t = createLoginTestContext();
    await expect(purge(t)).resolves.toBeUndefined();
  });

  it("purgeClosedLoginChallenges#4 有効期間内の pending のログインの確認がある / 実行した後、そのコードで completeLoginByCode を実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start("usable@example.com");
    t.clock.advance(VALID_FOR_MS - 1);
    await purge(t);
    const result = await t.byCode(issued.challengeId, issued.code);
    expect(result.email).toBe("usable@example.com");
  });

  it("purgeClosedLoginChallenges#5 有効期間を過ぎた pending のログインの確認がある / 実行した後、そのリンクの鍵で completeLoginByLink を実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start("expired@example.com");
    t.clock.advance(VALID_FOR_MS + 1);
    await expectBusinessCode(
      t.byLink(issued.linkToken),
      "ACCOUNT_LOGIN_CHALLENGE_INVALID",
    );
    await purge(t);
    expect(await t.challenge(issued.challengeId)).toBeNull();
    await expectBusinessCode(
      t.byLink(issued.linkToken),
      "ACCOUNT_LOGIN_CHALLENGE_INVALID",
    );
  });

  it("runs as a registered daily job", async () => {
    const t = createLoginTestContext();
    const all = await oneOfEach(t);
    expect(dailyJobs).toContain(purgeClosedLoginChallengesJob);
    const [result] = await runDailyJobs(t.container, [
      purgeClosedLoginChallengesJob,
    ]);
    expect(result?.outcome.kind).toBe("completed");
    expect(await remaining(t, Object.values(all))).toEqual([
      "usable@example.com",
    ]);
  });
});
