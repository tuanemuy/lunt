import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@repo/core/application/errors";
import type { GrantableRef } from "@repo/core/domain/authority/stewardship";
import { RegionId } from "@repo/core/domain/common/ids";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { grantStewardship } from "../grantStewardship";
import { inviteMember } from "../inviteMember";
import { viewMembers } from "../viewMembers";
import {
  authorityKit,
  expectCode,
  invitationEmails,
  type Kit,
  type Person,
  rejection,
  stewardIds,
} from "./kit";

const grant = (k: Kit, who: Person, target: GrantableRef, email: string) =>
  grantStewardship({
    container: k.container,
    actor: who.actor,
    input: { target, email },
  });

async function expectBusiness(promise: Promise<unknown>, code: string) {
  const error = await rejection(promise);
  expect(isBusinessRuleError(error)).toBe(true);
  expect((error as { code?: unknown }).code).toBe(code);
}

/** A region, account U and operator O. */
async function setup(k: Kit, name: string | null = "谷中") {
  const [U, O] = [await k.person(), await k.person()];
  await k.operators(O);
  return { U, O, R: k.region(name) };
}

describe("grantStewardship", () => {
  it("grantStewardship#1 地域 R があり、管理体制は保存されたことがない。U のアカウントがある。O はサービス運営者 / O を Actor として、R と U のメールアドレスで付与する", async () => {
    const k = authorityKit();
    const { U, O, R } = await setup(k);
    expect(await k.findStewardship(R)).toBeNull();
    const mark = await k.mark();
    await grant(k, O, R, U.email);
    const after = await k.stewardship(R);
    expect(after).toMatchObject({
      status: "stewarded",
      stewards: [{ accountId: U.accountId, since: k.clock.now() }],
    });
    expect(await k.since(mark)).toEqual([
      expect.objectContaining({
        type: "authority.steward_appointed",
        aggregateId: `region:${R.id}`,
        payload: { target: R, accountId: U.accountId, via: "grant" },
      }),
    ]);
  });

  it("grantStewardship#2 上のケースの後 / U を Actor として、R に viewMembers と inviteMember を実行する", async () => {
    const k = authorityKit();
    const { U, O, R } = await setup(k);
    await grant(k, O, R, U.email);
    const members = await viewMembers({
      container: k.container,
      actor: U.actor,
      input: { target: R },
    });
    expect(members.stewards.map((s) => [s.accountId, s.isSelf])).toEqual([
      [U.accountId, true],
    ]);
    const email = k.unregisteredEmail();
    await inviteMember({
      container: k.container,
      actor: U.actor,
      input: { target: R, invitationId: k.invitationId(), email },
    });
    expect(invitationEmails(await k.stewardship(R))).toEqual([email]);
  });

  it("grantStewardship#3 地域 R がある。U のアカウントがあり、AccountRepository.findById で U の expectedVersion V を得ている。O はサービス運営者 / O を Actor として、R と U のメールアドレスで付与した後、V で AccountRepository.delete(U) を実行する", async () => {
    const k = authorityKit();
    const { U, O, R } = await setup(k);
    const v = await k.getAccount(U);
    await grant(k, O, R, U.email);
    expect((await k.getAccount(U)).entity.version).toBeGreaterThan(
      v.entity.version,
    );
    await expectCode(
      k.container.unitOfWorkProvider.run(({ accountRepository }) =>
        accountRepository.delete(U.accountId, v.expectedVersion),
      ),
      ConflictError,
    );
    await k.withdraw(U);
    expect(stewardIds(await k.stewardship(R))).toEqual([]);
  });

  it("grantStewardship#4 イベント E の管理者は A。U のアカウントがある。O はサービス運営者 / O を Actor として、E と U のメールアドレスで付与する", async () => {
    const k = authorityKit();
    const [A, U, O] = [await k.person(), await k.person(), await k.person()];
    await k.operators(O);
    const E = k.occasion();
    await k.appoint(E, A);
    const mark = await k.mark();
    await grantStewardship({
      container: k.container,
      actor: O.actor,
      input: { target: E, email: U.email },
    });
    expect(stewardIds(await k.stewardship(E))).toEqual([
      A.accountId,
      U.accountId,
    ]);
    expect(await k.since(mark)).toEqual([
      expect.objectContaining({
        type: "authority.steward_appointed",
        payload: { target: E, accountId: U.accountId, via: "grant" },
      }),
    ]);
  });

  it("grantStewardship#5 下書きの地域 R がある。U のアカウントがある。O はサービス運営者 / O を Actor として付与する", async () => {
    const k = authorityKit();
    const { U, O, R } = await setup(k, null);
    await grant(k, O, R, U.email);
    expect(stewardIds(await k.stewardship(R))).toEqual([U.accountId]);
  });

  it("grantStewardship#6 地域 R に、U のメールアドレス宛ての承諾前の招待がある。O はサービス運営者 / O を Actor として、R と U のメールアドレスで付与する", async () => {
    const k = authorityKit();
    const { U, O, R } = await setup(k);
    const [A, D] = [await k.person(), await k.person()];
    await k.appoint(R, A);
    await k.invite(R, U.email);
    await k.invite(R, D.email);
    await grant(k, O, R, U.email);
    const after = await k.stewardship(R);
    expect(stewardIds(after)).toEqual([A.accountId, U.accountId]);
    expect(invitationEmails(after)).toEqual([D.email]);
  });

  it("grantStewardship#7 地域 R がある。あるメールアドレスのアカウントがない。O はサービス運営者 / O を Actor として、そのメールアドレスで付与する", async () => {
    const k = authorityKit();
    const { O, R } = await setup(k);
    const mark = await k.mark();
    await expectCode(grant(k, O, R, k.unregisteredEmail()), NotFoundError);
    expect(await k.findStewardship(R)).toBeNull();
    expect(await k.since(mark)).toEqual([]);
  });

  it("grantStewardship#8 U は地域 R の管理者。O はサービス運営者 / O を Actor として、R と U のメールアドレスで付与する", async () => {
    const k = authorityKit();
    const { U, O, R } = await setup(k);
    await k.appoint(R, U);
    const before = await k.findStewardship(R);
    await expectBusiness(grant(k, O, R, U.email), "AUTHORITY_ALREADY_STEWARD");
    expect(await k.findStewardship(R)).toEqual(before);
  });

  it("grantStewardship#9 地域 R がある。O はサービス運営者 / O を Actor として、形式の正しくないメールアドレスで付与する", async () => {
    const k = authorityKit();
    const { O, R } = await setup(k);
    await expectBusiness(
      grant(k, O, R, "not-an-email"),
      "COMMON_INVALID_EMAIL_ADDRESS",
    );
  });

  it("grantStewardship#10 U のアカウントがある。O はサービス運営者 / O を Actor として、存在しない地域の ID と U のメールアドレスで付与する", async () => {
    const k = authorityKit();
    const { U, O } = await setup(k);
    const missing: GrantableRef = {
      kind: "region",
      id: RegionId.create(k.invitationId()),
    };
    await expectCode(grant(k, O, missing, U.email), NotFoundError);
    expect(await k.findStewardship(missing)).toBeNull();
  });

  it("grantStewardship#11 A は地域 R の管理者で、サービス運営者ではない。U のアカウントがある / A を Actor として、R と U のメールアドレスで付与する", async () => {
    const k = authorityKit();
    const { U, R } = await setup(k);
    const A = await k.person();
    await k.appoint(R, A);
    await expectCode(grant(k, A, R, U.email), ForbiddenError);
    expect(stewardIds(await k.stewardship(R))).toEqual([A.accountId]);
  });
});
