import { describe, expect, it } from "vitest";
import { getMyAuthority } from "../getMyAuthority";
import { authorityKit, type Kit, type Person } from "./kit";

const mine = (k: Kit, who: Person) =>
  getMyAuthority({
    container: k.container,
    actor: who.actor,
    input: { pagination: { page: 1, limit: 100 } },
  });

describe("getMyAuthority", () => {
  it("getMyAuthority#1 A は、どの対象の管理者でもなく、役割も持たない / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    expect(await mine(k, A)).toEqual({
      stewarded: { items: [], count: 0 },
      roles: [],
    });
  });

  it("getMyAuthority#2 A は店舗 P1、店舗 P2、地域 R の管理者で、編集担当者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    const R = k.region("谷中");
    const P1 = k.place("一号店");
    const P2 = k.place("二号店");
    await k.appoint(R, A);
    await k.appoint(P2, A);
    await k.appoint(P1, A);
    await k.editors(A);
    expect(await mine(k, A)).toEqual({
      stewarded: {
        items: [
          { target: P1, name: "一号店" },
          { target: P2, name: "二号店" },
          { target: R, name: "谷中" },
        ],
        count: 3,
      },
      roles: ["editor"],
    });
  });

  it("getMyAuthority#3 A は、運営による非公開の店舗 P と、名称が未入力の下書きの地域 R の管理者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    const P = k.place("非公開の店舗");
    const R = k.region(null);
    await k.appoint(P, A);
    await k.appoint(R, A);
    expect((await mine(k, A)).stewarded.items).toEqual([
      { target: P, name: "非公開の店舗" },
      { target: R, name: null },
    ]);
  });

  it("getMyAuthority#4 店舗 P に A のメールアドレス宛ての承諾前の招待がある。A は P の管理者ではない / A を Actor として実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, B);
    await k.invite(P, A.email);
    expect((await mine(k, A)).stewarded).toEqual({ items: [], count: 0 });
  });

  it("getMyAuthority#5 A はサービス運営者で、どの対象の管理者でもない / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    await k.operators(A);
    expect(await mine(k, A)).toEqual({
      stewarded: { items: [], count: 0 },
      roles: ["operator"],
    });
  });

  it("getMyAuthority#6 A は編集担当者だったが、任命を解かれている / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    await k.editors(A);
    await k.revokeHolder("editor", A);
    expect((await mine(k, A)).roles).not.toContain("editor");
    expect(await k.decide(A, { kind: "edit_articles" })).toEqual({
      allowed: false,
    });
  });

  it("getMyAuthority#7 A と B は店舗 P の管理者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const [P, Q] = [k.place("共同の店"), k.place("B の店")];
    await k.appoint(P, A, B);
    await k.appoint(Q, B);
    expect((await mine(k, A)).stewarded).toEqual({
      items: [{ target: P, name: "共同の店" }],
      count: 1,
    });
  });
});
