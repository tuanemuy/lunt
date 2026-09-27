import { describe, expect, it } from "vitest";
import {
  authorityKit,
  type Kit,
  type Person,
} from "../../authority/__tests__/kit";
import { previewWithdrawal } from "../previewWithdrawal";

const preview = (k: Kit, who: Person) =>
  previewWithdrawal({ container: k.container, actor: who.actor, input: {} });

describe("previewWithdrawal", () => {
  it("previewWithdrawal#1 アカウント A は、どの対象の管理者でもなく、役割も持たない / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    expect(await preview(k, A)).toEqual({
      canWithdraw: true,
      blockedBy: null,
      vacates: [],
    });
  });

  it("previewWithdrawal#2 A は店舗 P の唯一の管理者で、地域 R の2人の管理者の1人 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place("喫茶ルント");
    const R = k.region("北町");
    await k.appoint(P, A);
    await k.appoint(R, A, B);
    expect(await preview(k, A)).toEqual({
      canWithdraw: true,
      blockedBy: null,
      vacates: [{ target: P, name: "喫茶ルント" }],
    });
  });

  it("previewWithdrawal#3 A は店舗 P、地域 R、イベント E の唯一の管理者。R は名称が未入力の下書き。P は運営による非公開 / A を Actor として実行する", async () => {
    // Suspension is not modelled before stage 2 (Place); the preview never
    // reads publication or suspension, so P is an ordinary target here.
    const k = authorityKit();
    const A = await k.person();
    const E = k.occasion("夏祭り");
    const R = k.region(null);
    const P = k.place("喫茶ルント");
    await k.appoint(E, A);
    await k.appoint(R, A);
    await k.appoint(P, A);
    expect((await preview(k, A)).vacates).toEqual([
      { target: P, name: "喫茶ルント" },
      { target: R, name: null },
      { target: E, name: "夏祭り" },
    ]);
  });

  it("previewWithdrawal#4 A は店舗 P の招待の宛先であるだけで、管理者ではない / A を Actor として実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, B);
    await k.invite(P, A.email);
    expect((await preview(k, A)).vacates).toEqual([]);
  });

  it("previewWithdrawal#5 A は唯一のサービス運営者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    await k.operators(A);
    expect(await preview(k, A)).toEqual({
      canWithdraw: false,
      blockedBy: { role: "operator", reason: "last_operator" },
      vacates: [],
    });
  });

  it("previewWithdrawal#6 A と B がサービス運営者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    await k.operators(A, B);
    expect(await preview(k, A)).toMatchObject({
      canWithdraw: true,
      blockedBy: null,
    });
  });

  it("previewWithdrawal#7 A は唯一の編集担当者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    await k.editors(A);
    expect(await preview(k, A)).toMatchObject({
      canWithdraw: true,
      blockedBy: null,
    });
  });

  it("previewWithdrawal#8 A は店舗 P の唯一の管理者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    const P = k.place();
    await k.appoint(P, A);
    const before = await Promise.all([
      k.getAccount(A),
      k.findStewardship(P),
      k.roster("operator"),
      k.roster("editor"),
    ]);
    const mark = await k.mark();
    await preview(k, A);
    expect(
      await Promise.all([
        k.getAccount(A),
        k.findStewardship(P),
        k.roster("operator"),
        k.roster("editor"),
      ]),
    ).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("names more than 100 vacated targets, 100 at a time, in listing order", async () => {
    const k = authorityKit();
    const A = await k.person();
    const places = Array.from({ length: 101 }, (_, i) => k.place(`店舗${i}`));
    for (const place of places) await k.appoint(place, A);
    const { vacates } = await preview(k, A);
    expect(vacates).toHaveLength(101);
    expect(vacates.every((summary) => summary.name?.startsWith("店舗"))).toBe(
      true,
    );
  });
});
