import { ConflictError, ForbiddenError } from "@repo/core/application/errors";
import type { InvitationId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import type { RequestContainer } from "../../di/types";
import { acceptInvitation } from "../acceptInvitation";
import { cancelInvitation } from "../cancelInvitation";
import { checkInvitation } from "../checkInvitation";
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

const cancel = (
  k: Kit,
  who: Person,
  target: StewardedRef,
  invitationId: InvitationId,
  container: RequestContainer = k.container,
) =>
  cancelInvitation({
    container,
    actor: who.actor,
    input: { target, invitationId },
  });

const accept = (
  k: Kit,
  who: Person,
  target: StewardedRef,
  invitationId: InvitationId,
  container: RequestContainer = k.container,
) =>
  acceptInvitation({
    container,
    actor: who.actor,
    input: { target, invitationId },
  });

async function expectBusiness(promise: Promise<unknown>, code: string) {
  const error = await rejection(promise);
  expect(isBusinessRuleError(error)).toBe(true);
  expect((error as { code?: unknown }).code).toBe(code);
}

/** A and B steward P; A invited C. */
async function invitedPlace(k: Kit) {
  const [A, B, C] = [await k.person(), await k.person(), await k.person()];
  const P = k.place();
  await k.appoint(P, A, B);
  const invitation = await k.invite(P, C.email);
  return { A, B, C, P, invitation };
}

describe("cancelInvitation", () => {
  it("cancelInvitation#1 A、B は店舗 P の管理者。A が送った C 宛ての承諾前の招待がある / B を Actor として、その招待を取り消す", async () => {
    const k = authorityKit();
    const { A, B, P, invitation } = await invitedPlace(k);
    const mark = await k.mark();
    await cancel(k, B, P, invitation);
    const after = await k.stewardship(P);
    expect(after.invitations).toEqual([]);
    expect(stewardIds(after)).toEqual([A.accountId, B.accountId]);
    expect(await k.since(mark)).toEqual([]);
  });

  it("cancelInvitation#2 上のケースの後 / C を Actor として、その招待で acceptInvitation を実行する", async () => {
    const k = authorityKit();
    const { B, C, P, invitation } = await invitedPlace(k);
    await cancel(k, B, P, invitation);
    await expectBusiness(
      accept(k, C, P, invitation),
      "AUTHORITY_INVITATION_NOT_FOUND",
    );
    expect(stewardIds(await k.stewardship(P))).not.toContain(C.accountId);
  });

  it("cancelInvitation#3 地域 R は管理者不在で、C 宛ての承諾前の招待が残っている。O はサービス運営者 / O を Actor として、その招待を取り消す", async () => {
    const k = authorityKit();
    const [A, C, O] = [await k.person(), await k.person(), await k.person()];
    const R = k.region();
    await k.appoint(R, A);
    const invitation = await k.invite(R, C.email);
    await k.removeSteward(R, A);
    await k.operators(O);
    await cancel(k, O, R, invitation);
    const after = await k.stewardship(R);
    expect(after.invitations).toEqual([]);
    expect(after.status).toBe("vacant");
  });

  it("cancelInvitation#4 店舗 P の管理者は A。C 宛ての承諾前の招待がある。O はサービス運営者で、P の管理者ではない / O を Actor として、その招待を取り消す", async () => {
    const k = authorityKit();
    const [A, C, O] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    await k.operators(O);
    await expectCode(cancel(k, O, P, invitation), ForbiddenError);
    expect(invitationEmails(await k.stewardship(P))).toEqual([C.email]);
  });

  it("cancelInvitation#5 店舗 P の管理者は A。C 宛ての承諾前の招待がある。X は P の管理者でもサービス運営者でもない / X を Actor として、その招待を取り消す", async () => {
    const k = authorityKit();
    const [A, C, X] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    await expectCode(cancel(k, X, P, invitation), ForbiddenError);
    expect(invitationEmails(await k.stewardship(P))).toEqual([C.email]);
  });

  it("cancelInvitation#6 地域 R は管理者不在で、C 宛ての承諾前の招待がある。O はサービス運営者で、R の管理者ではない。O が招待を確かめた後、C が承諾して R の管理者に就いた / O を Actor として、その招待を取り消す", async () => {
    const k = authorityKit();
    const [A, C, O] = [await k.person(), await k.person(), await k.person()];
    const R = k.region();
    await k.appoint(R, A);
    const invitation = await k.invite(R, C.email);
    await k.removeSteward(R, A);
    await k.operators(O);
    expect(
      (
        await checkInvitation({
          container: k.container,
          actor: C.actor,
          input: { target: R, invitationId: invitation },
        })
      ).status,
    ).toBe("acceptable");
    await accept(k, C, R, invitation);
    const error = await rejection(cancel(k, O, R, invitation));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(isBusinessRuleError(error)).toBe(false);
    expect(stewardIds(await k.stewardship(R))).toEqual([C.accountId]);
  });

  it("cancelInvitation#7 A は店舗 P の管理者。C 宛ての招待は、C がすでに承諾している / A を Actor として、その招待を取り消す", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    await accept(k, C, P, invitation);
    await expectBusiness(
      cancel(k, A, P, invitation),
      "AUTHORITY_INVITATION_NOT_FOUND",
    );
    expect(stewardIds(await k.stewardship(P))).toEqual([
      A.accountId,
      C.accountId,
    ]);
  });

  it("cancelInvitation#8 A は店舗 P の管理者。C 宛ての承諾前の招待がある / A の取り消しと、C の承諾を同時に実行し、承諾が先に確定する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    const racing = commitAfter(k.container, () => accept(k, C, P, invitation));
    await expectCode(cancel(k, A, P, invitation, racing), ConflictError);
    await expectBusiness(
      cancel(k, A, P, invitation),
      "AUTHORITY_INVITATION_NOT_FOUND",
    );
    expect(stewardIds(await k.stewardship(P))).toEqual([
      A.accountId,
      C.accountId,
    ]);
  });
});
