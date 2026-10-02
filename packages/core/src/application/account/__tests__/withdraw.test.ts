import { fakeIdpProof } from "@repo/core/adapters/fake/testing/fakeIdpFlow";
import { Account } from "@repo/core/domain/account/entity";
import { ExternalProviderKey } from "@repo/core/domain/account/externalIdentity";
import { describe, expect, it } from "vitest";
import {
  authorityKit,
  commitAfter,
  expectCode,
  type Kit,
  type Person,
  rejection,
  stewardIds,
} from "../../authority/__tests__/kit";
import { acceptInvitation } from "../../authority/acceptInvitation";
import { getMyAuthority } from "../../authority/getMyAuthority";
import type { RequestContainer } from "../../di/types";
import { ConflictError, UnauthorizedError } from "../../errors";
import { loginWithExternalAccount } from "../loginWithExternalAccount";
import { withdraw } from "../withdraw";
import { TEST_SECRET_KEY } from "./testServices";

const withdrawAs = (
  k: Kit,
  who: Person,
  container: RequestContainer = k.container,
) => withdraw({ container, actor: who.actor, input: {} });

async function expectLastOperator(promise: Promise<unknown>): Promise<void> {
  const error = await rejection(promise);
  expect(error).toMatchObject({
    name: "BusinessRuleError",
    code: "AUTHORITY_LAST_OPERATOR",
  });
}

