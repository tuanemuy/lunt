import { ConflictError, ForbiddenError } from "@repo/core/application/errors";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import type { RequestContainer } from "../../di/types";
import { resignStewardship } from "../resignStewardship";
import { revokeSteward } from "../revokeSteward";
import {
  authorityKit,
  commitAfter,
  expectCode,
  invitationEmails,
  type Kit,
  type Person,
  rejection,
  stewardIds,
} from "./kit";

const revoke = (
  k: Kit,
  who: Person,
  target: StewardedRef,
  steward: Person,
  container: RequestContainer = k.container,
) =>
  revokeSteward({
    container,
    actor: who.actor,
    input: { target, accountId: steward.accountId },
  });

async function expectBusiness(promise: Promise<unknown>, code: string) {
  const error = await rejection(promise);
  expect(isBusinessRuleError(error)).toBe(true);
  expect((error as { code?: unknown }).code).toBe(code);
}

describe("revokeSteward", () => {
  it("revokeSteward#1 A、B は店舗 P の管理者。O はサービス運営者 / O を Actor として、P の管理者 A の権限を解除する", async () => {
    const k = authorityKit();
    const [A, B, O] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A, B);
    await k.operators(O);
    const mark = await k.mark();
    await revoke(k, O, P, A);
    expect(stewardIds(await k.stewardship(P))).toEqual([B.accountId]);
    expect(await k.since(mark)).toEqual([
      expect.objectContaining({
        type: "authority.steward_removed",
        payload: { target: P, accountId: A.accountId, reason: "revoked" },
      }),
    ]);
  });

  it("revokeSteward#2 A は地域 R の唯一の管理者。R に承諾前の招待がある。O はサービス運営者 / O を Actor として、R の管理者 A の権限を解除する", async () => {
    const k = authorityKit();
    const [A, C, O] = [await k.person(), await k.person(), await k.person()];
    const R = k.region();
    await k.appoint(R, A);
    await k.invite(R, C.email);
    await k.operators(O);
    const mark = await k.mark();
    await revoke(k, O, R, A);
    const after = await k.stewardship(R);
    expect(after.status).toBe("vacant");
    expect(invitationEmails(after)).toEqual([C.email]);
    expect((await k.since(mark)).map((e) => e.type)).toEqual([
      "authority.steward_removed",
      "authority.stewardship_vacated",
    ]);
  });

  it("revokeSteward#3 A、B は店舗 P の管理者。O はサービス運営者 / O を Actor として、A、B の順に権限を解除する", async () => {
    const k = authorityKit();
    const [A, B, O] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A, B);
    await k.operators(O);
    const first = await k.mark();
    await revoke(k, O, P, A);
    expect((await k.since(first)).map((e) => e.type)).toEqual([
      "authority.steward_removed",
    ]);
    const second = await k.mark();
    await revoke(k, O, P, B);
    expect((await k.since(second)).map((e) => e.type)).toEqual([
      "authority.steward_removed",
      "authority.stewardship_vacated",
    ]);
    const after = await k.stewardship(P);
    expect(after.status).toBe("vacant");
    expect(
      await k.decide(O, {
        kind: "manage_target",
        standing: Stewardship.standingOf(after, O.accountId),
      }),
    ).toEqual({ allowed: true, basis: "absence_proxy" });
  });

  it("revokeSteward#4 A、B は店舗 P の管理者。B はサービス運営者ではない / B を Actor として、P の管理者 A の権限を解除する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A, B);
    await expectCode(revoke(k, B, P, A), ForbiddenError);
    expect(stewardIds(await k.stewardship(P))).toEqual([
      A.accountId,
      B.accountId,
    ]);
  });

  it("revokeSteward#5 A は店舗 P の管理者だったが、確定の前に自分で辞任した（または退会した）。O はサービス運営者 / O を Actor として、P の A の権限を解除する", async () => {
    const k = authorityKit();
    const [A, B, O] = [await k.person(), await k.person(), await k.person()];
    const [P1, P2] = [k.place(), k.place()];
    await k.appoint(P1, A, B);
    await k.appoint(P2, A, B);
    await k.operators(O);
    await resignStewardship({
      container: k.container,
      actor: A.actor,
      input: { target: P1 },
    });
    await k.withdraw(A);
    for (const P of [P1, P2]) {
      const before = await k.findStewardship(P);
      const mark = await k.mark();
      await expectBusiness(revoke(k, O, P, A), "AUTHORITY_NOT_A_STEWARD");
      expect(await k.findStewardship(P)).toEqual(before);
      expect(await k.since(mark)).toEqual([]);
    }
  });

  it("revokeSteward#6 A は店舗 P の管理者。O はサービス運営者だったが、確定の前に役割を解除されている / O を Actor として、P の A の権限を解除する", async () => {
    const k = authorityKit();
    const [A, O, O2] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    await k.operators(O, O2);
    await k.revokeHolder("operator", O);
    await expectCode(revoke(k, O, P, A), ForbiddenError);
    expect(stewardIds(await k.stewardship(P))).toEqual([A.accountId]);
  });

  it("revokeSteward#7 A は店舗 P1 と店舗 P2 の管理者で、編集担当者。O はサービス運営者 / O を Actor として、P1 の A の権限を解除する", async () => {
    const k = authorityKit();
    const [A, O] = [await k.person(), await k.person()];
    const [P1, P2] = [k.place(), k.place()];
    await k.appoint(P1, A);
    await k.appoint(P2, A);
    await k.editors(A);
    await k.operators(O);
    const p2Before = await k.findStewardship(P2);
    const editorsBefore = await k.roster("editor");
    await revoke(k, O, P1, A);
    expect(stewardIds(await k.stewardship(P1))).toEqual([]);
    expect(await k.findStewardship(P2)).toEqual(p2Before);
    expect(await k.roster("editor")).toEqual(editorsBefore);
  });

  it("revokeSteward#8 A、B は店舗 P の管理者。O はサービス運営者 / O による A の解除と、A の辞任を同時に実行し、辞任が先に確定する", async () => {
    const k = authorityKit();
    const [A, B, O] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A, B);
    await k.operators(O);
    const racing = commitAfter(k.container, () =>
      resignStewardship({
        container: k.container,
        actor: A.actor,
        input: { target: P },
      }),
    );
    await expectCode(revoke(k, O, P, A, racing), ConflictError);
    await expectBusiness(revoke(k, O, P, A), "AUTHORITY_NOT_A_STEWARD");
  });
});
