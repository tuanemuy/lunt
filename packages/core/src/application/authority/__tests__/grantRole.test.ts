import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@repo/core/application/errors";
import type { Role } from "@repo/core/domain/authority/role";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { withdraw } from "../../account/withdraw";
import { getMyAuthority } from "../getMyAuthority";
import { grantRole } from "../grantRole";
import { listRoleHolders } from "../listRoleHolders";
import {
  authorityKit,
  expectCode,
  type Kit,
  type Person,
  rejection,
} from "./kit";

const grant = (k: Kit, who: Person, role: Role, email: string) =>
  grantRole({
    container: k.container,
    actor: who.actor,
    input: { role, email },
  });

async function expectBusiness(promise: Promise<unknown>, code: string) {
  const error = await rejection(promise);
  expect(isBusinessRuleError(error)).toBe(true);
  expect((error as { code?: unknown }).code).toBe(code);
}

describe("grantRole", () => {
  it("grantRole#1 O はサービス運営者。U のアカウントがある。編集担当者はいない / O を Actor として、editor と U のメールアドレスで実行する", async () => {
    const k = authorityKit();
    const [O, U] = [await k.person(), await k.person()];
    await k.operators(O);
    const mark = await k.mark();
    await grant(k, O, "editor", U.email);
    const editors = await k.roster("editor");
    expect(editors.entity).toMatchObject({
      holders: [{ accountId: U.accountId, since: k.clock.now() }],
    });
    expect(await k.since(mark)).toEqual([
      expect.objectContaining({
        type: "authority.role_granted",
        aggregateId: "editor",
        payload: { role: "editor", accountId: U.accountId },
      }),
    ]);
    const mine = await getMyAuthority({
      container: k.container,
      actor: U.actor,
      input: { pagination: { page: 1, limit: 100 } },
    });
    expect(mine.roles).toEqual(["editor"]);
    expect(await k.decide(U, { kind: "edit_articles" })).toEqual({
      allowed: true,
      basis: "role",
    });
  });

  it("grantRole#2 O はサービス運営者。U のアカウントがある / O を Actor として、operator と U のメールアドレスで実行する", async () => {
    const k = authorityKit();
    const [O, U] = [await k.person(), await k.person()];
    await k.operators(O);
    const mark = await k.mark();
    await grant(k, O, "operator", U.email);
    expect(await k.holders("operator")).toEqual([O.accountId, U.accountId]);
    expect((await k.since(mark)).map((e) => e.payload)).toEqual([
      { role: "operator", accountId: U.accountId },
    ]);
    const holders = await listRoleHolders({
      container: k.container,
      actor: U.actor,
    });
    expect(holders.operator.map((h) => h.accountId)).toEqual([
      O.accountId,
      U.accountId,
    ]);
  });

  it("grantRole#3 O はサービス運営者。U のアカウントがあり、AccountRepository.findById で U の expectedVersion V を得ている / O を Actor として、editor と U のメールアドレスで実行した後、V で AccountRepository.delete(U) を実行する", async () => {
    const k = authorityKit();
    const [O, U] = [await k.person(), await k.person()];
    await k.operators(O);
    const v = await k.getAccount(U);
    await grant(k, O, "editor", U.email);
    expect((await k.getAccount(U)).entity.version).toBeGreaterThan(
      v.entity.version,
    );
    await expectCode(
      k.container.unitOfWorkProvider.run(({ accountRepository }) =>
        accountRepository.delete(U.accountId, v.expectedVersion),
      ),
      ConflictError,
    );
    await withdraw({ container: k.container, actor: U.actor, input: {} });
    expect(await k.holders("editor")).toEqual([]);
  });

  it("grantRole#4 O はサービス運営者で、編集担当者ではない / O を Actor として、editor と O 自身のメールアドレスで実行する", async () => {
    const k = authorityKit();
    const O = await k.person();
    await k.operators(O);
    const operatorsBefore = await k.roster("operator");
    await grant(k, O, "editor", O.email);
    expect(await k.holders("editor")).toEqual([O.accountId]);
    expect(await k.roster("operator")).toEqual(operatorsBefore);
  });

  it("grantRole#5 O はサービス運営者。U は店舗 P の管理者で、編集担当者 / O を Actor として、operator と U のメールアドレスで実行する", async () => {
    const k = authorityKit();
    const [O, U] = [await k.person(), await k.person()];
    const P = k.place();
    await k.operators(O);
    await k.appoint(P, U);
    await k.editors(U);
    const stewardshipBefore = await k.findStewardship(P);
    const editorsBefore = await k.roster("editor");
    await grant(k, O, "operator", U.email);
    expect(await k.holders("operator")).toEqual([O.accountId, U.accountId]);
    expect(await k.findStewardship(P)).toEqual(stewardshipBefore);
    expect(await k.roster("editor")).toEqual(editorsBefore);
  });

  it("grantRole#6 O はサービス運営者。あるメールアドレスのアカウントがない / O を Actor として、editor とそのメールアドレスで実行する", async () => {
    const k = authorityKit();
    const O = await k.person();
    await k.operators(O);
    const before = await k.roster("editor");
    const mark = await k.mark();
    await expectCode(
      grant(k, O, "editor", k.unregisteredEmail()),
      NotFoundError,
    );
    expect(await k.roster("editor")).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("grantRole#7 O はサービス運営者。U は編集担当者 / O を Actor として、editor と U のメールアドレスで実行する", async () => {
    const k = authorityKit();
    const [O, U] = [await k.person(), await k.person()];
    await k.operators(O);
    await k.editors(U);
    const before = await k.roster("editor");
    const mark = await k.mark();
    await expectBusiness(
      grant(k, O, "editor", U.email),
      "AUTHORITY_ROLE_ALREADY_HELD",
    );
    expect(await k.roster("editor")).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("grantRole#8 O はサービス運営者 / O を Actor として、形式の正しくないメールアドレスで実行する", async () => {
    const k = authorityKit();
    const O = await k.person();
    await k.operators(O);
    await expectBusiness(
      grant(k, O, "editor", "not-an-email"),
      "COMMON_INVALID_EMAIL_ADDRESS",
    );
  });

  it("grantRole#9 X はサービス運営者ではない（編集担当者、または店舗の管理者）。U のアカウントがある / X を Actor として、editor と U のメールアドレスで実行する", async () => {
    const k = authorityKit();
    const [O, editor, steward, U] = [
      await k.person(),
      await k.person(),
      await k.person(),
      await k.person(),
    ];
    await k.operators(O);
    await k.editors(editor);
    await k.appoint(k.place(), steward);
    const before = await k.roster("editor");
    for (const X of [editor, steward]) {
      await expectCode(grant(k, X, "editor", U.email), ForbiddenError);
    }
    expect(await k.roster("editor")).toEqual(before);
  });

  it("grantRole#10 O はサービス運営者だったが、確定の前に役割を解除されている / O を Actor として、editor と U のメールアドレスで実行する", async () => {
    const k = authorityKit();
    const [O, O2, U] = [await k.person(), await k.person(), await k.person()];
    await k.operators(O, O2);
    await k.revokeHolder("operator", O);
    const before = await k.roster("editor");
    await expectCode(grant(k, O, "editor", U.email), ForbiddenError);
    expect(await k.roster("editor")).toEqual(before);
  });
});
