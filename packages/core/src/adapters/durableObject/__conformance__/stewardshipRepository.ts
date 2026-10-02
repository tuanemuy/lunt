import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import {
  Stewardship,
  type StewardshipOf,
} from "@repo/core/domain/authority/stewardship";
import { RegionId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import { describe, expect, it } from "vitest";
import { expectBusinessRuleError } from "./assertions";
import {
  appoint,
  authorityIds,
  findByTargets,
  findPageBySteward,
  findStewardship,
  getStewardship,
  insertStewardships,
  saveStewardship,
  stewardshipOf,
  withoutSteward,
} from "./authorityFixtures";
import { barrier, ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";

const key = (s: Stewardship) => `${s.target.kind}:${s.target.id}`;
const keys = (list: readonly Stewardship[]) => list.map(key).sort();

async function saveInScope(
  h: ConformanceHarness,
  writes: readonly [Stewardship, ExpectedVersion<Stewardship>][],
  abort = false,
): Promise<void> {
  await h.uow.run(async ({ stewardshipRepository }) => {
    for (const [s, v] of writes) await stewardshipRepository.save(s, v);
    if (abort) throw new ScopeAbort();
  });
}

/** `spec/testcases/ports/stewardshipRepository.md`. */
export function describeStewardshipRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("StewardshipRepository contract", () => {
    describe("insert、findById", () => {
      it("stewardshipRepository#1 空 / 管理者 A、B（就任の古い順）と、招待2件（招待の古い順）を持つ R1 の管理体制を insert し、findById(R1)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        const R1 = stewardshipOf(ids, ids.region(), [A, B], 2);
        await insertStewardships(h, R1);
        const found = await getStewardship(h, R1.target);
        expect(found.entity).toEqual(R1);
        expect(found.entity.status).toBe("stewarded");
        expect(
          Stewardship.stewards(found.entity).map((s) => s.accountId),
        ).toEqual([A.accountId, B.accountId]);
        expect(found.entity.invitations).toHaveLength(2);
        expect(typeof found.expectedVersion).toBe("number");
      });

      it("stewardshipRepository#2 空 / findById(P1)", async () => {
        const h = await makeHarness();
        expect(await findStewardship(h, authorityIds().place())).toBeNull();
      });

      it("stewardshipRepository#3 R1 の管理体制を insert 済み / 同じ target（R1）の管理体制を insert", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const target = ids.region();
        const first = stewardshipOf(ids, target, [ids.person()]);
        await insertStewardships(h, first);
        await expect(
          insertStewardships(h, stewardshipOf(ids, target, [ids.person()])),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getStewardship(h, target)).entity).toEqual(first);
      });

      it("stewardshipRepository#4 店舗 P1 の管理体制を insert 済み / kind が region で、id の文字列が P1 と同じ target の管理体制を insert", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const P1 = stewardshipOf(ids, ids.place(), [ids.person()]);
        const sameId: StewardedRef = {
          kind: "region",
          id: RegionId.create(P1.target.id),
        };
        const R = stewardshipOf(ids, sameId, [ids.person()]);
        await insertStewardships(h, P1);
        await insertStewardships(h, R);
        expect((await getStewardship(h, P1.target)).entity).toEqual(P1);
        expect((await getStewardship(h, sameId)).entity).toEqual(R);
      });

      it("stewardshipRepository#5 空 / 同じ target の管理体制の insert を、別々の UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const target = ids.place();
        const bothRead = barrier(2);
        const attempt = (s: Stewardship) =>
          h.uow.run(async ({ stewardshipRepository }) => {
            expect(await stewardshipRepository.findById(target)).toBeNull();
            await bothRead();
            await stewardshipRepository.insert(s);
          });
        const results = await Promise.allSettled([
          attempt(stewardshipOf(ids, target, [ids.person()])),
          attempt(stewardshipOf(ids, target, [ids.person()])),
        ]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        expect(await findByTargets(h, [target])).toHaveLength(1);
      });
    });

    describe("save", () => {
      it("stewardshipRepository#6 管理者 A の P1 の管理体制を insert 済み / 招待を加えた管理体制を save し、findById(P1)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const P1 = stewardshipOf(ids, ids.place(), [ids.person()]);
        await insertStewardships(h, P1);
        const before = await getStewardship(h, P1.target);
        const invited = Stewardship.invite(
          before.entity,
          { invitationId: ids.invitation(), email: ids.person().email },
          null,
          ids.tick(),
        ).entity;
        await saveStewardship(h, invited, before.expectedVersion);
        const after = await getStewardship(h, P1.target);
        expect(after.entity).toEqual(invited);
        expect(after.entity.invitations).toHaveLength(1);
        expect(after.expectedVersion).not.toBe(before.expectedVersion);
      });

      it('stewardshipRepository#7 管理者 A だけの R1 の管理体制を insert 済み。招待が1件ある / A を取り除いた管理体制（status: "vacant"、招待は残る）を save し、findById(R1)', async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const R1 = stewardshipOf(ids, ids.region(), [A], 1);
        await insertStewardships(h, R1);
        const before = await getStewardship(h, R1.target);
        const vacated = withoutSteward(R1, A, ids.tick());
        await saveStewardship(h, vacated, before.expectedVersion);
        const after = await getStewardship(h, R1.target);
        expect(after.entity.status).toBe("vacant");
        expect(after.entity).toEqual(vacated);
        expect(after.entity.invitations).toEqual(R1.invitations);
      });

      it("stewardshipRepository#8 vacant で招待を持つ R1 の管理体制がある / 就任で stewarded にした管理体制を save し、findById(R1)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const vacant = withoutSteward(
          stewardshipOf(ids, ids.region(), [A], 1),
          A,
          ids.tick(),
        );
        await insertStewardships(h, vacant);
        const before = await getStewardship(h, vacant.target);
        const restored = appoint(vacant, ids.person(), ids.tick());
        await saveStewardship(h, restored, before.expectedVersion);
        const after = await getStewardship(h, vacant.target);
        expect(after.entity.status).toBe("stewarded");
        expect(after.entity).toEqual(restored);
      });

      it("stewardshipRepository#9 P1 の管理体制がある。expectedVersion V を得た後、別の save が成功している / V で save", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        const P1 = stewardshipOf(ids, ids.place(), [A]);
        await insertStewardships(h, P1);
        const v = await getStewardship(h, P1.target);
        const first = appoint(P1, B, ids.tick());
        await saveStewardship(h, first, v.expectedVersion);
        await expect(
          saveStewardship(
            h,
            appoint(P1, ids.person(), ids.tick()),
            v.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getStewardship(h, P1.target)).entity).toEqual(first);
      });

      it("stewardshipRepository#10 管理者 A、B だけの P1 の管理体制がある / 同じ expectedVersion で、A を取り除いた管理体制の save と、B を取り除いた管理体制の save を、別々の UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        const P1 = stewardshipOf(ids, ids.place(), [A, B]);
        await insertStewardships(h, P1);
        const v = await getStewardship(h, P1.target);
        const results = await Promise.allSettled([
          saveStewardship(
            h,
            withoutSteward(P1, A, ids.tick()),
            v.expectedVersion,
          ),
          saveStewardship(
            h,
            withoutSteward(P1, B, ids.tick()),
            v.expectedVersion,
          ),
        ]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        const after = (await getStewardship(h, P1.target)).entity;
        expect(after.status).toBe("stewarded");
        expect(Stewardship.stewards(after)).toHaveLength(1);
      });

      it("stewardshipRepository#11 空 / save(P1 の管理体制, expectedVersion)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const P1 = stewardshipOf(ids, ids.place(), [ids.person()]);
        await expect(
          saveStewardship(
            h,
            P1,
            P1.version as number as ExpectedVersion<Stewardship>,
          ),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    describe("findByTargets", () => {
      it("stewardshipRepository#12 P1、R1 の管理体制を insert 済み / findByTargets([P1, P2, R1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [p1, p2, r1] = [ids.place(), ids.place(), ids.region()];
        const P1 = stewardshipOf(ids, p1, [ids.person()]);
        const R1 = stewardshipOf(ids, r1, [ids.person()]);
        await insertStewardships(h, P1, R1);
        const found = await findByTargets(h, [p1, p2, r1]);
        expect(keys(found)).toEqual(keys([P1, R1]));
        expect(found).toEqual(expect.arrayContaining([P1, R1]));
      });

      it("stewardshipRepository#13 P1 の管理体制を insert 済み / findByTargets([P1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const P1 = stewardshipOf(ids, ids.place(), [ids.person()]);
        await insertStewardships(h, P1);
        expect(await findByTargets(h, [P1.target])).toEqual([P1]);
      });

      it("stewardshipRepository#14 空 / findByTargets([P1, R1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        expect(await findByTargets(h, [ids.place(), ids.region()])).toEqual([]);
      });

      it("stewardshipRepository#15 vacant の R1 の管理体制がある / findByTargets([R1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const vacant = withoutSteward(
          stewardshipOf(ids, ids.region(), [A]),
          A,
          ids.tick(),
        );
        await insertStewardships(h, vacant);
        expect(await findByTargets(h, [vacant.target])).toEqual([vacant]);
      });

      it("stewardshipRepository#16 P1 の管理体制を insert 済み / findByTargets([])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        await insertStewardships(
          h,
          stewardshipOf(ids, ids.place(), [ids.person()]),
        );
        expect(await findByTargets(h, [])).toEqual([]);
      });

      it("stewardshipRepository#17 100件の対象の管理体制を insert 済み / 100件の対象で findByTargets", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const all = Array.from({ length: 100 }, () =>
          stewardshipOf(ids, ids.place(), [A]),
        );
        await insertStewardships(h, ...all);
        const found = await findByTargets(
          h,
          all.map((s) => s.target),
        );
        expect(keys(found)).toEqual(keys(all));
      });

      it("stewardshipRepository#18 P1 の管理体制を insert 済み / 101件の対象で findByTargets", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const P1 = stewardshipOf(ids, ids.place(), [ids.person()]);
        await insertStewardships(h, P1);
        const targets = [
          P1.target,
          ...Array.from({ length: 100 }, () => ids.place()),
        ];
        await expectBusinessRuleError(
          findByTargets(h, targets),
          "COMMON_INVALID_INPUT",
        );
      });
    });

    describe("findPageBySteward", () => {
      it("stewardshipRepository#19 空 / findPageBySteward(A)", async () => {
        const h = await makeHarness();
        expect(await findPageBySteward(h, authorityIds().person())).toEqual({
          items: [],
          count: 0,
        });
      });

      it("stewardshipRepository#20 A が管理者の P1 の管理体制がある / findPageBySteward(A)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const P1 = stewardshipOf(ids, ids.place(), [A]);
        await insertStewardships(h, P1);
        const byId = await getStewardship(h, P1.target);
        expect(await findPageBySteward(h, A)).toEqual({
          items: [byId],
          count: 1,
        });
      });

      it("stewardshipRepository#21 A が管理者の O1、R1、P2、P1 の管理体制を、この順で insert 済み / findPageBySteward(A)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const [p1, p2, r1, o1] = [
          ids.place(),
          ids.place(),
          ids.region(),
          ids.occasion(),
        ];
        for (const target of [o1, r1, p2, p1]) {
          await insertStewardships(h, stewardshipOf(ids, target, [A]));
        }
        const page = await findPageBySteward(h, A);
        expect(page.items.map((item) => item.entity.target)).toEqual([
          p1,
          p2,
          r1,
          o1,
        ]);
        expect(page.count).toBe(4);
      });

      it("stewardshipRepository#22 A が管理者の P1、P2、R1、O1 の管理体制がある / findPageBySteward(A, { page: 2, limit: 3 })", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const targets = [
          ids.place(),
          ids.place(),
          ids.region(),
          ids.occasion(),
        ];
        await insertStewardships(
          h,
          ...targets.map((target) => stewardshipOf(ids, target, [A])),
        );
        const page = await findPageBySteward(h, A, { page: 2, limit: 3 });
        expect(page.items.map((item) => item.entity.target)).toEqual([
          targets[3],
        ]);
        expect(page.count).toBe(4);
      });

      it("stewardshipRepository#23 A が管理者の P1 の管理体制がある / findPageBySteward(A, { page: 2, limit: 100 })", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        await insertStewardships(h, stewardshipOf(ids, ids.place(), [A]));
        expect(await findPageBySteward(h, A, { page: 2, limit: 100 })).toEqual({
          items: [],
          count: 1,
        });
      });

      it("stewardshipRepository#24 P1 の管理者は A、B。P2 の管理者は B だけ / findPageBySteward(A)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        const P1 = stewardshipOf(ids, ids.place(), [A, B]);
        const P2 = stewardshipOf(ids, ids.place(), [B]);
        await insertStewardships(h, P1, P2);
        const page = await findPageBySteward(h, A);
        expect(page.items.map((item) => item.entity)).toEqual([P1]);
        expect(page.count).toBe(1);
      });

      it("stewardshipRepository#25 P1 の管理者は B。P1 に A のメールアドレス宛ての招待がある / findPageBySteward(A)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        const P1 = Stewardship.invite(
          stewardshipOf(ids, ids.place(), [B]),
          { invitationId: ids.invitation(), email: A.email },
          A.accountId,
          ids.tick(),
        ).entity;
        await insertStewardships(h, P1);
        expect(await findPageBySteward(h, A)).toEqual({ items: [], count: 0 });
      });

      it("stewardshipRepository#26 A が管理者だった P1 の管理体制から、A を取り除いて save 済み / findPageBySteward(A)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [A, B] = [ids.person(), ids.person()];
        const P1 = stewardshipOf(ids, ids.place(), [A, B]);
        await insertStewardships(h, P1);
        const v = await getStewardship(h, P1.target);
        await saveStewardship(
          h,
          withoutSteward(P1, A, ids.tick()),
          v.expectedVersion,
        );
        expect(await findPageBySteward(h, A)).toEqual({ items: [], count: 0 });
      });

      it("stewardshipRepository#27 A が管理者の管理体制が101件ある / findPageBySteward(A, { page: 1, limit: 100 }) と { page: 2, limit: 100 }", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const all = Array.from({ length: 101 }, () =>
          stewardshipOf(ids, ids.place(), [A]),
        );
        await insertStewardships(h, ...all);
        const first = await findPageBySteward(h, A, { page: 1, limit: 100 });
        const second = await findPageBySteward(h, A, { page: 2, limit: 100 });
        expect(first.items).toHaveLength(100);
        expect(second.items).toHaveLength(1);
        expect(first.count).toBe(101);
        expect(second.count).toBe(101);
        expect(
          [...first.items, ...second.items].map((item) => item.entity),
        ).toEqual(all);
      });

      it("stewardshipRepository#28 A が管理者の P1 の管理体制がある。findPageBySteward(A) で expectedVersion を得ている / A を取り除いた P1 の管理体制を、その expectedVersion で save", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const P1 = stewardshipOf(ids, ids.place(), [A]);
        await insertStewardships(h, P1);
        const [read] = (await findPageBySteward(h, A)).items;
        if (read === undefined) throw new Error("missing");
        const vacated = withoutSteward(P1, A, ids.tick());
        await saveStewardship(h, vacated, read.expectedVersion);
        expect((await getStewardship(h, P1.target)).entity).toEqual(vacated);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("stewardshipRepository#29 空 / UnitOfWork の中で A が管理者の P1 の管理体制を insert してコミットし、直後に別の UnitOfWork で findById・findByTargets・findPageBySteward(A)", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const P1 = stewardshipOf(ids, ids.place(), [A]);
        await insertStewardships(h, P1);
        const [byId, byTargets, page] = await h.uow.run(
          async ({ stewardshipRepository }) =>
            Promise.all([
              stewardshipRepository.findById(P1.target),
              stewardshipRepository.findByTargets([P1.target]),
              stewardshipRepository.findPageBySteward(A.accountId, {
                page: 1,
                limit: 100,
              }),
            ]),
        );
        expect(byId?.entity).toEqual(P1);
        expect(byTargets).toEqual([P1]);
        expect(page.items.map((item) => item.entity)).toEqual([P1]);
      });

      it("stewardshipRepository#30 A が管理者の P1、R1 の管理体制がある / 1つの UnitOfWork の中で、A を取り除いた P1 と R1 の管理体制を save してコミットする", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const P1 = stewardshipOf(ids, ids.place(), [A]);
        const R1 = stewardshipOf(ids, ids.region(), [A]);
        await insertStewardships(h, P1, R1);
        const [p, r] = [
          await getStewardship(h, P1.target),
          await getStewardship(h, R1.target),
        ];
        const now = ids.tick();
        await saveInScope(h, [
          [withoutSteward(P1, A, now), p.expectedVersion],
          [withoutSteward(R1, A, now), r.expectedVersion],
        ]);
        expect(await findPageBySteward(h, A)).toEqual({ items: [], count: 0 });
        expect((await getStewardship(h, P1.target)).entity.status).toBe(
          "vacant",
        );
        expect((await getStewardship(h, R1.target)).entity.status).toBe(
          "vacant",
        );
      });

      it("stewardshipRepository#31 A が管理者の P1、R1 の管理体制がある / 1つの UnitOfWork の中で、A を取り除いた P1 と R1 の管理体制を save し、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const P1 = stewardshipOf(ids, ids.place(), [A]);
        const R1 = stewardshipOf(ids, ids.region(), [A]);
        await insertStewardships(h, P1, R1);
        const before = await findPageBySteward(h, A);
        const [p, r] = before.items;
        if (p === undefined || r === undefined) throw new Error("missing");
        const now = ids.tick();
        await expect(
          saveInScope(
            h,
            [
              [withoutSteward(P1, A, now), p.expectedVersion],
              [withoutSteward(R1, A, now), r.expectedVersion],
            ],
            true,
          ),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await findPageBySteward(h, A)).toEqual(before);
      });

      it("stewardshipRepository#32 A が管理者の P1、R1 の管理体制がある。R1 の expectedVersion V を得た後、R1 の別の save が成功している / 1つの UnitOfWork の中で、A を取り除いた P1 の save と、V での R1 の save を行う", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const A = ids.person();
        const P1 = stewardshipOf(ids, ids.place(), [A]);
        const R1: StewardshipOf<StewardedRef> = stewardshipOf(
          ids,
          ids.region(),
          [A],
        );
        await insertStewardships(h, P1, R1);
        const p = await getStewardship(h, P1.target);
        const v = await getStewardship(h, R1.target);
        await saveStewardship(
          h,
          appoint(R1, ids.person(), ids.tick()),
          v.expectedVersion,
        );
        const now = ids.tick();
        await expect(
          saveInScope(h, [
            [withoutSteward(P1, A, now), p.expectedVersion],
            [withoutSteward(R1, A, now), v.expectedVersion],
          ]),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await getStewardship(h, P1.target)).toEqual(p);
      });

      it("stewardshipRepository#33 空 / UnitOfWork の中で P1 の管理体制を insert し、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const P1 = stewardshipOf(ids, ids.place(), [ids.person()]);
        await expect(
          h.uow.run(async ({ stewardshipRepository }) => {
            await stewardshipRepository.insert(P1);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await findStewardship(h, P1.target)).toBeNull();
      });
    });
  });
}
