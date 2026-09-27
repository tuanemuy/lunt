import {
  ConflictError,
  UnauthorizedError,
} from "@repo/core/application/errors";
import type { InvitationId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import type { RequestContainer } from "../../di/types";
import { acceptInvitation } from "../acceptInvitation";
import { cancelInvitation } from "../cancelInvitation";
import { getMyAuthority } from "../getMyAuthority";
import { inviteMember } from "../inviteMember";
import { viewMembers } from "../viewMembers";
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

describe("acceptInvitation", () => {
  it("acceptInvitation#1 店舗 P の管理者は A。C のメールアドレス宛ての承諾前の招待がある / C を Actor として承諾する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    const mark = await k.mark();
    const now = k.tick();
    await accept(k, C, P, invitation);
    const after = await k.stewardship(P);
    expect(stewardIds(after)).toEqual([A.accountId, C.accountId]);
    expect(
      after.status === "stewarded" ? after.stewards[1]?.since : null,
    ).toEqual(now);
    expect(after.invitations).toEqual([]);
    expect(await k.since(mark)).toEqual([
      expect.objectContaining({
        type: "authority.steward_appointed",
        aggregateId: `place:${P.id}`,
        payload: { target: P, accountId: C.accountId, via: "invitation" },
      }),
    ]);
  });

  it("acceptInvitation#2 上のケースの後 / C を Actor として、P に viewMembers と inviteMember を実行する", async () => {
    const k = authorityKit();
    const [A, C, D] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    await accept(k, C, P, await k.invite(P, C.email));
    const members = await viewMembers({
      container: k.container,
      actor: C.actor,
      input: { target: P },
    });
    expect(members.stewards.map((s) => s.accountId)).toEqual([
      A.accountId,
      C.accountId,
    ]);
    await inviteMember({
      container: k.container,
      actor: C.actor,
      input: { target: P, invitationId: k.invitationId(), email: D.email },
    });
    expect(invitationEmails(await k.stewardship(P))).toEqual([D.email]);
  });

  it("acceptInvitation#3 店舗 P に C 宛ての承諾前の招待がある。AccountRepository.findById で C の expectedVersion V を得ている / C を Actor として承諾した後、V で AccountRepository.delete(C) を実行する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    const v = await k.getAccount(C);
    await accept(k, C, P, invitation);
    const after = await k.getAccount(C);
    expect(after.entity.version).toBeGreaterThan(v.entity.version);
    await expectCode(
      k.container.unitOfWorkProvider.run(({ accountRepository }) =>
        accountRepository.delete(C.accountId, v.expectedVersion),
      ),
      ConflictError,
    );
    await k.withdraw(C);
    expect(stewardIds(await k.stewardship(P))).toEqual([A.accountId]);
    expect(await k.findAccount(C)).toBeNull();
  });

  it("acceptInvitation#4 地域 R は管理者不在で、C 宛ての承諾前の招待が残っている / C を Actor として承諾する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const R = k.region();
    await k.appoint(R, A);
    const invitation = await k.invite(R, C.email);
    await k.removeSteward(R, A);
    const mark = await k.mark();
    await accept(k, C, R, invitation);
    const after = await k.stewardship(R);
    expect(after.status).toBe("stewarded");
    expect(stewardIds(after)).toEqual([C.accountId]);
    expect((await k.since(mark)).map((e) => e.type)).toEqual([
      "authority.steward_appointed",
    ]);
  });

  it("acceptInvitation#5 店舗 P に C 宛ての承諾前の招待がある。招待した管理者 A は、その後に退会している。P には別の管理者 B がいる / C を Actor として承諾する", async () => {
    const k = authorityKit();
    const [A, B, C] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A, B);
    const invitation = await k.invite(P, C.email);
    await k.withdraw(A);
    await accept(k, C, P, invitation);
    expect(stewardIds(await k.stewardship(P))).toEqual([
      B.accountId,
      C.accountId,
    ]);
  });

  it("acceptInvitation#6 店舗 P に、あるメールアドレス宛ての招待が、そのメールアドレスのアカウントがない時点で作られている。その後、そのメールアドレスでのログインでアカウント C が作られた / C を Actor として承諾する", async () => {
    const k = authorityKit();
    const A = await k.person();
    const P = k.place();
    await k.appoint(P, A);
    const email = k.unregisteredEmail("newcomer");
    const invitation = await k.invite(P, email);
    const C = await k.person(email.replace("@example.com", ""));
    expect(C.email).toBe(email);
    await accept(k, C, P, invitation);
    expect(stewardIds(await k.stewardship(P))).toContain(C.accountId);
  });

  it("acceptInvitation#7 C は店舗 P1 の管理者。店舗 P2 に C 宛ての承諾前の招待がある / C を Actor として P2 の招待を承諾し、getMyAuthority を実行する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const [P1, P2] = [k.place("一号店"), k.place("二号店")];
    await k.appoint(P1, C);
    await k.appoint(P2, A);
    const invitation = await k.invite(P2, C.email);
    const p1Before = await k.findStewardship(P1);
    await accept(k, C, P2, invitation);
    const mine = await getMyAuthority({
      container: k.container,
      actor: C.actor,
      input: { pagination: { page: 1, limit: 100 } },
    });
    expect(mine.stewarded).toEqual({
      items: [
        { target: P1, name: "一号店" },
        { target: P2, name: "二号店" },
      ],
      count: 2,
    });
    expect(await k.findStewardship(P1)).toEqual(p1Before);
  });

  it("acceptInvitation#8 店舗 P に、C 宛てと D 宛ての承諾前の招待がある / C を Actor として承諾する", async () => {
    const k = authorityKit();
    const [A, C, D] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    await k.invite(P, D.email);
    await accept(k, C, P, invitation);
    expect(invitationEmails(await k.stewardship(P))).toEqual([D.email]);
  });

  it("acceptInvitation#9 店舗 P に C 宛ての承諾前の招待がある。X のメールアドレスは C と異なる / X を Actor として、その招待を承諾する", async () => {
    const k = authorityKit();
    const [A, C, X] = [await k.person(), await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    await expectBusiness(
      accept(k, X, P, invitation),
      "AUTHORITY_INVITATION_EMAIL_MISMATCH",
    );
    const after = await k.stewardship(P);
    expect(stewardIds(after)).toEqual([A.accountId]);
    expect(invitationEmails(after)).toEqual([C.email]);
  });

  it("acceptInvitation#10 店舗 P の C 宛ての招待が取り消されている / C を Actor として承諾する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    await k.cancel(P, invitation);
    await expectBusiness(
      accept(k, C, P, invitation),
      "AUTHORITY_INVITATION_NOT_FOUND",
    );
    expect(stewardIds(await k.stewardship(P))).toEqual([A.accountId]);
  });

  it("acceptInvitation#11 C は店舗 P の管理者になっている / C を Actor として、以前の招待の InvitationId で承諾する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    await accept(k, C, P, invitation);
    const before = await k.findStewardship(P);
    const mark = await k.mark();
    await expectBusiness(
      accept(k, C, P, invitation),
      "AUTHORITY_ALREADY_STEWARD",
    );
    expect(await k.findStewardship(P)).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("acceptInvitation#12 A は店舗 P の管理者。C 宛ての承諾前の招待がある / C の承諾と、A の取り消しを同時に実行し、取り消しが先に確定する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    const racing = commitAfter(k.container, () =>
      cancelInvitation({
        container: k.container,
        actor: A.actor,
        input: { target: P, invitationId: invitation },
      }),
    );
    await expectCode(accept(k, C, P, invitation, racing), ConflictError);
    await expectBusiness(
      accept(k, C, P, invitation),
      "AUTHORITY_INVITATION_NOT_FOUND",
    );
    expect(stewardIds(await k.stewardship(P))).toEqual([A.accountId]);
  });

  it("acceptInvitation#13 店舗 P に C 宛ての承諾前の招待がある。C の Actor が作られた後、C の退会がコミットした / その Actor で承諾する（AccountRepository.findById(C) が null）", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitation = await k.invite(P, C.email);
    await k.deleteAccount(C);
    const mark = await k.mark();
    await expectCode(accept(k, C, P, invitation), UnauthorizedError);
    expect(stewardIds(await k.stewardship(P))).toEqual([A.accountId]);
    expect(await k.since(mark)).toEqual([]);
  });
});
