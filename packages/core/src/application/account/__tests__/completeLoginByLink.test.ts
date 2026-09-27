import { describe, expect, it } from "vitest";
import { ConflictError } from "../../errors";
import type { UnitOfWorkProvider } from "../../execution/unitOfWork";
import { completeLoginByLink } from "../completeLoginByLink";
import {
  createLoginTestContext,
  expectBusinessCode,
  MAX_CODE_ATTEMPTS,
  VALID_FOR_MS,
  wrongCode,
} from "./loginFixtures";

const EMAIL = "hanako@example.com";
const INVALID = "ACCOUNT_LOGIN_CHALLENGE_INVALID";

describe("completeLoginByLink", () => {
  it("completeLoginByLink#1 有効期間内の pending のログインの確認がある。そのメールアドレスのアカウントがない / そのリンクの鍵で実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    const result = await t.byLink(issued.linkToken);
    const account = await t.accountOf(EMAIL);
    expect(account).not.toBeNull();
    expect(result).toEqual({ accountId: account?.id, email: EMAIL });
    expect((await t.challenge(issued.challengeId))?.entity.status).toBe(
      "redeemed",
    );
    expect(await t.storedEvents()).toEqual([]);
  });

  it("completeLoginByLink#2 有効期間内の pending のログインの確認がある。そのメールアドレスのアカウントがある / そのリンクの鍵で実行する", async () => {
    const t = createLoginTestContext();
    const existing = await t.register(EMAIL);
    const issued = await t.start(EMAIL);
    const result = await t.byLink(issued.linkToken);
    expect(result).toEqual({ accountId: existing.id, email: EMAIL });
    expect(await t.accountOf(EMAIL)).toEqual(existing);
  });

  it("completeLoginByLink#3 リンクで使用済み（redeemed）のログインの確認がある / 同じリンクの鍵でもう一度実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    await t.byLink(issued.linkToken);
    const before = await t.challenge(issued.challengeId);
    await expectBusinessCode(t.byLink(issued.linkToken), INVALID);
    expect(await t.challenge(issued.challengeId)).toEqual(before);
  });

  it("completeLoginByLink#4 コードで使用済み（redeemed）のログインの確認がある / そのログインの確認のリンクの鍵で実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    await t.byCode(issued.challengeId, issued.code);
    await expectBusinessCode(t.byLink(issued.linkToken), INVALID);
  });

  it("completeLoginByLink#5 pending のログインの確認があり、有効期間を過ぎている。そのメールアドレスのアカウントがない / そのリンクの鍵で実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    t.clock.advance(VALID_FOR_MS);
    await expectBusinessCode(t.byLink(issued.linkToken), INVALID);
    expect(await t.accountOf(EMAIL)).toBeNull();
    expect((await t.challenge(issued.challengeId))?.entity.status).toBe(
      "pending",
    );
  });

  it("completeLoginByLink#6 誤入力の上限に達した（exhausted）ログインの確認がある / そのリンクの鍵で実行する", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await t
        .byCode(issued.challengeId, wrongCode(issued.code))
        .catch(() => {});
    }
    expect((await t.challenge(issued.challengeId))?.entity.status).toBe(
      "exhausted",
    );
    await expectBusinessCode(t.byLink(issued.linkToken), INVALID);
  });

  it("completeLoginByLink#7 なし / どのログインの確認にも対応しないリンクの鍵で実行する", async () => {
    const t = createLoginTestContext();
    await t.start(EMAIL);
    await expectBusinessCode(t.byLink("no-such-link-token"), INVALID);
    expect(await t.accountOf(EMAIL)).toBeNull();
  });

  it("completeLoginByLink#8 あるメールアドレスのアカウントが退会している。そのメールアドレスの有効期間内の pending のログインの確認がある / そのリンクの鍵で実行する", async () => {
    const t = createLoginTestContext();
    const first = await t.start(EMAIL);
    const before = await t.byLink(first.linkToken);
    await t.container.unitOfWorkProvider.run(async ({ accountRepository }) => {
      const found = await accountRepository.findById(before.accountId);
      if (found === null) throw new Error("missing");
      await accountRepository.delete(found.entity.id, found.expectedVersion);
    });
    const again = await t.start(EMAIL);
    const after = await t.byLink(again.linkToken);
    expect(after.email).toBe(EMAIL);
    expect(after.accountId).not.toBe(before.accountId);
  });

  it("rolls the redemption back when the address is registered concurrently", async () => {
    const t = createLoginTestContext();
    const issued = await t.start(EMAIL);
    const inner = t.container.unitOfWorkProvider;
    let registerFirst = true;
    // Another login registers the address after this one read it.
    const racing: UnitOfWorkProvider = {
      run: (fn) =>
        inner.run(async (ctx) => {
          const result = await fn(ctx);
          if (registerFirst) {
            registerFirst = false;
            await t.register(EMAIL);
          }
          return result;
        }),
    };
    await expect(
      completeLoginByLink({
        container: { ...t.container, unitOfWorkProvider: racing },
        input: { linkToken: issued.linkToken },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await t.challenge(issued.challengeId))?.entity.status).toBe(
      "pending",
    );
    const retried = await t.byLink(issued.linkToken);
    expect(retried.accountId).toBe((await t.accountOf(EMAIL))?.id);
  });
});
