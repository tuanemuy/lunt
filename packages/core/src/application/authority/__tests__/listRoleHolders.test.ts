import { ForbiddenError } from "@repo/core/application/errors";
import { describe, expect, it } from "vitest";
import { listRoleHolders } from "../listRoleHolders";
import { authorityKit, expectCode, type Kit, type Person } from "./kit";

const list = (k: Kit, who: Person) =>
  listRoleHolders({ container: k.container, actor: who.actor });

const brief = (holders: readonly { email: string; isSelf: boolean }[]) =>
  holders.map(({ email, isSelf }) => ({ email, isSelf }));

describe("listRoleHolders", () => {
  it("listRoleHolders#1 サービス運営者は O1、O2（付与の古い順）。編集担当者は E1、O1（付与の古い順） / O1 を Actor として実行する", async () => {
    const k = authorityKit();
    const [O1, O2, E1] = [await k.person(), await k.person(), await k.person()];
    await k.operators(O1, O2);
    await k.editors(E1, O1);
    const result = await list(k, O1);
    expect(brief(result.editor)).toEqual([
      { email: E1.email, isSelf: false },
      { email: O1.email, isSelf: true },
    ]);
    expect(brief(result.operator)).toEqual([
      { email: O1.email, isSelf: true },
      { email: O2.email, isSelf: false },
    ]);
    expect(result.operator.map((h) => h.accountId)).toEqual([
      O1.accountId,
      O2.accountId,
    ]);
  });

  it("listRoleHolders#2 サービス運営者は O1 だけ。編集担当者はいない / O1 を Actor として実行する", async () => {
    const k = authorityKit();
    const O1 = await k.person();
    await k.operators(O1);
    const result = await list(k, O1);
    expect(result.editor).toEqual([]);
    expect(brief(result.operator)).toEqual([{ email: O1.email, isSelf: true }]);
  });

  it("listRoleHolders#3 E1 は編集担当者で、サービス運営者ではない / E1 を Actor として実行する", async () => {
    const k = authorityKit();
    const [O1, E1] = [await k.person(), await k.person()];
    await k.operators(O1);
    await k.editors(E1);
    await expectCode(list(k, E1), ForbiddenError);
  });

  it("listRoleHolders#4 O2 はサービス運営者だったが、役割を解除されている / O2 を Actor として実行する", async () => {
    const k = authorityKit();
    const [O1, O2] = [await k.person(), await k.person()];
    await k.operators(O1, O2);
    await k.revokeHolder("operator", O2);
    await expectCode(list(k, O2), ForbiddenError);
  });
});
