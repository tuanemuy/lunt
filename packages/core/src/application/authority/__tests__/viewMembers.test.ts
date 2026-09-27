import { ForbiddenError } from "@repo/core/application/errors";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import { viewMembers } from "../viewMembers";
import { authorityKit, expectCode, type Kit, type Person } from "./kit";

const view = (k: Kit, who: Person, target: StewardedRef) =>
  viewMembers({ container: k.container, actor: who.actor, input: { target } });

describe("viewMembers", () => {
  it("viewMembers#1 店舗 P の管理者は A、B（就任の古い順）。承諾前の招待が、C のメールアドレス宛て、D のメールアドレス宛て（招待の古い順）にある / A を Actor として P を確認する", async () => {
    const k = authorityKit();
    const [A, B, C, D] = [
      await k.person(),
      await k.person(),
      await k.person(),
      await k.person(),
    ];
    const P = k.place();
    await k.appoint(P, A, B);
    const invC = await k.invite(P, C.email);
    const invD = await k.invite(P, D.email);
    const result = await view(k, A, P);
    expect(result.vacant).toBe(false);
    expect(
      result.stewards.map(({ accountId, email, isSelf }) => ({
        accountId,
        email,
        isSelf,
      })),
    ).toEqual([
      { accountId: A.accountId, email: A.email, isSelf: true },
      { accountId: B.accountId, email: B.email, isSelf: false },
    ]);
    expect(
      result.invitations.map(({ invitationId, email }) => ({
        invitationId,
        email,
      })),
    ).toEqual([
      { invitationId: invC, email: C.email },
      { invitationId: invD, email: D.email },
    ]);
  });

  it("viewMembers#2 地域 R の管理者は A だけ。承諾前の招待はない / A を Actor として R を確認する", async () => {
    const k = authorityKit();
    const A = await k.person();
    const R = k.region();
    await k.appoint(R, A);
    const result = await view(k, A, R);
    expect(result.stewards.map((s) => s.accountId)).toEqual([A.accountId]);
    expect(result.invitations).toEqual([]);
  });

  it("viewMembers#3 店舗 P の管理者は A。O はサービス運営者で、P の管理者ではない / O を Actor として P を確認する", async () => {
    const k = authorityKit();
    const [A, C, O] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    await k.invite(P, C.email);
    await k.operators(O);
    const result = await view(k, O, P);
    expect(result.vacant).toBe(false);
    expect(result.stewards.map((s) => [s.email, s.isSelf])).toEqual([
      [A.email, false],
    ]);
    expect(result.invitations.map((i) => i.email)).toEqual([C.email]);
  });

  it("viewMembers#4 イベント E は管理者不在で、承諾前の招待が1件残っている。O はサービス運営者 / O を Actor として E を確認する", async () => {
    const k = authorityKit();
    const [A, C, O] = [await k.person(), await k.person(), await k.person()];
    const E = k.occasion();
    await k.appoint(E, A);
    await k.invite(E, C.email);
    await k.removeSteward(E, A);
    await k.operators(O);
    const result = await view(k, O, E);
    expect(result.vacant).toBe(true);
    expect(result.stewards).toEqual([]);
    expect(result.invitations.map((i) => i.email)).toEqual([C.email]);
  });

  it("viewMembers#5 管理体制が保存されたことのない地域 R がある。O はサービス運営者 / O を Actor として R を確認する", async () => {
    const k = authorityKit();
    const O = await k.person();
    await k.operators(O);
    expect(await view(k, O, k.region())).toEqual({
      vacant: true,
      stewards: [],
      invitations: [],
    });
  });

  it("viewMembers#6 店舗 P の管理者は A。X は P の管理者でもサービス運営者でもない / X を Actor として P を確認する", async () => {
    const k = authorityKit();
    const [A, X] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    await expectCode(view(k, X, P), ForbiddenError);
  });

  it("viewMembers#7 X は地域 R の管理者で、店舗 P の管理者ではない / X を Actor として P を確認する", async () => {
    const k = authorityKit();
    const [A, X] = [await k.person(), await k.person()];
    const [P, R] = [k.place(), k.region()];
    await k.appoint(P, A);
    await k.appoint(R, X);
    await expectCode(view(k, X, P), ForbiddenError);
  });

  it("viewMembers#8 X は編集担当者で、店舗 P の管理者ではない / X を Actor として P を確認する", async () => {
    const k = authorityKit();
    const [A, X] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    await k.editors(X);
    await expectCode(view(k, X, P), ForbiddenError);
  });

  it("viewMembers#9 A は店舗 P の管理者だったが、辞任した（または解除された） / A を Actor として P を確認する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A, B);
    await k.removeSteward(P, A);
    await expectCode(view(k, A, P), ForbiddenError);
  });
});
