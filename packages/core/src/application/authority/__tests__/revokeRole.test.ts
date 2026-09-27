import { ConflictError, ForbiddenError } from "@repo/core/application/errors";
import type { Role } from "@repo/core/domain/authority/role";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import type { RequestContainer } from "../../di/types";
import { getMyAuthority } from "../getMyAuthority";
import { listRoleHolders } from "../listRoleHolders";
import { revokeRole } from "../revokeRole";
import {
  authorityKit,
  commitAfter,
  expectCode,
  type Kit,
  type Person,
  rejection,
} from "./kit";

const revoke = (
  k: Kit,
  who: Person,
  role: Role,
  holder: Person,
  container: RequestContainer = k.container,
) =>
  revokeRole({
    container,
    actor: who.actor,
    input: { role, accountId: holder.accountId },
  });

async function expectBusiness(promise: Promise<unknown>, code: string) {
  const error = await rejection(promise);
  expect(isBusinessRuleError(error)).toBe(true);
  expect((error as { code?: unknown }).code).toBe(code);
}

describe("revokeRole", () => {
  it("revokeRole#1 O はサービス運営者。E1、E2 は編集担当者 / O を Actor として、editor と E1 で実行する", async () => {
    const k = authorityKit();
    const [O, E1, E2] = [await k.person(), await k.person(), await k.person()];
    await k.operators(O);
    await k.editors(E1, E2);
    const mark = await k.mark();
    await revoke(k, O, "editor", E1);
    expect(await k.holders("editor")).toEqual([E2.accountId]);
    expect(await k.since(mark)).toEqual([
      expect.objectContaining({
        type: "authority.role_revoked",
        aggregateId: "editor",
        payload: { role: "editor", accountId: E1.accountId, reason: "revoked" },
      }),
    ]);
    const mine = await getMyAuthority({
      container: k.container,
      actor: E1.actor,
      input: { pagination: { page: 1, limit: 100 } },
    });
    expect(mine.roles).not.toContain("editor");
    expect(await k.decide(E1, { kind: "edit_articles" })).toEqual({
      allowed: false,
    });
  });

  it("revokeRole#2 O はサービス運営者。編集担当者は E1 だけ / O を Actor として、editor と E1 で実行する", async () => {
    const k = authorityKit();
    const [O, E1] = [await k.person(), await k.person()];
    await k.operators(O);
    await k.editors(E1);
    await revoke(k, O, "editor", E1);
    expect(await k.holders("editor")).toEqual([]);
  });

  it("revokeRole#3 O1、O2 はサービス運営者 / O1 を Actor として、operator と O2 で実行する", async () => {
    const k = authorityKit();
    const [O1, O2] = [await k.person(), await k.person()];
    await k.operators(O1, O2);
    const mark = await k.mark();
    await revoke(k, O1, "operator", O2);
    expect(await k.holders("operator")).toEqual([O1.accountId]);
    expect((await k.since(mark)).map((e) => e.payload)).toEqual([
      { role: "operator", accountId: O2.accountId, reason: "revoked" },
    ]);
    await expectCode(
      listRoleHolders({ container: k.container, actor: O2.actor }),
      ForbiddenError,
    );
  });

  it("revokeRole#4 O1、O2 はサービス運営者 / O1 を Actor として、operator と O1 自身で実行する", async () => {
    const k = authorityKit();
    const [O1, O2] = [await k.person(), await k.person()];
    await k.operators(O1, O2);
    await revoke(k, O1, "operator", O1);
    expect(await k.holders("operator")).toEqual([O2.accountId]);
    await expectCode(revoke(k, O1, "operator", O2), ForbiddenError);
  });

  it("revokeRole#5 サービス運営者は O だけ / O を Actor として、operator と O 自身で実行する", async () => {
    const k = authorityKit();
    const O = await k.person();
    await k.operators(O);
    const before = await k.roster("operator");
    const mark = await k.mark();
    await expectBusiness(
      revoke(k, O, "operator", O),
      "AUTHORITY_LAST_OPERATOR",
    );
    expect(await k.roster("operator")).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("revokeRole#6 O1、O2 はサービス運営者 / O1 による O2 の解除と、O2 による O1 の解除を同時に実行する", async () => {
    const k = authorityKit();
    const [O1, O2] = [await k.person(), await k.person()];
    await k.operators(O1, O2);
    const racing = commitAfter(k.container, () =>
      revoke(k, O2, "operator", O1),
    );
    await expectCode(revoke(k, O1, "operator", O2, racing), ConflictError);
    expect(await k.holders("operator")).toEqual([O2.accountId]);
    await expectCode(revoke(k, O1, "operator", O2), ForbiddenError);
    expect(await k.holders("operator")).toEqual([O2.accountId]);
  });

  it("revokeRole#7 O はサービス運営者。E1 は、確定の前に任命を解かれている（または退会している） / O を Actor として、editor と E1 で実行する", async () => {
    const k = authorityKit();
    const [O, E1, E2] = [await k.person(), await k.person(), await k.person()];
    await k.operators(O);
    await k.editors(E1, E2);
    await k.revokeHolder("editor", E1);
    await k.withdraw(E2);
    const before = await k.roster("editor");
    for (const E of [E1, E2]) {
      await expectBusiness(
        revoke(k, O, "editor", E),
        "AUTHORITY_ROLE_NOT_HELD",
      );
    }
    expect(await k.roster("editor")).toEqual(before);
  });

  it("revokeRole#8 E1 は編集担当者で、サービス運営者ではない。E2 は編集担当者 / E1 を Actor として、editor と E2 で実行する", async () => {
    const k = authorityKit();
    const [O, E1, E2] = [await k.person(), await k.person(), await k.person()];
    await k.operators(O);
    await k.editors(E1, E2);
    await expectCode(revoke(k, E1, "editor", E2), ForbiddenError);
    expect(await k.holders("editor")).toEqual([E1.accountId, E2.accountId]);
  });

  it("revokeRole#9 O はサービス運営者。E1 は編集担当者で、サービス運営者で、店舗 P の管理者 / O を Actor として、editor と E1 で実行する", async () => {
    const k = authorityKit();
    const [O, E1] = [await k.person(), await k.person()];
    const P = k.place();
    await k.operators(O, E1);
    await k.editors(E1);
    await k.appoint(P, E1);
    const operatorsBefore = await k.roster("operator");
    const stewardshipBefore = await k.findStewardship(P);
    await revoke(k, O, "editor", E1);
    expect(await k.holders("editor")).toEqual([]);
    expect(await k.roster("operator")).toEqual(operatorsBefore);
    expect(await k.findStewardship(P)).toEqual(stewardshipBefore);
  });
});
