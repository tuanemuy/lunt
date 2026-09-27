import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import { Account } from "@repo/core/domain/account/entity";
import { AccountId } from "@repo/core/domain/common/ids";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { describe, expect, it } from "vitest";
import { expectBusinessRuleError } from "./assertions";
import {
  accountFactory,
  barrier,
  findAccount,
  getAccount,
  insertAccounts,
  ScopeAbort,
} from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";

function findByEmail(h: ConformanceHarness, account: Account) {
  return h.uow.run(({ accountRepository }) =>
    accountRepository.findByEmail(account.email),
  );
}

function findByIds(h: ConformanceHarness, ids: readonly AccountId[]) {
  return h.uow.run(({ accountRepository }) => accountRepository.findByIds(ids));
}

function save(
  h: ConformanceHarness,
  account: Account,
  expectedVersion: ExpectedVersion<Account>,
) {
  return h.uow.run(({ accountRepository }) =>
    accountRepository.save(account, expectedVersion),
  );
}

function remove(
  h: ConformanceHarness,
  id: AccountId,
  expectedVersion: ExpectedVersion<Account>,
) {
  return h.uow.run(({ accountRepository }) =>
    accountRepository.delete(id, expectedVersion),
  );
}

const referenced = (read: Versioned<Account>) =>
  Account.markReferenced(read.entity);

const UNKNOWN_ID = AccountId.create("ffffffff-ffff-7fff-8fff-fffffffffff0");

