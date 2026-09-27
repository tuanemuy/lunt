import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "../../errors";
import { getMyAccount } from "../getMyAccount";
import { createLoginTestContext } from "./loginFixtures";

describe("getMyAccount", () => {
  it("getMyAccount#1 アカウント A がある / A を Actor として実行する", async () => {
    const t = createLoginTestContext();
    const A = await t.register("a@example.com");
    expect(
      await getMyAccount({
        container: t.container,
        actor: { accountId: A.id },
      }),
    ).toEqual({ email: "a@example.com" });
  });

  it("getMyAccount#2 アカウント A と B がある / A を Actor として実行する", async () => {
    const t = createLoginTestContext();
    const A = await t.register("a@example.com");
    await t.register("b@example.com");
    const mine = await getMyAccount({
      container: t.container,
      actor: { accountId: A.id },
    });
    expect(mine).toEqual({ email: "a@example.com" });
    expect(JSON.stringify(mine)).not.toContain("b@example.com");
  });

  it("answers UnauthorizedError once the actor's account is withdrawn", async () => {
    const t = createLoginTestContext();
    const A = await t.register("a@example.com");
    await t.container.unitOfWorkProvider.run(async ({ accountRepository }) => {
      const found = await accountRepository.findById(A.id);
      if (found === null) throw new Error("missing");
      await accountRepository.delete(A.id, found.expectedVersion);
    });
    await expect(
      getMyAccount({ container: t.container, actor: { accountId: A.id } }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
