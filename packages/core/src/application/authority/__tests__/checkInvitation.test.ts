import type { InvitationId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import { checkInvitation } from "../checkInvitation";
import { authorityKit, type Kit, type Person } from "./kit";

const check = (
  k: Kit,
  who: Person,
  target: StewardedRef,
  invitationId: InvitationId,
) =>
  checkInvitation({
    container: k.container,
    actor: who.actor,
    input: { target, invitationId },
  });

describe("checkInvitation", () => {
  it("checkInvitation#1 店舗 P に、C のメールアドレス宛ての承諾前の招待がある / C を Actor として、P とその InvitationId で確認する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place("喫茶ルント");
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    expect(await check(k, C, P, invitation)).toEqual({
      status: "acceptable",
      target: P,
      name: "喫茶ルント",
    });
  });

  it("checkInvitation#2 下書きの地域 R に、C のメールアドレス宛ての承諾前の招待がある / C を Actor として確認する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const R = k.region("下書きの地域");
    await k.appoint(R, A);
    const invitation = await k.invite(R, C.email);
    expect(await check(k, C, R, invitation)).toEqual({
      status: "acceptable",
      target: R,
      name: "下書きの地域",
    });
  });

  it("checkInvitation#3 名称が未入力の下書きのイベント E に、C のメールアドレス宛ての承諾前の招待がある / C を Actor として確認する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const E = k.occasion(null);
    await k.appoint(E, A);
    const invitation = await k.invite(E, C.email);
    expect(await check(k, C, E, invitation)).toEqual({
      status: "acceptable",
      target: E,
      name: null,
    });
  });

  it("checkInvitation#4 イベント E は管理者不在で、C のメールアドレス宛ての承諾前の招待が残っている / C を Actor として確認する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const E = k.occasion();
    await k.appoint(E, A);
    const invitation = await k.invite(E, C.email);
    await k.removeSteward(E, A);
    expect((await check(k, C, E, invitation)).status).toBe("acceptable");
  });

  it("checkInvitation#5 店舗 P に、C のメールアドレス宛ての承諾前の招待がある。X のメールアドレスは C と異なる / X を Actor として確認する", async () => {
    const k = authorityKit();
    const [A, C, X] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    expect(await check(k, X, P, invitation)).toEqual({
      status: "addressed_to_other",
    });
  });

  it("checkInvitation#6 店舗 P の C 宛ての招待が取り消されている / C を Actor として確認する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    await k.cancel(P, invitation);
    expect(await check(k, C, P, invitation)).toEqual({ status: "not_found" });
  });

  it("checkInvitation#7 店舗 P1 に、C のメールアドレス宛ての承諾前の招待がある。店舗 P2 に招待はない / C を Actor として、P2 と、P1 の招待の InvitationId で確認する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const [P1, P2] = [k.place(), k.place()];
    await k.appoint(P1, A);
    await k.appoint(P2, A);
    const invitation = await k.invite(P1, C.email);
    expect(await check(k, C, P2, invitation)).toEqual({ status: "not_found" });
  });

  it("checkInvitation#8 C は店舗 P の管理者（C 宛ての招待の後、管理権限の申請が先に承認された） / C を Actor として、その招待の InvitationId で確認する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place("喫茶ルント");
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    await k.appoint(P, C);
    expect(await check(k, C, P, invitation)).toEqual({
      status: "already_steward",
      target: P,
      name: "喫茶ルント",
    });
  });

  it("checkInvitation#9 店舗 P に、C のメールアドレス宛ての承諾前の招待がある / C を Actor として確認する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    const before = await k.findStewardship(P);
    const mark = await k.mark();
    await check(k, C, P, invitation);
    expect(await k.findStewardship(P)).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });
});
