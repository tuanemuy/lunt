import {
  applicationIds,
  submitted,
  targets,
} from "@repo/core/domain/application/__tests__/fixtures";
import { ApplicationEvents } from "@repo/core/domain/application/events";
import type { OverdueNotice } from "@repo/core/domain/application/overdueNotice";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import {
  type ApplicationHarness,
  type ApplicationHarnessFactory,
  getApplication,
  insertApplications,
  saveApplication,
  steps,
} from "./applicationFixtures";
import { expectBusinessRuleError } from "./assertions";
import { barrier, ScopeAbort } from "./fixtures";

const T1 = new Date("2026-09-10T00:00:00.000Z");
const T2 = new Date("2026-09-11T00:00:00.000Z");

const notice = (
  applicationId: ApplicationId,
  pendingSince: Date,
): OverdueNotice => ({ applicationId, pendingSince });

function findNotices(
  h: ApplicationHarness,
  ids: readonly ApplicationId[],
): Promise<readonly OverdueNotice[]> {
  return h.run(({ overdueNoticeLedger }) =>
    overdueNoticeLedger.findByApplicationIds(ids),
  );
}

async function record(
  h: ApplicationHarness,
  ...notices: readonly OverdueNotice[]
): Promise<void> {
  await h.run(async ({ overdueNoticeLedger }) => {
    for (const n of notices) await overdueNoticeLedger.record(n);
  });
}

const byId = (notices: readonly OverdueNotice[]) =>
  [...notices].sort((a, b) => (a.applicationId < b.applicationId ? -1 : 1));

/** Stored applications a1…a`n` (the ledger only reports existing ones). */
async function storedApplications(
  h: ApplicationHarness,
  n: number,
): Promise<readonly ApplicationId[]> {
  const ids = applicationIds();
  const x = ids.region();
  const apps = Array.from({ length: n }, () =>
    submitted(ids, targets.affiliation(ids.place(), x)),
  );
  await insertApplications(h, ...apps);
  return apps.map((app) => app.id);
}