/** `spec/testcases/ports/accountRepository.md`. */
export function describeAccountRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("AccountRepository contract", () => {
    describe("insert、findById、findByEmail", () => {
      it("accountRepository#1 空 / insert(A1) の後、findById(A1.id)", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const found = await findAccount(h, A1.id);
        expect(found?.entity).toEqual(A1);
        expect(typeof found?.expectedVersion).toBe("number");
      });

      it("accountRepository#2 insert(A1) 済み / findByEmail(A1.email)", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const byId = await getAccount(h, A1.id);
        expect(await findByEmail(h, A1)).toEqual(byId);
      });

      it("accountRepository#3 空 / findById(A1.id)", async () => {
        const h = await makeHarness();
        expect(await findAccount(h, accountFactory()().id)).toBeNull();
      });

      it("accountRepository#4 insert(A1) 済み / findByEmail(A2.email)", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const A1 = next();
        const A2 = next();
        await insertAccounts(h, A1);
        expect(await findByEmail(h, A2)).toBeNull();
      });

      it("accountRepository#5 insert(A1) 済み / 同じ id で、違う email のアカウントを insert", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const A1 = next();
        const other = Account.register({ id: A1.id, email: next().email });
        await insertAccounts(h, A1);
        await expect(insertAccounts(h, other)).rejects.toBeInstanceOf(
          ConflictError,
        );
        expect((await findAccount(h, A1.id))?.entity).toEqual(A1);
      });

      it("accountRepository#6 insert(A1) 済み / 違う id で、同じ email のアカウントを insert", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const A1 = next();
        const other = Account.register({ id: next().id, email: A1.email });
        await insertAccounts(h, A1);
        await expect(insertAccounts(h, other)).rejects.toBeInstanceOf(
          ConflictError,
        );
        expect((await findByEmail(h, A1))?.entity).toEqual(A1);
      });

      it("accountRepository#7 空 / 違う id・同じ email の2つのアカウントの insert を、別々の UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const first = next();
        const second = Account.register({ id: next().id, email: first.email });
        const bothRead = barrier(2);
        const attempt = (account: Account) =>
          h.uow.run(async ({ accountRepository }) => {
            expect(
              await accountRepository.findByEmail(account.email),
            ).toBeNull();
            await bothRead();
            await accountRepository.insert(account);
          });
        const results = await Promise.allSettled([
          attempt(first),
          attempt(second),
        ]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        const winners = (
          await Promise.all([
            findAccount(h, first.id),
            findAccount(h, second.id),
          ])
        ).filter((found) => found !== null);
        expect(winners).toHaveLength(1);
      });
    });

    describe("findByIds", () => {
      it("accountRepository#8 A1、A2、A3 を insert 済み / findByIds([A3.id, A1.id])", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const [A1, A2, A3] = [next(), next(), next()];
        await insertAccounts(h, A1, A2, A3);
        expect(await findByIds(h, [A3.id, A1.id])).toEqual([A1, A3]);
      });

      it("accountRepository#9 A1 を insert 済み / findByIds([A1.id])", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        expect(await findByIds(h, [A1.id])).toEqual([A1]);
      });

      it("accountRepository#10 A1 を insert 済み / findByIds([A1.id, 存在しない ID])", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        expect(await findByIds(h, [A1.id, UNKNOWN_ID])).toEqual([A1]);
      });

      it("accountRepository#11 A1 を insert 済み / findByIds([存在しない ID])", async () => {
        const h = await makeHarness();
        await insertAccounts(h, accountFactory()());
        expect(await findByIds(h, [UNKNOWN_ID])).toEqual([]);
      });

      it("accountRepository#12 A1、A2 を insert 済み。A2 を delete 済み / findByIds([A1.id, A2.id])", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const [A1, A2] = [next(), next()];
        await insertAccounts(h, A1, A2);
        const a2 = await getAccount(h, A2.id);
        await remove(h, A2.id, a2.expectedVersion);
        expect(await findByIds(h, [A1.id, A2.id])).toEqual([A1]);
      });

      it("accountRepository#13 A1 を insert 済み / findByIds([])", async () => {
        const h = await makeHarness();
        await insertAccounts(h, accountFactory()());
        expect(await findByIds(h, [])).toEqual([]);
      });

      it("accountRepository#14 100件のアカウントを insert 済み / 100件の ID で findByIds", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const accounts = Array.from({ length: 100 }, () => next());
        await insertAccounts(h, ...accounts);
        const found = await findByIds(
          h,
          [...accounts].reverse().map((account) => account.id),
        );
        expect(found).toEqual(accounts);
      });

      it("accountRepository#15 A1 を insert 済み / 101件の ID で findByIds", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const A1 = next();
        await insertAccounts(h, A1);
        const ids = [A1.id, ...Array.from({ length: 100 }, () => next().id)];
        await expectBusinessRuleError(
          findByIds(h, ids),
          "COMMON_INVALID_INPUT",
        );
      });
    });

    describe("save", () => {
      it("accountRepository#16 insert(A1) 済み。findById で expectedVersion V を得ている / Account.markReferenced(A1) を V で save し、findById(A1.id)", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const v = await getAccount(h, A1.id);
        await save(h, referenced(v), v.expectedVersion);
        const after = await getAccount(h, A1.id);
        expect(after.entity.id).toBe(A1.id);
        expect(after.entity.email).toBe(A1.email);
        expect(after.expectedVersion).not.toBe(v.expectedVersion);
        expect((await findByEmail(h, A1))?.expectedVersion).toBe(
          after.expectedVersion,
        );
      });

      it("accountRepository#17 insert(A1) 済み。findByEmail で expectedVersion V を得ている / V で save", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const v = await findByEmail(h, A1);
        if (v === null) throw new Error("missing");
        await save(h, referenced(v), v.expectedVersion);
        expect((await getAccount(h, A1.id)).entity).toEqual(
          Account.markReferenced(A1),
        );
      });

      it("accountRepository#18 insert(A1) 済み。expectedVersion V を得た後、別の save が成功している / V で save", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const v = await getAccount(h, A1.id);
        await save(h, referenced(v), v.expectedVersion);
        await expect(
          save(h, referenced(v), v.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
      });

      it("accountRepository#19 insert(A1) 済み。expectedVersion V を得た後、save が成功している / V で delete(A1.id, V)", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const v = await getAccount(h, A1.id);
        await save(h, referenced(v), v.expectedVersion);
        await expect(
          remove(h, A1.id, v.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        const latest = await getAccount(h, A1.id);
        await remove(h, A1.id, latest.expectedVersion);
        expect(await findAccount(h, A1.id)).toBeNull();
      });

      it("accountRepository#20 insert(A1) 済み。expectedVersion V を得た後、A1 を delete 済み / V で save", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const v = await getAccount(h, A1.id);
        await remove(h, A1.id, v.expectedVersion);
        await expect(
          save(h, referenced(v), v.expectedVersion),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("accountRepository#21 空 / save(A1, expectedVersion)", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await expect(
          save(h, A1, A1.version as number as ExpectedVersion<Account>),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("accountRepository#22 insert(A1) 済み。expectedVersion V を得ている / V での save と、V での delete(A1.id, V) を、別々の UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const v = await getAccount(h, A1.id);
        const [saved, deleted] = await Promise.allSettled([
          save(h, referenced(v), v.expectedVersion),
          remove(h, A1.id, v.expectedVersion),
        ]);
        expect(
          [saved, deleted].filter((r) => r.status === "fulfilled"),
        ).toHaveLength(1);
        if (saved.status === "fulfilled" && deleted.status === "rejected") {
          expect(deleted.reason).toBeInstanceOf(ConflictError);
        }
        if (deleted.status === "fulfilled" && saved.status === "rejected") {
          expect(
            saved.reason instanceof ConflictError ||
              saved.reason instanceof NotFoundError,
          ).toBe(true);
        }
      });
    });

    describe("delete", () => {
      it("accountRepository#23 insert(A1) 済み。findById で expectedVersion を得ている / delete(A1.id, expectedVersion) の後、findById(A1.id) と findByEmail(A1.email)", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const v = await getAccount(h, A1.id);
        await remove(h, A1.id, v.expectedVersion);
        expect(await findAccount(h, A1.id)).toBeNull();
        expect(await findByEmail(h, A1)).toBeNull();
      });

      it("accountRepository#24 insert(A1) 済み。A1 を delete 済み / 違う id・A1 と同じ email のアカウントを insert", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const A1 = next();
        await insertAccounts(h, A1);
        const v = await getAccount(h, A1.id);
        await remove(h, A1.id, v.expectedVersion);
        const again = Account.register({ id: next().id, email: A1.email });
        await insertAccounts(h, again);
        expect((await findByEmail(h, A1))?.entity).toEqual(again);
      });

      it("accountRepository#25 空 / delete(A1.id, expectedVersion)", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await expect(
          remove(h, A1.id, 0 as ExpectedVersion<Account>),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("accountRepository#26 insert(A1) 済み。A1 を delete 済み / 削除の前に得た expectedVersion で、もう一度 delete(A1.id, ...)", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const v = await getAccount(h, A1.id);
        await remove(h, A1.id, v.expectedVersion);
        await expect(
          remove(h, A1.id, v.expectedVersion),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("accountRepository#27 insert(A1) 済み / 同じ expectedVersion での delete(A1.id, ...) を、別々の UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const v = await getAccount(h, A1.id);
        const results = await Promise.allSettled([
          remove(h, A1.id, v.expectedVersion),
          remove(h, A1.id, v.expectedVersion),
        ]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(
          rejected[0]?.reason instanceof ConflictError ||
            rejected[0]?.reason instanceof NotFoundError,
        ).toBe(true);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("accountRepository#28 空 / UnitOfWork の中で insert(A1) してコミットし、直後に別の UnitOfWork で findById・findByEmail・findByIds", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const [byId, byEmail, byIds] = await h.uow.run(
          async ({ accountRepository }) =>
            Promise.all([
              accountRepository.findById(A1.id),
              accountRepository.findByEmail(A1.email),
              accountRepository.findByIds([A1.id]),
            ]),
        );
        expect(byId?.entity).toEqual(A1);
        expect(byEmail?.entity).toEqual(A1);
        expect(byIds).toEqual([A1]);
      });

      it("accountRepository#29 空 / UnitOfWork の中で insert(A1) と insert(A2) を行い、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const [A1, A2] = [next(), next()];
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.insert(A1);
            await accountRepository.insert(A2);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await findAccount(h, A1.id)).toBeNull();
        expect(await findAccount(h, A2.id)).toBeNull();
      });

      it("accountRepository#30 insert(A1) 済み / UnitOfWork の中で delete(A1.id, ...) を行い、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const A1 = accountFactory()();
        await insertAccounts(h, A1);
        const v = await getAccount(h, A1.id);
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.delete(A1.id, v.expectedVersion);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect((await findAccount(h, A1.id))?.entity).toEqual(A1);
        await remove(h, A1.id, v.expectedVersion);
        expect(await findAccount(h, A1.id)).toBeNull();
      });

      it("accountRepository#31 insert(A1) 済み。expectedVersion V を得た後、A1 を delete 済み / UnitOfWork の中で、insert(A2) と、V での A1 の save を行う", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const [A1, A2] = [next(), next()];
        await insertAccounts(h, A1);
        const v = await getAccount(h, A1.id);
        await remove(h, A1.id, v.expectedVersion);
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.insert(A2);
            await accountRepository.save(referenced(v), v.expectedVersion);
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(await findAccount(h, A2.id)).toBeNull();
      });

      it("accountRepository#32 insert(A1) 済み / UnitOfWork の中で、insert(A2) と、A1 と同じ email のアカウントの insert を行う", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const [A1, A2] = [next(), next()];
        const duplicate = Account.register({ id: next().id, email: A1.email });
        await insertAccounts(h, A1);
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.insert(A2);
            await accountRepository.insert(duplicate);
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await findAccount(h, A2.id)).toBeNull();
      });
    });
  });
}
