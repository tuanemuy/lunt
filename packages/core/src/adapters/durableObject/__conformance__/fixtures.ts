import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { NotFoundError } from "@repo/core/application/errors";
import { Account } from "@repo/core/domain/account/entity";
import type { EventDraft } from "@repo/core/domain/common/event";
import type { AccountId } from "@repo/core/domain/common/ids";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import type { ConformanceHarness } from "./harness";

/**
 * Accounts with ascending ids and distinct emails, minted per test so a
 * suite never depends on another test's data.
 */
export function accountFactory() {
  const ids = new FakeIdGenerator();
  let n = 0;
  return (): Account => {
    n += 1;
    return Account.register({ id: ids.next(), email: `user${n}@example.com` });
  };
}

export async function insertAccounts(
  h: ConformanceHarness,
  ...accounts: readonly Account[]
): Promise<void> {
  await h.uow.run(async ({ accountRepository }) => {
    for (const account of accounts) {
      await accountRepository.insert(account);
    }
  });
}

export function findAccount(
  h: ConformanceHarness,
  id: AccountId,
): Promise<Versioned<Account> | null> {
  return h.uow.run(({ accountRepository }) => accountRepository.findById(id));
}

export async function getAccount(
  h: ConformanceHarness,
  id: AccountId,
): Promise<Versioned<Account>> {
  const found = await findAccount(h, id);
  if (found === null) throw new NotFoundError("TEST", `no account ${id}`);
  return found;
}

export function testDraft(
  aggregateId: string,
  payload: Record<string, unknown> = {},
): EventDraft {
  return {
    type: "conformance.happened",
    payload,
    occurredAt: new Date("2026-09-28T00:00:00.000Z"),
    aggregateId,
  };
}

/**
 * Returns a function that resolves once it has been called `parties`
 * times — lines concurrent scopes up after their reads, before their
 * writes.
 */
export function barrier(parties: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    arrived += 1;
    if (arrived === parties) release();
    return released;
  };
}

/** Error thrown by a scope on purpose; tests match it by identity. */
export class ScopeAbort extends Error {
  override readonly name = "ScopeAbort";
}