/** `spec/testcases/ports/overdueNoticeLedger.md`. */
export function describeOverdueNoticeLedgerContract(
  makeHarness: ApplicationHarnessFactory,
): void {
  describe("OverdueNoticeLedger contract", () => {
    describe("findByApplicationIds", () => {
      it("overdueNoticeLedger#1 記録がない / a1 で呼ぶ", async () => {
        const h = await makeHarness();
        const [a1] = await storedApplications(h, 1);
        if (a1 === undefined) throw new Error("missing");
        expect(await findNotices(h, [a1])).toEqual([]);
      });

      it("overdueNoticeLedger#2 a1 に pendingSince が t1 の記録、a2 に pendingSince が t2 の記録がある。a3 に記録はない / a1・a2・a3 で呼ぶ", async () => {
        const h = await makeHarness();
        const [a1, a2, a3] = await storedApplications(h, 3);
        if (a1 === undefined || a2 === undefined || a3 === undefined) {
          throw new Error("missing");
        }
        await record(h, notice(a1, T1), notice(a2, T2));
        expect(byId(await findNotices(h, [a1, a2, a3]))).toEqual([
          notice(a1, T1),
          notice(a2, T2),
        ]);
      });

      it("overdueNoticeLedger#3 a1 に記録がある / 空の配列で呼ぶ", async () => {
        const h = await makeHarness();
        const [a1] = await storedApplications(h, 1);
        if (a1 === undefined) throw new Error("missing");
        await record(h, notice(a1, T1));
        expect(await findNotices(h, [])).toEqual([]);
      });

      it("overdueNoticeLedger#4 100件の申請 ID に記録がある / 100件の ID で呼ぶ", async () => {
        const h = await makeHarness();
        const all = await storedApplications(h, 100);
        await record(h, ...all.map((id) => notice(id, T1)));
        expect(byId(await findNotices(h, all))).toEqual(
          byId(all.map((id) => notice(id, T1))),
        );
      });

      it("overdueNoticeLedger#5 a9 の記録を record した（下の「record」） / a9 で呼ぶ", async () => {
        const h = await makeHarness();
        const a9 = applicationIds().application();
        await record(h, notice(a9, T1));
        expect(await findNotices(h, [a9])).toEqual([]);
      });

      it("overdueNoticeLedger#6 — / 101件の ID で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        await expectBusinessRuleError(
          findNotices(
            h,
            Array.from({ length: 101 }, () => ids.application()),
          ),
          "COMMON_INVALID_INPUT",
        );
      });
    });

    describe("record", () => {
      it("overdueNoticeLedger#7 a1 に記録がない / { applicationId: a1; pendingSince: t1 } を record してコミットし、a1 で findByApplicationIds を呼ぶ", async () => {
        const h = await makeHarness();
        const [a1] = await storedApplications(h, 1);
        if (a1 === undefined) throw new Error("missing");
        await record(h, notice(a1, T1));
        expect(await findNotices(h, [a1])).toEqual([notice(a1, T1)]);
      });

      it("overdueNoticeLedger#8 a9 の申請は保存されていない / { applicationId: a9; pendingSince: t1 } を record してコミットする", async () => {
        const h = await makeHarness();
        await expect(
          record(h, notice(applicationIds().application(), T1)),
        ).resolves.toBeUndefined();
      });

      it("overdueNoticeLedger#9 a1 に pendingSince が t1 の記録がある / { applicationId: a1; pendingSince: t2 } を record してコミットし、a1 で呼ぶ", async () => {
        const h = await makeHarness();
        const [a1] = await storedApplications(h, 1);
        if (a1 === undefined) throw new Error("missing");
        await record(h, notice(a1, T1));
        await record(h, notice(a1, T2));
        expect(await findNotices(h, [a1])).toEqual([notice(a1, T2)]);
      });

      it("overdueNoticeLedger#10 a1 に pendingSince が t2 の記録がある / pendingSince が t1 の記録を record してコミットし、a1 で呼ぶ", async () => {
        const h = await makeHarness();
        const [a1] = await storedApplications(h, 1);
        if (a1 === undefined) throw new Error("missing");
        await record(h, notice(a1, T2));
        await record(h, notice(a1, T1));
        expect(await findNotices(h, [a1])).toEqual([notice(a1, T1)]);
      });

      it("overdueNoticeLedger#11 申請 a1 が ApplicationRepository に版 v で保存されている / a1 の記録を record してコミットし、ApplicationRepository.findById で a1 を読む", async () => {
        const h = await makeHarness();
        const [a1] = await storedApplications(h, 1);
        if (a1 === undefined) throw new Error("missing");
        const before = await getApplication(h, a1);
        await record(h, notice(a1, T1));
        const after = await getApplication(h, a1);
        expect(after.entity.version).toBe(before.entity.version);
        expect(after.expectedVersion).toBe(before.expectedVersion);
        await saveApplication(
          h,
          steps.withdrawn(T2)(before.entity),
          before.expectedVersion,
        );
        expect((await getApplication(h, a1)).entity.status).toEqual({
          kind: "withdrawn",
        });
      });

      it("overdueNoticeLedger#12 a1 に記録がない / 2つの UnitOfWork が、a1 の記録を同時に record する", async () => {
        const h = await makeHarness();
        const [a1] = await storedApplications(h, 1);
        if (a1 === undefined) throw new Error("missing");
        const bothRead = barrier(2);
        const attempt = (pendingSince: Date) =>
          h.run(async ({ overdueNoticeLedger }) => {
            expect(
              await overdueNoticeLedger.findByApplicationIds([a1]),
            ).toEqual([]);
            await bothRead();
            await overdueNoticeLedger.record(notice(a1, pendingSince));
          });
        const results = await Promise.allSettled([attempt(T1), attempt(T2)]);
        expect(results.map((r) => r.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        const found = await findNotices(h, [a1]);
        expect(found).toHaveLength(1);
        expect([T1, T2]).toContainEqual(found[0]?.pendingSince);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("overdueNoticeLedger#13 a1 に記録がない / UnitOfWork の中で a1 の記録を record してコミットし、直後に a1 で呼ぶ", async () => {
        const h = await makeHarness();
        const [a1] = await storedApplications(h, 1);
        if (a1 === undefined) throw new Error("missing");
        await h.run(({ overdueNoticeLedger }) =>
          overdueNoticeLedger.record(notice(a1, T1)),
        );
        expect(await findNotices(h, [a1])).toEqual([notice(a1, T1)]);
      });

      it("overdueNoticeLedger#14 a1 に記録がない / UnitOfWork の中で a1 の記録を record した後に、fn が例外を投げる。その後に a1 で呼ぶ", async () => {
        const h = await makeHarness();
        const [a1] = await storedApplications(h, 1);
        if (a1 === undefined) throw new Error("missing");
        await expect(
          h.run(async ({ overdueNoticeLedger }) => {
            await overdueNoticeLedger.record(notice(a1, T1));
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await findNotices(h, [a1])).toEqual([]);
      });

      it("overdueNoticeLedger#15 a1 に pendingSince が t1 の記録がある / UnitOfWork の中で、pendingSince が t2 の記録を record した後に、fn が例外を投げる。その後に a1 で呼ぶ", async () => {
        const h = await makeHarness();
        const [a1] = await storedApplications(h, 1);
        if (a1 === undefined) throw new Error("missing");
        await record(h, notice(a1, T1));
        await expect(
          h.run(async ({ overdueNoticeLedger }) => {
            await overdueNoticeLedger.record(notice(a1, T2));
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await findNotices(h, [a1])).toEqual([notice(a1, T1)]);
      });

      it("overdueNoticeLedger#16 a1 に記録がない / UnitOfWork の中で、record と collectEvents（application.review_period_elapsed）を行った後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const [a1] = await storedApplications(h, 1);
        if (a1 === undefined) throw new Error("missing");
        await expect(
          h.run(async ({ overdueNoticeLedger, collectEvents }) => {
            await overdueNoticeLedger.record(notice(a1, T1));
            collectEvents([ApplicationEvents.reviewPeriodElapsed(a1, T1, T2)]);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await findNotices(h, [a1])).toEqual([]);
        expect(await h.savedEvents()).toEqual([]);
      });
    });
  });
}
