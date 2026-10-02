import { ConflictError } from "@repo/core/application/errors";
import {
  type OperatorRoster,
  RoleRoster,
} from "@repo/core/domain/authority/roleRoster";
import type { Appointee } from "@repo/core/domain/authority/stewardship";
import { describe, expect, it } from "vitest";
import {
  authorityIds,
  findRolesOf,
  findRoster,
  saveRoster,
} from "./authorityFixtures";
import { barrier, ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";

const holderIds = (roster: RoleRoster) =>
  RoleRoster.holders(roster).map((holder) => holder.accountId);

/** Stores the operator roster holding `holders` (the first establishes it). */
async function storeOperators(
  h: ConformanceHarness,
  now: () => Date,
  ...holders: readonly Appointee[]
): Promise<OperatorRoster> {
  const read = await findRoster(h, "operator");
  const [first, ...rest] = holders;
  if (first === undefined) throw new Error("at least one operator");
  let roster: RoleRoster = RoleRoster.establishOperators(
    read.entity,
    first.accountId,
    now(),
  ).entity;
  for (const holder of rest) {
    roster = RoleRoster.grant(roster, holder.accountId, now()).entity;
  }
  await saveRoster(h, roster, read.expectedVersion);
  return roster as OperatorRoster;
}

async function storeEditors(
  h: ConformanceHarness,
  now: () => Date,
  ...holders: readonly Appointee[]
): Promise<RoleRoster> {
  const read = await findRoster(h, "editor");
  let roster: RoleRoster = read.entity;
  for (const holder of holders) {
    roster = RoleRoster.grant(roster, holder.accountId, now()).entity;
  }
  await saveRoster(h, roster, read.expectedVersion);
  return roster;
}

/** `spec/testcases/ports/roleRosterRepository.md`. */
export function describeRoleRosterRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("RoleRosterRepository contract", () => {
    describe("find、save", () => {
      it('roleRosterRepository#1 空 / find("operator")', async () => {
        const h = await makeHarness();
        const found = await findRoster(h, "operator");
        expect(found.entity).toEqual(RoleRoster.initial("operator"));
        expect(typeof found.expectedVersion).toBe("number");
      });

      it('roleRosterRepository#2 空 / find("editor")', async () => {
        const h = await makeHarness();
        const found = await findRoster(h, "editor");
        expect(found.entity).toEqual(RoleRoster.initial("editor"));
        expect(typeof found.expectedVersion).toBe("number");
      });

      it('roleRosterRepository#3 空 / find("operator") の expectedVersion で、A だけを持ち主に持つ established の名簿を save し、find("operator")', async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const before = await findRoster(h, "operator");
        const saved = await storeOperators(h, ids.tick, A);
        const after = await findRoster(h, "operator");
        expect(after.entity).toEqual(saved);
        expect(after.entity.status).toBe("established");
        expect(RoleRoster.holders(after.entity)).toEqual(
          RoleRoster.holders(saved),
        );
        expect(after.expectedVersion).not.toBe(before.expectedVersion);
      });

      it('roleRosterRepository#4 空 / find("editor") の expectedVersion で、A、B（付与の古い順）を持ち主に持つ名簿を save し、find("editor")', async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        const saved = await storeEditors(h, ids.tick, A, B);
        const after = await findRoster(h, "editor");
        expect(after.entity).toEqual(saved);
        expect(holderIds(after.entity)).toEqual([A.accountId, B.accountId]);
      });

      it("roleRosterRepository#5 operator の名簿が保存されている / まだ保存がないことを表す expectedVersion で、operator の名簿を save", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const unsaved = await findRoster(h, "operator");
        const saved = await storeOperators(h, ids.tick, ids.person());
        await expect(
          saveRoster(
            h,
            RoleRoster.establishOperators(
              unsaved.entity,
              ids.person().accountId,
              ids.tick(),
            ).entity,
            unsaved.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await findRoster(h, "operator")).entity).toEqual(saved);
      });

      it("roleRosterRepository#6 空 / まだ保存がないことを表す expectedVersion での operator の名簿の save を、別々の UnitOfWork で同時に2つ実行する", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const bothRead = barrier(2);
        const attempt = (first: Appointee) =>
          h.uow.run(async ({ roleRosterRepository }) => {
            const read = await roleRosterRepository.find("operator");
            await bothRead();
            await roleRosterRepository.save(
              RoleRoster.establishOperators(
                read.entity,
                first.accountId,
                ids.tick(),
              ).entity,
              read.expectedVersion,
            );
          });
        const results = await Promise.allSettled([
          attempt(ids.person()),
          attempt(ids.person()),
        ]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        expect(
          RoleRoster.holders((await findRoster(h, "operator")).entity),
        ).toHaveLength(1);
      });

      it("roleRosterRepository#7 editor の名簿が保存されている。expectedVersion V を得た後、別の save が成功している / V で save", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        await storeEditors(h, ids.tick, ids.person());
        const v = await findRoster(h, "editor");
        const first = RoleRoster.grant(
          v.entity,
          ids.person().accountId,
          ids.tick(),
        ).entity;
        await saveRoster(h, first, v.expectedVersion);
        await expect(
          saveRoster(
            h,
            RoleRoster.grant(v.entity, ids.person().accountId, ids.tick())
              .entity,
            v.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await findRoster(h, "editor")).entity).toEqual(first);
      });

      it("roleRosterRepository#8 持ち主 A、B の operator の名簿が保存されている / 同じ expectedVersion で、A を取り除いた名簿の save と、B を取り除いた名簿の save を、別々の UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        await storeOperators(h, ids.tick, A, B);
        const v = await findRoster(h, "operator");
        const without = (who: Appointee) =>
          RoleRoster.removeHolder(
            v.entity,
            who.accountId,
            "revoked",
            ids.tick(),
          ).entity;
        const results = await Promise.allSettled([
          saveRoster(h, without(A), v.expectedVersion),
          saveRoster(h, without(B), v.expectedVersion),
        ]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        expect(
          RoleRoster.holders((await findRoster(h, "operator")).entity),
        ).toHaveLength(1);
      });

      it('roleRosterRepository#9 持ち主 A の editor の名簿が保存されている / A を取り除いた名簿（持ち主が0人）を save し、find("editor")', async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const unsaved = await findRoster(h, "editor");
        await storeEditors(h, ids.tick, A);
        const v = await findRoster(h, "editor");
        const emptied = RoleRoster.removeHolder(
          v.entity,
          A.accountId,
          "revoked",
          ids.tick(),
        ).entity;
        await saveRoster(h, emptied, v.expectedVersion);
        const after = await findRoster(h, "editor");
        expect(after.entity).toEqual(emptied);
        expect(RoleRoster.holders(after.entity)).toEqual([]);
        const next = RoleRoster.grant(
          after.entity,
          ids.person().accountId,
          ids.tick(),
        ).entity;
        await expect(
          saveRoster(h, next, unsaved.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        await saveRoster(h, next, after.expectedVersion);
        expect((await findRoster(h, "editor")).entity).toEqual(next);
      });

      it('roleRosterRepository#10 operator の名簿が保存されている。editor の名簿は保存されていない / find("editor")', async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const unsaved = await findRoster(h, "editor");
        await storeOperators(h, ids.tick, ids.person());
        const found = await findRoster(h, "editor");
        expect(found.entity).toEqual(RoleRoster.initial("editor"));
        expect(found.expectedVersion).toBe(unsaved.expectedVersion);
        const first = RoleRoster.grant(
          found.entity,
          ids.person().accountId,
          ids.tick(),
        ).entity;
        await saveRoster(h, first, found.expectedVersion);
        expect((await findRoster(h, "editor")).entity).toEqual(first);
      });

      it("roleRosterRepository#11 operator と editor の名簿が保存されている。operator の expectedVersion V を得ている / editor の名簿を save した後、V で operator の名簿を save", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        await storeOperators(h, ids.tick, ids.person());
        await storeEditors(h, ids.tick, ids.person());
        const v = await findRoster(h, "operator");
        const editors = await findRoster(h, "editor");
        await saveRoster(
          h,
          RoleRoster.grant(editors.entity, ids.person().accountId, ids.tick())
            .entity,
          editors.expectedVersion,
        );
        const operators = RoleRoster.grant(
          v.entity,
          ids.person().accountId,
          ids.tick(),
        ).entity;
        await saveRoster(h, operators, v.expectedVersion);
        expect((await findRoster(h, "operator")).entity).toEqual(operators);
      });
    });

    describe("findRolesOf", () => {
      it("roleRosterRepository#12 空 / findRolesOf(A)", async () => {
        const h = await makeHarness();
        expect(await findRolesOf(h, authorityIds().person().accountId)).toEqual(
          new Set(),
        );
      });

      it("roleRosterRepository#13 持ち主 A の editor の名簿が保存されている / findRolesOf(A)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        await storeEditors(h, ids.tick, A);
        expect(await findRolesOf(h, A.accountId)).toEqual(new Set(["editor"]));
      });

      it("roleRosterRepository#14 A は editor と operator の両方の名簿の持ち主 / findRolesOf(A)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        await storeEditors(h, ids.tick, A);
        await storeOperators(h, ids.tick, A);
        expect(await findRolesOf(h, A.accountId)).toEqual(
          new Set(["editor", "operator"]),
        );
      });

      it("roleRosterRepository#15 持ち主 A の operator の名簿が保存されている / findRolesOf(B)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        await storeOperators(h, ids.tick, A);
        expect(await findRolesOf(h, B.accountId)).toEqual(new Set());
      });

      it("roleRosterRepository#16 持ち主 A、B の operator の名簿から、A を取り除いて save 済み / findRolesOf(A)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        await storeOperators(h, ids.tick, A, B);
        const v = await findRoster(h, "operator");
        await saveRoster(
          h,
          RoleRoster.removeHolder(v.entity, A.accountId, "revoked", ids.tick())
            .entity,
          v.expectedVersion,
        );
        expect(await findRolesOf(h, A.accountId)).toEqual(new Set());
        expect(await findRolesOf(h, B.accountId)).toEqual(
          new Set(["operator"]),
        );
      });
    });

    describe("可視性と UnitOfWork", () => {
      it('roleRosterRepository#17 持ち主 A の operator の名簿が保存されている / UnitOfWork の中で B を加えた名簿を save してコミットし、直後に別の UnitOfWork で find("operator") と findRolesOf(B)', async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        await storeOperators(h, ids.tick, A);
        await h.uow.run(async ({ roleRosterRepository }) => {
          const read = await roleRosterRepository.find("operator");
          await roleRosterRepository.save(
            RoleRoster.grant(read.entity, B.accountId, ids.tick()).entity,
            read.expectedVersion,
          );
        });
        const [roster, roles] = await h.uow.run(
          async ({ roleRosterRepository }) =>
            Promise.all([
              roleRosterRepository.find("operator"),
              roleRosterRepository.findRolesOf(B.accountId),
            ]),
        );
        expect(holderIds(roster.entity)).toEqual([A.accountId, B.accountId]);
        expect(roles).toEqual(new Set(["operator"]));
      });

      it("roleRosterRepository#18 持ち主 A の operator の名簿が保存されている / UnitOfWork の中で B を加えた名簿を save し、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        await storeOperators(h, ids.tick, A);
        const before = await findRoster(h, "operator");
        await expect(
          h.uow.run(async ({ roleRosterRepository }) => {
            await roleRosterRepository.save(
              RoleRoster.grant(before.entity, B.accountId, ids.tick()).entity,
              before.expectedVersion,
            );
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await findRoster(h, "operator")).toEqual(before);
        expect(holderIds(before.entity)).toEqual([A.accountId]);
        expect(await findRolesOf(h, B.accountId)).toEqual(new Set());
      });

      it("roleRosterRepository#19 空 / UnitOfWork の中で、まだ保存がないことを表す expectedVersion で operator の名簿を save し、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const unsaved = await findRoster(h, "operator");
        await expect(
          h.uow.run(async ({ roleRosterRepository }) => {
            await roleRosterRepository.save(
              RoleRoster.establishOperators(
                unsaved.entity,
                ids.person().accountId,
                ids.tick(),
              ).entity,
              unsaved.expectedVersion,
            );
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await findRoster(h, "operator")).toEqual(unsaved);
        expect(unsaved.entity).toEqual(RoleRoster.initial("operator"));
      });

      it("roleRosterRepository#20 A は editor と operator の両方の名簿の持ち主。operator の expectedVersion V を得た後、operator の別の save が成功している / 1つの UnitOfWork の中で、A を取り除いた editor の名簿の save と、V での operator の名簿の save を行う", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        await storeEditors(h, ids.tick, A);
        await storeOperators(h, ids.tick, A, B);
        const v = await findRoster(h, "operator");
        await saveRoster(
          h,
          RoleRoster.grant(v.entity, ids.person().accountId, ids.tick()).entity,
          v.expectedVersion,
        );
        const editors = await findRoster(h, "editor");
        await expect(
          h.uow.run(async ({ roleRosterRepository }) => {
            await roleRosterRepository.save(
              RoleRoster.removeHolder(
                editors.entity,
                A.accountId,
                "withdrawn",
                ids.tick(),
              ).entity,
              editors.expectedVersion,
            );
            await roleRosterRepository.save(
              RoleRoster.removeHolder(
                v.entity,
                A.accountId,
                "withdrawn",
                ids.tick(),
              ).entity,
              v.expectedVersion,
            );
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await findRoster(h, "editor")).toEqual(editors);
        expect(await findRolesOf(h, A.accountId)).toEqual(
          new Set(["editor", "operator"]),
        );
      });
    });
  });
}
