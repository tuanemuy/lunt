import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import { RoleRoster } from "@repo/core/domain/authority/roleRoster";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { establishFirstOperator } from "../establishFirstOperator";
import { grantRole } from "../grantRole";
import { authorityKit, expectCode, type Kit, rejection } from "./kit";

const establish = (k: Kit, email: string) =>
  establishFirstOperator({ container: k.container, input: { email } });

async function expectBusiness(promise: Promise<unknown>, code: string) {
  const error = await rejection(promise);
  expect(isBusinessRuleError(error)).toBe(true);
  expect((error as { code?: unknown }).code).toBe(code);
}

describe("establishFirstOperator", () => {
  it("establishFirstOperator#1 サービス運営者の名簿は保存されたことがない（unestablished）。U のアカウントがある / U のメールアドレスで実行する", async () => {
    const k = authorityKit();
    const [U, V] = [await k.person(), await k.person()];
    expect((await k.roster("operator")).entity).toEqual(
      RoleRoster.initial("operator"),
    );
    const mark = await k.mark();
    await establish(k, U.email);
    expect((await k.roster("operator")).entity).toMatchObject({
      status: "established",
      holders: [{ accountId: U.accountId }],
    });
    expect(await k.since(mark)).toEqual([]);
    await grantRole({
      container: k.container,
      actor: U.actor,
      input: { role: "editor", email: V.email },
    });
    expect(await k.holders("editor")).toEqual([V.accountId]);
  });

  it("establishFirstOperator#2 名簿は unestablished。U のアカウントがあり、AccountRepository.findById で U の expectedVersion V を得ている / U のメールアドレスで実行した後、V で AccountRepository.delete(U) を実行する", async () => {
    const k = authorityKit();
    const U = await k.person();
    const v = await k.getAccount(U);
    await establish(k, U.email);
    expect((await k.getAccount(U)).entity.version).toBeGreaterThan(
      v.entity.version,
    );
    await expectCode(
      k.container.unitOfWorkProvider.run(({ accountRepository }) =>
        accountRepository.delete(U.accountId, v.expectedVersion),
      ),
      ConflictError,
    );
  });

  it("establishFirstOperator#3 名簿は established で、持ち主は U だけ / U のメールアドレスで送り直す", async () => {
    const k = authorityKit();
    const U = await k.person();
    await establish(k, U.email);
    const roster = await k.roster("operator");
    const account = await k.getAccount(U);
    await establish(k, ` ${U.email.toUpperCase()}`);
    expect(await k.roster("operator")).toEqual(roster);
    expect(await k.getAccount(U)).toEqual(account);
  });

  it("establishFirstOperator#4 名簿は established で、持ち主は U だけ。V のアカウントがある / V のメールアドレスで実行する", async () => {
    const k = authorityKit();
    const [U, V] = [await k.person(), await k.person()];
    await establish(k, U.email);
    const roster = await k.roster("operator");
    await expectBusiness(
      establish(k, V.email),
      "AUTHORITY_OPERATORS_ALREADY_ESTABLISHED",
    );
    expect(await k.roster("operator")).toEqual(roster);
  });

  it("establishFirstOperator#5 名簿は established で、持ち主は U、V / U のメールアドレスで実行する", async () => {
    const k = authorityKit();
    const [U, V] = [await k.person(), await k.person()];
    await k.operators(U, V);
    const roster = await k.roster("operator");
    await expectBusiness(
      establish(k, U.email),
      "AUTHORITY_OPERATORS_ALREADY_ESTABLISHED",
    );
    expect(await k.roster("operator")).toEqual(roster);
  });

  it("establishFirstOperator#6 名簿は unestablished。あるメールアドレスのアカウントがない / そのメールアドレスで実行する", async () => {
    const k = authorityKit();
    const before = await k.roster("operator");
    await expectCode(establish(k, k.unregisteredEmail()), NotFoundError);
    expect(await k.roster("operator")).toEqual(before);
  });

  it("establishFirstOperator#7 名簿は unestablished / 形式の正しくないメールアドレスで実行する", async () => {
    const k = authorityKit();
    const before = await k.roster("operator");
    await expectBusiness(
      establish(k, "not-an-email"),
      "COMMON_INVALID_EMAIL_ADDRESS",
    );
    expect(await k.roster("operator")).toEqual(before);
  });
});
