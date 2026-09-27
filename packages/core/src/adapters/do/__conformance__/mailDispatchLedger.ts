import { Account } from "@repo/core/domain/account/entity";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { notificationIds } from "@repo/core/domain/notification/__tests__/samples";
import {
  type MailKey,
  OccurrenceKey,
} from "@repo/core/domain/notification/occurrenceKey";
import { describe, expect, it } from "vitest";
import { expectBusinessRuleError } from "./assertions";
import { ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";

const K = (n: number): OccurrenceKey =>
  OccurrenceKey.create(`occurrence|content:conformance-${n}|{}`);
const M = (n: number): EmailAddress =>
  EmailAddress.create(`mail${n}@example.com`);
const key = (k: number, m: number): MailKey => ({
  occurrenceKey: K(k),
  to: M(m),
});

function record(h: ConformanceHarness, ...keys: readonly MailKey[]) {
  return h.uow.run(async ({ mailDispatchLedger }) => {
    for (const k of keys) await mailDispatchLedger.record(k);
  });
}

function dispatched(h: ConformanceHarness, keys: readonly MailKey[]) {
  return h.uow.run(({ mailDispatchLedger }) =>
    mailDispatchLedger.findDispatched(keys),
  );
}

const sortKeys = (keys: readonly MailKey[]) =>
  [...keys].sort((a, b) =>
    `${a.occurrenceKey} ${a.to}` < `${b.occurrenceKey} ${b.to}` ? -1 : 1,
  );

/** `spec/testcases/ports/mailDispatchLedger.md`. */
export function describeMailDispatchLedgerContract(
  makeHarness: HarnessFactory,
): void {
  describe("MailDispatchLedger contract", () => {
    describe("record と findDispatched", () => {
      it("mailDispatchLedger#1 記録がない / キー（K1、M1）を findDispatched に渡す", async () => {
        const h = await makeHarness();
        expect(await dispatched(h, [key(1, 1)])).toEqual([]);
      });

      it("mailDispatchLedger#2 記録がない / （K1、M1）を record してコミットし、（K1、M1）を findDispatched に渡す", async () => {
        const h = await makeHarness();
        await record(h, key(1, 1));
        expect(await dispatched(h, [key(1, 1)])).toEqual([key(1, 1)]);
      });

      it("mailDispatchLedger#3 （K1、M1）の記録がある / （K1、M1）をもう一度 record する", async () => {
        const h = await makeHarness();
        await record(h, key(1, 1));
        await expect(record(h, key(1, 1))).resolves.toBeUndefined();
        expect(await dispatched(h, [key(1, 1), key(1, 1)])).toEqual([
          key(1, 1),
        ]);
      });

      it("mailDispatchLedger#4 記録がない / （K1、M1）の record を、2つの UnitOfWork で同時に行う", async () => {
        const h = await makeHarness();
        const results = await Promise.allSettled([
          record(h, key(1, 1)),
          record(h, key(1, 1)),
        ]);
        expect(results.map((r) => r.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        expect(await dispatched(h, [key(1, 1)])).toEqual([key(1, 1)]);
      });

      it("mailDispatchLedger#5 （K1、M1）の記録がある / （K1、M2）、（K2、M1）、（K1、M1）を findDispatched に渡す", async () => {
        const h = await makeHarness();
        await record(h, key(1, 1));
        expect(await dispatched(h, [key(1, 2), key(2, 1), key(1, 1)])).toEqual([
          key(1, 1),
        ]);
      });

      it("mailDispatchLedger#6 記録がある / 空の keys で findDispatched を呼ぶ", async () => {
        const h = await makeHarness();
        await record(h, key(1, 1));
        expect(await dispatched(h, [])).toEqual([]);
      });

      it("mailDispatchLedger#7 記録のあるキーが100件 / 100件のキーで findDispatched を呼ぶ", async () => {
        const h = await makeHarness();
        const keys = Array.from({ length: 100 }, (_, i) => key(i, i % 7));
        await record(h, ...keys);
        expect(sortKeys(await dispatched(h, keys))).toEqual(sortKeys(keys));
      });

      it("mailDispatchLedger#8 — / 101件のキーで findDispatched を呼ぶ", async () => {
        const h = await makeHarness();
        await expectBusinessRuleError(
          dispatched(
            h,
            Array.from({ length: 101 }, (_, i) => key(i, 1)),
          ),
          CommonErrorCode.InvalidInput,
        );
      });

      it("mailDispatchLedger#9 アカウント A のメールアドレス M1 について、（K1、M1）の記録がある / A を AccountRepository.delete で削除してコミットし、（K1、M1）を findDispatched に渡す", async () => {
        const h = await makeHarness();
        const A = Account.register({
          id: notificationIds(0x33_0000).raw(),
          email: M(1),
        });
        await h.uow.run(({ accountRepository }) => accountRepository.insert(A));
        await record(h, key(1, 1));
        await h.uow.run(async ({ accountRepository }) => {
          const found = await accountRepository.findById(A.id);
          if (found === null) throw new Error("missing account");
          await accountRepository.delete(A.id, found.expectedVersion);
        });
        expect(await dispatched(h, [key(1, 1)])).toEqual([key(1, 1)]);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("mailDispatchLedger#10 記録がない / UnitOfWork の中で（K1、M1）を record してコミットし、直後に findDispatched を呼ぶ", async () => {
        const h = await makeHarness();
        await h.uow.run(({ mailDispatchLedger }) =>
          mailDispatchLedger.record(key(1, 1)),
        );
        expect(await dispatched(h, [key(1, 1)])).toEqual([key(1, 1)]);
      });

      it("mailDispatchLedger#11 記録がない / UnitOfWork の中で（K1、M1）を record した後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        await expect(
          h.uow.run(async ({ mailDispatchLedger }) => {
            await mailDispatchLedger.record(key(1, 1));
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await dispatched(h, [key(1, 1)])).toEqual([]);
      });
    });
  });
}
