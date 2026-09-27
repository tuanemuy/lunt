import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import { Account } from "@repo/core/domain/account/entity";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import { describe, expect, it } from "vitest";
import {
  accountFactory,
  findAccount,
  getAccount,
  insertAccounts,
  ScopeAbort,
  testDraft,
} from "./fixtures";
import type { HarnessFactory } from "./harness";

/**
 * `spec/testcases/ports/unitOfWork.md`. Aggregates X / Y / Z are accounts
 * (`AccountRepository` has insert / findById / save / delete and the
 * email uniqueness the last conflict case needs). "Saved events" are the
 * outbox rows the relay would pick up.
 */
export function describeUnitOfWorkContract(makeHarness: HarnessFactory): void {
  describe("UnitOfWork contract", () => {
    describe("コミット", () => {
      it("unitOfWork#1 集約 X がない / fn の中で X を insert し、値を返す", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        const result = await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.insert(X);
          return "returned";
        });
        expect(result).toBe("returned");
        expect((await findAccount(h, X.id))?.entity).toEqual(X);
      });

      it("unitOfWork#2 集約 X がある / fn の中で X を findById し、変更を save して、値を返す", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const before = await getAccount(h, X.id);
        const changed = Account.markReferenced(before.entity);
        await h.uow.run(async ({ accountRepository }) => {
          const found = await accountRepository.findById(X.id);
          if (found === null) throw new Error("missing");
          await accountRepository.save(
            Account.markReferenced(found.entity),
            found.expectedVersion,
          );
          return "ok";
        });
        const after = await getAccount(h, X.id);
        expect(after.entity).toEqual(changed);
        expect(after.expectedVersion).not.toBe(before.expectedVersion);
      });

      it("unitOfWork#3 集約 X がある / fn の中で X を findById し、delete して、値を返す", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        await h.uow.run(async ({ accountRepository }) => {
          const found = await accountRepository.findById(X.id);
          if (found === null) throw new Error("missing");
          await accountRepository.delete(X.id, found.expectedVersion);
        });
        expect(await findAccount(h, X.id)).toBeNull();
      });

      it("unitOfWork#4 集約 X がある。集約 Y がない / fn の中で X を save し、Y を insert して、値を返す", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const X = next();
        const Y = next();
        await insertAccounts(h, X);
        const x = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(x.entity),
            x.expectedVersion,
          );
          await accountRepository.insert(Y);
        });
        expect((await getAccount(h, X.id)).entity).toEqual(
          Account.markReferenced(X),
        );
        expect((await findAccount(h, Y.id))?.entity).toEqual(Y);
      });

      it("unitOfWork#5 なし / fn の中で何も書き込まず、値を返す", async () => {
        const h = await makeHarness();
        const result = await h.uow.run(async () => 42);
        expect(result).toBe(42);
        expect(await h.savedEvents()).toEqual([]);
      });
    });

    describe("ロールバック", () => {
      it("unitOfWork#6 集約 X がない / fn の中で X を insert し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.insert(X);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findAccount(h, X.id)).toBeNull();
      });

      it("unitOfWork#7 集約 X がある / fn の中で X を save し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const before = await getAccount(h, X.id);
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.save(
              Account.markReferenced(before.entity),
              before.expectedVersion,
            );
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await getAccount(h, X.id)).toEqual(before);
      });

      it("unitOfWork#8 集約 X がある / fn の中で X を delete し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const before = await getAccount(h, X.id);
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.delete(X.id, before.expectedVersion);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await getAccount(h, X.id)).toEqual(before);
      });

      it("unitOfWork#9 集約 X がある。集約 Y がない / fn の中で X を save し、Y を insert し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const X = next();
        const Y = next();
        await insertAccounts(h, X);
        const before = await getAccount(h, X.id);
        await expect(
          h.uow.run(async ({ accountRepository, collectEvents }) => {
            await accountRepository.save(
              Account.markReferenced(before.entity),
              before.expectedVersion,
            );
            await accountRepository.insert(Y);
            collectEvents([testDraft(Y.id)]);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await getAccount(h, X.id)).toEqual(before);
        expect(await findAccount(h, Y.id)).toBeNull();
        expect(await h.savedEvents()).toEqual([]);
      });

      it("unitOfWork#10 集約 X がない / fn の中で X を insert し、下書きを collectEvents に渡し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await expect(
          h.uow.run(async ({ accountRepository, collectEvents }) => {
            await accountRepository.insert(X);
            collectEvents([testDraft(X.id)]);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await findAccount(h, X.id)).toBeNull();
        expect(await h.savedEvents()).toEqual([]);
      });

      it("unitOfWork#11 なし / fn の中で、書き込まずに下書きを collectEvents に渡し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        await expect(
          h.uow.run(async ({ collectEvents }) => {
            collectEvents([testDraft("nothing")]);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await h.savedEvents()).toEqual([]);
      });

      it("unitOfWork#12 集約 X がある。集約 Y がある / fn の中で Y を insert する（ConflictError）。その前に X を save している", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const X = next();
        const Y = next();
        await insertAccounts(h, X, Y);
        const before = await getAccount(h, X.id);
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.save(
              Account.markReferenced(before.entity),
              before.expectedVersion,
            );
            await accountRepository.insert(Y);
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await getAccount(h, X.id)).toEqual(before);
      });

      it("unitOfWork#13 集約 X がある。一度も insert していない集約 Z / fn の中で X を save し、その後に、X の findById で得た expectedVersion で Z を save する（NotFoundError）", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const X = next();
        const Z = next();
        await insertAccounts(h, X);
        const before = await getAccount(h, X.id);
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.save(
              Account.markReferenced(before.entity),
              before.expectedVersion,
            );
            await accountRepository.save(
              Z,
              before.expectedVersion as number as ExpectedVersion<Account>,
            );
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(await getAccount(h, X.id)).toEqual(before);
      });
    });

    describe("ドメインイベント", () => {
      it("unitOfWork#14 集約 X がない / fn の中で X を insert し、下書きを1件 collectEvents に渡して、値を返す", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await h.uow.run(async ({ accountRepository, collectEvents }) => {
          await accountRepository.insert(X);
          collectEvents([testDraft(X.id, { n: 1, nested: { ok: true } })]);
        });
        expect((await findAccount(h, X.id))?.entity).toEqual(X);
        expect(await h.savedEvents()).toEqual([
          {
            type: "conformance.happened",
            aggregateId: X.id,
            payload: { n: 1, nested: { ok: true } },
          },
        ]);
      });

      it("unitOfWork#15 集約 X がある / fn の中で X を save し、collectEvents を2回呼んで、合わせて3件の下書きを渡す", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const x = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository, collectEvents }) => {
          await accountRepository.save(
            Account.markReferenced(x.entity),
            x.expectedVersion,
          );
          collectEvents([testDraft(X.id, { n: 1 })]);
          collectEvents([testDraft(X.id, { n: 2 }), testDraft(X.id, { n: 3 })]);
        });
        const saved = await h.savedEvents();
        expect(saved.map((event) => event.payload)).toEqual(
          expect.arrayContaining([{ n: 1 }, { n: 2 }, { n: 3 }]),
        );
        expect(saved).toHaveLength(3);
      });

      it("unitOfWork#16 集約 X がある / fn の中で X を save し、空の下書きの一覧を collectEvents に渡す", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const x = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository, collectEvents }) => {
          await accountRepository.save(
            Account.markReferenced(x.entity),
            x.expectedVersion,
          );
          collectEvents([]);
        });
        expect((await getAccount(h, X.id)).entity).toEqual(
          Account.markReferenced(X),
        );
        expect(await h.savedEvents()).toEqual([]);
      });

      it("unitOfWork#17 集約 X がある / fn の中で X を save し、collectEvents を呼ばない", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const x = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(x.entity),
            x.expectedVersion,
          );
        });
        expect((await getAccount(h, X.id)).entity).toEqual(
          Account.markReferenced(X),
        );
        expect(await h.savedEvents()).toEqual([]);
      });

      it("unitOfWork#18 なし / fn の中で、書き込まずに下書きを1件 collectEvents に渡して、値を返す", async () => {
        const h = await makeHarness();
        await h.uow.run(async ({ collectEvents }) => {
          collectEvents([testDraft("only-event")]);
          return "ok";
        });
        expect(await h.savedEvents()).toEqual([
          {
            type: "conformance.happened",
            aggregateId: "only-event",
            payload: {},
          },
        ]);
      });

      it("unitOfWork#19 集約 X がある。別のスコープの save で X の版が進んでいる / fn の中で古い版の X を save し、下書きを collectEvents に渡す", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const stale = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(stale.entity),
            stale.expectedVersion,
          );
        });
        const current = await getAccount(h, X.id);
        await expect(
          h.uow.run(async ({ accountRepository, collectEvents }) => {
            await accountRepository.save(
              Account.markReferenced(stale.entity),
              stale.expectedVersion,
            );
            collectEvents([testDraft(X.id)]);
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await getAccount(h, X.id)).toEqual(current);
        expect(await h.savedEvents()).toEqual([]);
      });

      it("unitOfWork#20 コミットしたスコープが保存したドメインイベント / コミットの直後に、保存されたドメインイベントを確かめる", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await h.uow.run(async ({ accountRepository, collectEvents }) => {
          await accountRepository.insert(X);
          collectEvents([testDraft(X.id)]);
        });
        expect(await h.savedEvents()).toHaveLength(1);
      });
    });

    describe("スコープの独立", () => {
      it("unitOfWork#21 集約 X・Y がない / 1つ目の run で X を insert してコミットし、その完了の後に、2つ目の run で Y を insert して例外を投げる", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const X = next();
        const Y = next();
        await insertAccounts(h, X);
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.insert(Y);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect((await findAccount(h, X.id))?.entity).toEqual(X);
        expect(await findAccount(h, Y.id)).toBeNull();
      });

      it("unitOfWork#22 集約 X・Y がない / 1つ目の run で X を insert して例外を投げ、その完了の後に、2つ目の run で Y を insert してコミットする", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const X = next();
        const Y = next();
        await expect(
          h.uow.run(async ({ accountRepository, collectEvents }) => {
            await accountRepository.insert(X);
            collectEvents([testDraft(X.id)]);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        await insertAccounts(h, Y);
        expect(await findAccount(h, X.id)).toBeNull();
        expect((await findAccount(h, Y.id))?.entity).toEqual(Y);
        expect(await h.savedEvents()).toEqual([]);
      });

      it("unitOfWork#23 集約 X・Y がない / X を insert してコミットする run と、Y を insert して例外を投げる run を、同時に実行する", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const X = next();
        const Y = next();
        const [committed, aborted] = await Promise.allSettled([
          h.uow.run(async ({ accountRepository, collectEvents }) => {
            await accountRepository.insert(X);
            await accountRepository.findById(X.id);
            collectEvents([testDraft(X.id)]);
          }),
          h.uow.run(async ({ accountRepository, collectEvents }) => {
            await accountRepository.insert(Y);
            await accountRepository.findById(Y.id);
            collectEvents([testDraft(Y.id)]);
            throw new ScopeAbort();
          }),
        ]);
        expect(committed.status).toBe("fulfilled");
        expect(aborted.status).toBe("rejected");
        expect((await findAccount(h, X.id))?.entity).toEqual(X);
        expect(await findAccount(h, Y.id)).toBeNull();
        expect(
          (await h.savedEvents()).map((event) => event.aggregateId),
        ).toEqual([X.id]);
      });
    });

    describe("スコープ内の読み取り", () => {
      it("unitOfWork#24 集約 X がない / fn の中で X を insert し、同じスコープの中で X を findById し、値を返す", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.insert(X);
          await accountRepository.findById(X.id);
        });
        expect((await findAccount(h, X.id))?.entity).toEqual(X);
      });

      it("unitOfWork#25 集約 X がある / fn の中で X を save し、同じスコープの中で X を findById し、値を返す", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const x = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(x.entity),
            x.expectedVersion,
          );
          await accountRepository.findById(X.id);
        });
        expect((await getAccount(h, X.id)).entity).toEqual(
          Account.markReferenced(X),
        );
      });

      it("unitOfWork#26 集約 X・Y がある / fn の中で、X と Y の findById をすべて終えてから、X と Y を save する", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const X = next();
        const Y = next();
        await insertAccounts(h, X, Y);
        await h.uow.run(async ({ accountRepository }) => {
          const [x, y] = await Promise.all([
            accountRepository.findById(X.id),
            accountRepository.findById(Y.id),
          ]);
          if (x === null || y === null) throw new Error("missing");
          await accountRepository.save(
            Account.markReferenced(x.entity),
            x.expectedVersion,
          );
          await accountRepository.save(
            Account.markReferenced(y.entity),
            y.expectedVersion,
          );
        });
        expect((await getAccount(h, X.id)).entity).toEqual(
          Account.markReferenced(X),
        );
        expect((await getAccount(h, Y.id)).entity).toEqual(
          Account.markReferenced(Y),
        );
      });

      it("unitOfWork#27 集約 X がある。それより前の run が X を save してコミットした / fn の中で X を findById し、値を返す（書き込まない）", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const x = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(x.entity),
            x.expectedVersion,
          );
        });
        const latest = await h.uow.run(async ({ accountRepository }) =>
          accountRepository.findById(X.id),
        );
        expect(latest?.entity).toEqual(Account.markReferenced(X));
      });

      it("unitOfWork#28 集約 X・Y がある / スコープ A の中で X を読み、A が返す前に別の run が Y を save してコミットし、A の中で Y を読む", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const X = next();
        const Y = next();
        await insertAccounts(h, X, Y);
        const y = await getAccount(h, Y.id);
        let xRead!: () => void;
        const xWasRead = new Promise<void>((resolve) => {
          xRead = resolve;
        });
        let resume!: () => void;
        const resumed = new Promise<void>((resolve) => {
          resume = resolve;
        });
        const scopeA = h.uow.run(async ({ accountRepository }) => {
          await accountRepository.findById(X.id);
          xRead();
          await resumed;
          const seen = await accountRepository.findById(Y.id);
          return seen?.entity.id;
        });
        await xWasRead;
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(y.entity),
            y.expectedVersion,
          );
        });
        resume();
        expect(await scopeA).toBe(Y.id);
        expect((await getAccount(h, Y.id)).entity).toEqual(
          Account.markReferenced(Y),
        );
      });
    });

    describe("楽観ロックの競合と一意性の違反", () => {
      it("unitOfWork#29 集約 X がある。スコープ A と B が、X の同じ版を読んだ / A が X を save してコミットし、その後に B が X を save して値を返す", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const read = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(read.entity),
            read.expectedVersion,
          );
        });
        const afterA = await getAccount(h, X.id);
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.save(
              Account.markReferenced(read.entity),
              read.expectedVersion,
            );
            return "B";
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await getAccount(h, X.id)).toEqual(afterA);
      });

      it("unitOfWork#30 集約 X・Y がある。スコープ B が読んだ後に、X の版が別のスコープで進んだ / B が Y を save し、古い版で X を save して、値を返す", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const X = next();
        const Y = next();
        await insertAccounts(h, X, Y);
        const x = await getAccount(h, X.id);
        const y = await getAccount(h, Y.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(x.entity),
            x.expectedVersion,
          );
        });
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.save(
              Account.markReferenced(y.entity),
              y.expectedVersion,
            );
            await accountRepository.save(
              Account.markReferenced(x.entity),
              x.expectedVersion,
            );
            return "B";
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await getAccount(h, Y.id)).toEqual(y);
      });

      it("unitOfWork#31 集約 X がある / X の同じ版を読んだ2つの run を同時に実行し、どちらも X を save する", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const scope = () =>
          h.uow.run(async ({ accountRepository }) => {
            const found = await accountRepository.findById(X.id);
            if (found === null) throw new Error("missing");
            await accountRepository.save(
              Account.markReferenced(found.entity),
              found.expectedVersion,
            );
          });
        const results = await Promise.allSettled([scope(), scope()]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        expect((await getAccount(h, X.id)).entity).toEqual(
          Account.markReferenced(X),
        );
      });

      it("unitOfWork#32 集約 X がない。集約 Y がある / 同じ ID の X を insert する2つの run を同時に実行する。片方は、その前に Y も save する", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const X = next();
        const Y = next();
        await insertAccounts(h, Y);
        const y = await getAccount(h, Y.id);
        const results = await Promise.allSettled([
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.findById(X.id);
            await accountRepository.insert(X);
          }),
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.findById(X.id);
            await accountRepository.save(
              Account.markReferenced(y.entity),
              y.expectedVersion,
            );
            await accountRepository.insert(X);
          }),
        ]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        expect((await findAccount(h, X.id))?.entity).toEqual(X);
        const yAfter = await getAccount(h, Y.id);
        if (results[1]?.status === "rejected") {
          expect(yAfter).toEqual(y);
        } else {
          expect(yAfter.entity).toEqual(Account.markReferenced(Y));
        }
      });

      it("unitOfWork#33 集約 X がある / fn の中で、X と同じ ID の集約を insert して、値を返す", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            await accountRepository.insert(X);
            return "returned";
          }),
        ).rejects.toBeInstanceOf(ConflictError);
      });

      it("unitOfWork#34 同じメールアドレスのアカウントは1つ。集約 Y がある / 同じメールアドレスで ID の違うアカウント2件を、別々の run で insert する。後の run は、その前に Y を save し、下書きを collectEvents に渡す", async () => {
        const h = await makeHarness();
        const next = accountFactory();
        const first = next();
        const Y = next();
        const sameEmail = Account.register({
          id: next().id,
          email: first.email,
        });
        await insertAccounts(h, first, Y);
        const y = await getAccount(h, Y.id);
        await expect(
          h.uow.run(async ({ accountRepository, collectEvents }) => {
            await accountRepository.save(
              Account.markReferenced(y.entity),
              y.expectedVersion,
            );
            collectEvents([testDraft(Y.id)]);
            await accountRepository.insert(sameEmail);
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await getAccount(h, Y.id)).toEqual(y);
        expect(await findAccount(h, sameEmail.id)).toBeNull();
        expect(await h.savedEvents()).toEqual([]);
      });
    });

    describe("再試行しない", () => {
      it("unitOfWork#35 楽観ロックの競合で拒否される run / fn が呼ばれた回数を数える", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const stale = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(stale.entity),
            stale.expectedVersion,
          );
        });
        let calls = 0;
        await expect(
          h.uow.run(async ({ accountRepository }) => {
            calls += 1;
            await accountRepository.save(
              Account.markReferenced(stale.entity),
              stale.expectedVersion,
            );
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(calls).toBe(1);
      });

      it("unitOfWork#36 楽観ロックの競合で拒否された run / 呼び出し側が、X を読み直して、同じ変更の run をもう一度実行する", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const stale = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(stale.entity),
            stale.expectedVersion,
          );
        });
        const change = (read: typeof stale) =>
          h.uow.run(async ({ accountRepository, collectEvents }) => {
            await accountRepository.save(
              Account.markReferenced(read.entity),
              read.expectedVersion,
            );
            collectEvents([testDraft(X.id, { retry: true })]);
          });
        await expect(change(stale)).rejects.toBeInstanceOf(ConflictError);
        const reread = await getAccount(h, X.id);
        await change(reread);
        expect((await getAccount(h, X.id)).entity).toEqual(
          Account.markReferenced(reread.entity),
        );
        expect(await h.savedEvents()).toHaveLength(1);
      });
    });

    describe("コミットの後の読み取り", () => {
      it("unitOfWork#37 X を insert した run が解決した / 解決の直後に、新しい run の中で findById する", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        expect((await findAccount(h, X.id))?.entity).toEqual(X);
      });

      it("unitOfWork#38 X を save した run が解決した / 解決の直後に findById し、返された expectedVersion で次の run の中で save する", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const first = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(first.entity),
            first.expectedVersion,
          );
        });
        const second = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.save(
            Account.markReferenced(second.entity),
            second.expectedVersion,
          );
        });
        expect((await getAccount(h, X.id)).entity).toEqual(
          Account.markReferenced(Account.markReferenced(X)),
        );
      });

      it("unitOfWork#39 X を delete した run が解決した / 解決の直後に、新しい run の中で findById する", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const x = await getAccount(h, X.id);
        await h.uow.run(async ({ accountRepository }) => {
          await accountRepository.delete(X.id, x.expectedVersion);
        });
        expect(await findAccount(h, X.id)).toBeNull();
      });

      it("unitOfWork#40 X を insert した run が解決した / 解決の直後に、新しい run の中で、X を含むはずの一覧の問い合わせを読む", async () => {
        const h = await makeHarness();
        const X = accountFactory()();
        await insertAccounts(h, X);
        const listed = await h.uow.run(({ accountRepository }) =>
          accountRepository.findByIds([X.id]),
        );
        expect(listed).toEqual([X]);
      });
    });
  });
}