describe("withdraw", () => {
  it("withdraw#1 アカウント A は、どの対象の管理者でもなく、役割も持たない / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    const mark = await k.mark();
    await withdrawAs(k, A);
    expect(await k.findAccount(A)).toBeNull();
    expect(
      await k.container.unitOfWorkProvider.run(({ accountRepository }) =>
        accountRepository.findByEmail(A.email),
      ),
    ).toBeNull();
    expect(
      (await k.since(mark)).map(({ type, aggregateId, payload }) => ({
        type,
        aggregateId,
        payload,
      })),
    ).toEqual([
      {
        type: "account.withdrawn",
        aggregateId: A.accountId,
        payload: { accountId: A.accountId },
      },
    ]);
  });

  it("withdraw#2 A は店舗 P の2人の管理者の1人（もう1人は B）、地域 R の唯一の管理者、編集担当者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    const R = k.region();
    await k.appoint(P, A, B);
    await k.appoint(R, A);
    await k.editors(A);
    const mark = await k.mark();
    await withdrawAs(k, A);

    expect(await k.findAccount(A)).toBeNull();
    const p = await k.stewardship(P);
    expect(p.status).toBe("stewarded");
    expect(stewardIds(p)).toEqual([B.accountId]);
    expect((await k.stewardship(R)).status).toBe("vacant");
    expect(await k.holders("editor")).toEqual([]);

    const events = (await k.since(mark)).map(
      ({ type, aggregateId, payload }) => ({
        type,
        aggregateId,
        payload,
      }),
    );
    const placeKey = `place:${P.id}`;
    const regionKey = `region:${R.id}`;
    expect(events).toHaveLength(5);
    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: "account.withdrawn",
          aggregateId: A.accountId,
          payload: { accountId: A.accountId },
        },
        {
          type: "authority.steward_removed",
          aggregateId: placeKey,
          payload: { target: P, accountId: A.accountId, reason: "withdrawn" },
        },
        {
          type: "authority.steward_removed",
          aggregateId: regionKey,
          payload: { target: R, accountId: A.accountId, reason: "withdrawn" },
        },
        {
          type: "authority.stewardship_vacated",
          aggregateId: regionKey,
          payload: { target: R },
        },
        {
          type: "authority.role_revoked",
          aggregateId: "editor",
          payload: {
            role: "editor",
            accountId: A.accountId,
            reason: "withdrawn",
          },
        },
      ]),
    );
    expect(
      events.filter(
        (e) =>
          e.type === "authority.stewardship_vacated" &&
          e.aggregateId === placeKey,
      ),
    ).toEqual([]);
  });

  it("withdraw#3 A は店舗 P の唯一の管理者。P に、A が送った承諾前の招待（宛先は C のメールアドレス）がある / A を Actor として実行する", async () => {
    const k = authorityKit();
    const [A, C] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    const invitationId = await k.invite(P, C.email);
    await withdrawAs(k, A);
    const vacant = await k.stewardship(P);
    expect(vacant.status).toBe("vacant");
    expect(vacant.invitations.map((i) => i.id)).toEqual([invitationId]);
    await acceptInvitation({
      container: k.container,
      actor: C.actor,
      input: { target: P, invitationId },
    });
    const after = await k.stewardship(P);
    expect(after.status).toBe("stewarded");
    expect(stewardIds(after)).toEqual([C.accountId]);
  });

  it("withdraw#4 A は唯一のサービス運営者で、店舗 P の管理者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const A = await k.person();
    const P = k.place();
    await k.appoint(P, A);
    await k.operators(A);
    const before = await Promise.all([
      k.getAccount(A),
      k.findStewardship(P),
      k.roster("operator"),
    ]);
    const mark = await k.mark();
    await expectLastOperator(withdrawAs(k, A));
    expect(
      await Promise.all([
        k.getAccount(A),
        k.findStewardship(P),
        k.roster("operator"),
      ]),
    ).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("withdraw#5 A と B がサービス運営者 / A を Actor として実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    await k.operators(A, B);
    const mark = await k.mark();
    await withdrawAs(k, A);
    expect(await k.holders("operator")).toEqual([B.accountId]);
    expect(
      (await k.since(mark))
        .filter((e) => e.type === "authority.role_revoked")
        .map((e) => e.payload),
    ).toEqual([
      { role: "operator", accountId: A.accountId, reason: "withdrawn" },
    ]);
  });

  it("withdraw#6 A と B がサービス運営者 / A の withdraw と、B の withdraw を同時に実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    await k.operators(A, B);
    // A has read everything; B's withdrawal commits before A's does.
    const racing = commitAfter(k.container, () => withdrawAs(k, B));
    await expectCode(withdrawAs(k, A, racing), ConflictError);
    expect(await k.findAccount(B)).toBeNull();
    expect(await k.getAccount(A)).not.toBeNull();
    expect(await k.holders("operator")).toEqual([A.accountId]);
    await expectLastOperator(withdrawAs(k, A));
    expect(await k.holders("operator")).toEqual([A.accountId]);
  });

  it("withdraw#7 A が退会している / A のメールアドレスでログインを成立させ、getMyAuthority を実行する", async () => {
    const k = authorityKit();
    const [A, B] = [await k.person(), await k.person()];
    const P = k.place();
    await k.appoint(P, A);
    await k.operators(B, A);
    await k.editors(A);
    await withdrawAs(k, A);

    const proof = await fakeIdpProof({
      starter: k.container.externalLoginStarter,
      provider: ExternalProviderKey.create("google"),
      secret: TEST_SECRET_KEY,
      now: k.clock.now(),
      choice: { kind: "verified", email: A.email },
    });
    const again = await loginWithExternalAccount({
      container: k.container,
      input: { provider: "google", proof },
    });
    expect(again.email).toBe(A.email);
    expect(again.accountId).not.toBe(A.accountId);

    expect(
      await getMyAuthority({
        container: k.container,
        actor: { accountId: again.accountId },
        input: { pagination: { page: 1, limit: 20 } },
      }),
    ).toEqual({ stewarded: { items: [], count: 0 }, roles: [] });
    expect((await k.stewardship(P)).status).toBe("vacant");
    expect(await k.holders("operator")).toEqual([B.accountId]);
  });

  it("answers UnauthorizedError when the account was already withdrawn", async () => {
    const k = authorityKit();
    const A = await k.person();
    await withdrawAs(k, A);
    await expectCode(withdrawAs(k, A), UnauthorizedError);
  });

  it("conflicts with a grant that committed after its reads, and a resend removes the new role too", async () => {
    const k = authorityKit();
    const A = await k.person();
    const racing = commitAfter(k.container, async () => {
      await k.editors(A);
      // A grant advances the grantee's account version (markReferenced).
      await k.container.unitOfWorkProvider.run(
        async ({ accountRepository }) => {
          const read = await accountRepository.findById(A.accountId);
          if (read === null) throw new Error("missing");
          await accountRepository.save(
            Account.markReferenced(read.entity),
            read.expectedVersion,
          );
        },
      );
    });
    await expectCode(withdrawAs(k, A, racing), ConflictError);
    expect(await k.holders("editor")).toEqual([A.accountId]);
    await withdrawAs(k, A);
    expect(await k.holders("editor")).toEqual([]);
    expect(await k.findAccount(A)).toBeNull();
  });
});
