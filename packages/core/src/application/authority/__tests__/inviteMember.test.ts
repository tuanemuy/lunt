import { ConflictError, ForbiddenError } from "@repo/core/application/errors";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import type { GeneratedId } from "../../ports/idGenerator";
import { inviteMember } from "../inviteMember";
import {
  authorityKit,
  expectCode,
  invitationEmails,
  type Kit,
  type Person,
  rejection,
  stewardIds,
} from "./kit";

const invite = (
  k: Kit,
  who: Person,
  target: StewardedRef,
  email: string,
  invitationId: GeneratedId = k.invitationId(),
) =>
  inviteMember({
    container: k.container,
    actor: who.actor,
    input: { target, invitationId, email },
  });

async function expectBusiness(promise: Promise<unknown>, code: string) {
  const error = await rejection(promise);
  expect(isBusinessRuleError(error)).toBe(true);
  expect((error as { code?: unknown }).code).toBe(code);
}

describe("inviteMember", () => {
  it("inviteMember#1 A は店舗 P の管理者。C のアカウントがある / A を Actor として、新しい InvitationId と C のメールアドレスで招待する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const mark = await k.mark();
    const id = k.invitationId();
    await invite(k, A, P, C.email, id);
    const after = await k.stewardship(P);
    expect(after.invitations).toEqual([
      { id, email: C.email, invitedAt: k.clock.now() },
    ]);
    expect(stewardIds(after)).toEqual([A.accountId]);
    expect(await k.since(mark)).toEqual([
      expect.objectContaining({
        type: "authority.invitation_issued",
        aggregateId: `place:${P.id}`,
        payload: { target: P, invitationId: id, email: C.email },
      }),
    ]);
  });

  it("inviteMember#2 A は地域 R の管理者。あるメールアドレスのアカウントがない / A を Actor として、そのメールアドレスで招待する", async () => {
    const k = authorityKit();
    const A = await k.person();
    const R = k.region();
    await k.appoint(R, A);
    const email = k.unregisteredEmail();
    const mark = await k.mark();
    await invite(k, A, R, email);
    expect(invitationEmails(await k.stewardship(R))).toEqual([email]);
    expect((await k.since(mark)).map((e) => e.type)).toEqual([
      "authority.invitation_issued",
    ]);
  });

  it("inviteMember#3 A、B は店舗 P の管理者 / A を Actor として、B のメールアドレスで招待する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A, B);
    const mark = await k.mark();
    await expectBusiness(invite(k, A, P, B.email), "AUTHORITY_ALREADY_STEWARD");
    expect((await k.stewardship(P)).invitations).toEqual([]);
    expect(await k.since(mark)).toEqual([]);
  });

  it("inviteMember#4 A は店舗 P の管理者。C のメールアドレス宛ての承諾前の招待がある / A を Actor として、別の InvitationId と C のメールアドレスで招待する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    await k.invite(P, C.email);
    await expectBusiness(
      invite(k, A, P, C.email),
      "AUTHORITY_INVITATION_ALREADY_PENDING",
    );
    expect((await k.stewardship(P)).invitations).toHaveLength(1);
  });

  it("inviteMember#5 A は店舗 P の管理者 / A を Actor として、形式の正しくないメールアドレスで招待する", async () => {
    const k = authorityKit();
    const A = await k.person();
    const P = k.place();
    await k.appoint(P, A);
    await expectBusiness(
      invite(k, A, P, "not-an-email"),
      "COMMON_INVALID_EMAIL_ADDRESS",
    );
    expect((await k.stewardship(P)).invitations).toEqual([]);
  });

  it("inviteMember#6 A は店舗 P の管理者。ある InvitationId で C 宛ての招待が成立している / 同じ InvitationId・同じメールアドレスで送り直す", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const id = k.invitationId();
    await invite(k, A, P, C.email, id);
    const before = await k.findStewardship(P);
    const mark = await k.mark();
    await invite(k, A, P, ` ${C.email.toUpperCase()} `, id);
    expect(await k.findStewardship(P)).toEqual(before);
    expect(before?.entity.invitations).toHaveLength(1);
    expect(await k.since(mark)).toEqual([]);
  });

  it("inviteMember#7 A は店舗 P の管理者。ある InvitationId で C 宛ての招待が成立している / 同じ InvitationId と、D のメールアドレスで招待する", async () => {
    const k = authorityKit();
    const [A, C, D] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const id = k.invitationId();
    await invite(k, A, P, C.email, id);
    const before = await k.findStewardship(P);
    await expectCode(invite(k, A, P, D.email, id), ConflictError);
    expect(await k.findStewardship(P)).toEqual(before);
  });

  it("inviteMember#8 店舗 P の管理者は A。X は P の管理者でない / X を Actor として P に招待する", async () => {
    const k = authorityKit();
    const [A, X, C] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    await expectCode(invite(k, X, P, C.email), ForbiddenError);
    expect((await k.stewardship(P)).invitations).toEqual([]);
  });

  it("inviteMember#9 店舗 P の管理者は A。O はサービス運営者で、P の管理者ではない / O を Actor として P に招待する", async () => {
    const k = authorityKit();
    const [A, O, C] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    await k.operators(O);
    await expectCode(invite(k, O, P, C.email), ForbiddenError);
  });

  it("inviteMember#10 地域 R は管理者不在。O はサービス運営者 / O を Actor として R に招待する", async () => {
    const k = authorityKit();
    const [O, C] = [await k.person(), await k.person()];
    const R = k.region();
    await k.operators(O);
    await expectCode(invite(k, O, R, C.email), ForbiddenError);
    expect(await k.findStewardship(R)).toBeNull();
  });

  it("inviteMember#11 X は地域 R の管理者で、店舗 P の管理者ではない / X を Actor として P に招待する", async () => {
    const k = authorityKit();
    const [A, X, C] = [await k.person(), await k.person(), await k.person()];
    const [P, R] = [k.place(), k.region()];
    await k.appoint(P, A);
    await k.appoint(R, X);
    await expectCode(invite(k, X, P, C.email), ForbiddenError);
  });
});
