import { ConflictError } from "@repo/core/application/errors";
import type { CategoryId } from "@repo/core/domain/common/ids";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import { Version } from "@repo/core/domain/common/version";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import { CategoryName } from "@repo/core/domain/listing/values";
import { describe, expect, it } from "vitest";
import { barrier, ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";
import { listingFactory, openingCatalog } from "./listingFixtures";

type H = ConformanceHarness;

const findCatalog = (h: H) =>
  h.uow.run(({ categoryCatalogRepository }) =>
    categoryCatalogRepository.find(),
  );

const saveCatalog = (
  h: H,
  catalog: CategoryCatalog,
  expectedVersion: ExpectedVersion<CategoryCatalog>,
) =>
  h.uow.run(({ categoryCatalogRepository }) =>
    categoryCatalogRepository.save(catalog, expectedVersion),
  );

function setup() {
  const f = listingFactory();
  const ids: readonly CategoryId[] = [
    f.category(),
    f.category(),
    f.category(),
    f.category(),
  ];
  const id = (i: number): CategoryId => {
    const found = ids[i];
    if (found === undefined) throw new Error(`no category ${i}`);
    return found;
  };
  /** Stores the four opening categories; returns the stored catalog. */
  const establish = async (h: H): Promise<CategoryCatalog> => {
    const read = await findCatalog(h);
    const catalog = openingCatalog(ids, f.tick());
    await saveCatalog(h, catalog, read.expectedVersion);
    return catalog;
  };
  return { f, ids, id, establish };
}

/** `spec/testcases/ports/categoryCatalogRepository.md`. */
export function describeCategoryCatalogRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("CategoryCatalogRepository contract", () => {
    describe("find / save", () => {
      it("categoryCatalogRepository#1 保存された台帳がない / find する", async () => {
        const h = await makeHarness();
        const found = await findCatalog(h);
        expect(found.entity.categories).toEqual([]);
        expect(found.entity.version).toBe(Version.initial());
        expect(typeof found.expectedVersion).toBe("number");
      });

      it("categoryCatalogRepository#2 保存された台帳がない / find し、establish で4つのカテゴリーを入れた台帳を、返った expectedVersion で save する", async () => {
        const h = await makeHarness();
        const s = setup();
        await s.establish(h);
        const found = await findCatalog(h);
        expect(
          CategoryCatalog.actives(found.entity).map((c) => c.name),
        ).toEqual(["食べる", "買う", "体験", "見る"]);
        expect(found.entity.categories.map((c) => c.id)).toEqual(s.ids);
      });

      it("categoryCatalogRepository#3 上の save が成立している / find する", async () => {
        const h = await makeHarness();
        const s = setup();
        const before = await findCatalog(h);
        const saved = await s.establish(h);
        const found = await findCatalog(h);
        expect(found.entity).toEqual(saved);
        expect(found.expectedVersion).not.toBe(before.expectedVersion);
      });

      it("categoryCatalogRepository#4 4つのカテゴリーの台帳が保存されている / find し、add で5つ目を加えた台帳を save する", async () => {
        const h = await makeHarness();
        const s = setup();
        await s.establish(h);
        const read = await findCatalog(h);
        const fifth = s.f.category();
        const next = CategoryCatalog.add(
          read.entity,
          { id: fifth, name: CategoryName.create("泊まる") },
          s.f.tick(),
        ).entity;
        await saveCatalog(h, next, read.expectedVersion);
        const found = (await findCatalog(h)).entity;
        expect(found).toEqual(next);
        expect(found.categories.map((c) => c.id)).toEqual([...s.ids, fifth]);
      });

      it("categoryCatalogRepository#5 台帳が保存されている / find し、rename で名称を変えた台帳を save する", async () => {
        const h = await makeHarness();
        const s = setup();
        await s.establish(h);
        const read = await findCatalog(h);
        const next = CategoryCatalog.rename(
          read.entity,
          s.id(1),
          CategoryName.create("買いもの"),
          s.f.tick(),
        ).entity;
        await saveCatalog(h, next, read.expectedVersion);
        const found = (await findCatalog(h)).entity;
        expect(found).toEqual(next);
        expect(found.categories.map((c) => c.name)).toEqual([
          "食べる",
          "買いもの",
          "体験",
          "見る",
        ]);
      });

      it("categoryCatalogRepository#6 台帳が保存されている / find し、retire で1つを廃止した台帳を save する", async () => {
        const h = await makeHarness();
        const s = setup();
        await s.establish(h);
        const read = await findCatalog(h);
        const next = CategoryCatalog.retire(
          read.entity,
          s.id(2),
          s.id(3),
          s.f.tick(),
        ).entity;
        await saveCatalog(h, next, read.expectedVersion);
        const found = (await findCatalog(h)).entity;
        expect(found).toEqual(next);
        expect(found.categories[2]).toEqual({
          id: s.id(2),
          name: "体験",
          status: "retired",
          successorId: s.id(3),
        });
        expect(found.categories).toHaveLength(4);
      });

      it("categoryCatalogRepository#7 廃止済みのカテゴリーの移行先が、さらに廃止されている台帳を save している / find する", async () => {
        const h = await makeHarness();
        const s = setup();
        await s.establish(h);
        const read = await findCatalog(h);
        const once = CategoryCatalog.retire(
          read.entity,
          s.id(2),
          s.id(3),
          s.f.tick(),
        ).entity;
        const twice = CategoryCatalog.retire(
          once,
          s.id(3),
          s.id(1),
          s.f.tick(),
        ).entity;
        await saveCatalog(h, twice, read.expectedVersion);
        const found = (await findCatalog(h)).entity;
        expect(found).toEqual(twice);
        expect(
          found.categories
            .filter((c) => c.status === "retired")
            .map((c) => [c.id, c.status === "retired" ? c.successorId : null]),
        ).toEqual([
          [s.id(2), s.id(3)],
          [s.id(3), s.id(1)],
        ]);
      });
    });

    describe("並行性", () => {
      it("categoryCatalogRepository#8 台帳が保存されている。find で expectedVersion を得た後、別の save が成立している / 古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const s = setup();
        await s.establish(h);
        const read = await findCatalog(h);
        const winner = CategoryCatalog.rename(
          read.entity,
          s.id(0),
          CategoryName.create("食事"),
          s.f.tick(),
        ).entity;
        await saveCatalog(h, winner, read.expectedVersion);
        await expect(
          saveCatalog(
            h,
            CategoryCatalog.rename(
              read.entity,
              s.id(1),
              CategoryName.create("買い物"),
              s.f.tick(),
            ).entity,
            read.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await findCatalog(h)).entity).toEqual(winner);
      });

      it("categoryCatalogRepository#9 台帳が保存されている。2つの呼び出し側が、同じ expectedVersion を持っている / 2つの save を同時に行う", async () => {
        const h = await makeHarness();
        const s = setup();
        await s.establish(h);
        const read = await findCatalog(h);
        const a = CategoryCatalog.rename(
          read.entity,
          s.id(0),
          CategoryName.create("A"),
          s.f.tick(),
        ).entity;
        const b = CategoryCatalog.rename(
          read.entity,
          s.id(1),
          CategoryName.create("B"),
          s.f.tick(),
        ).entity;
        const results = await Promise.allSettled([
          saveCatalog(h, a, read.expectedVersion),
          saveCatalog(h, b, read.expectedVersion),
        ]);
        const rejected = results.filter((r) => r.status === "rejected");
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictError,
        );
        const winner = results[0]?.status === "fulfilled" ? a : b;
        expect((await findCatalog(h)).entity).toEqual(winner);
      });

      it("categoryCatalogRepository#10 保存された台帳がない。find で空の台帳の expectedVersion を得ている / その expectedVersion で save し、成立した後に、同じ空の台帳の expectedVersion でもう一度 save する", async () => {
        const h = await makeHarness();
        const s = setup();
        const empty = await findCatalog(h);
        const first = openingCatalog(s.ids, s.f.tick());
        await saveCatalog(h, first, empty.expectedVersion);
        const other = setup();
        await expect(
          saveCatalog(
            h,
            openingCatalog(other.ids, s.f.tick()),
            empty.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await findCatalog(h)).entity).toEqual(first);
      });

      it("categoryCatalogRepository#11 保存された台帳がない。2つの呼び出し側が、空の台帳の expectedVersion を持っている / 2つの save を同時に行う", async () => {
        const h = await makeHarness();
        const s = setup();
        const bothRead = barrier(2);
        const attempt = (catalog: CategoryCatalog) =>
          h.uow.run(async ({ categoryCatalogRepository }) => {
            const read = await categoryCatalogRepository.find();
            await bothRead();
            await categoryCatalogRepository.save(catalog, read.expectedVersion);
          });
        const a = openingCatalog(s.ids, s.f.tick());
        const b = openingCatalog(setup().ids, s.f.tick());
        const results = await Promise.allSettled([attempt(a), attempt(b)]);
        const rejected = results.filter((r) => r.status === "rejected");
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictError,
        );
        const winner = results[0]?.status === "fulfilled" ? a : b;
        expect((await findCatalog(h)).entity).toEqual(winner);
      });

      it("categoryCatalogRepository#12 save が成立している / 成立した後の find が返す expectedVersion で save する", async () => {
        const h = await makeHarness();
        const s = setup();
        await s.establish(h);
        const read = await findCatalog(h);
        const next = CategoryCatalog.add(
          read.entity,
          { id: s.f.category(), name: CategoryName.create("泊まる") },
          s.f.tick(),
        ).entity;
        await saveCatalog(h, next, read.expectedVersion);
        expect((await findCatalog(h)).entity).toEqual(next);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("categoryCatalogRepository#13 台帳が保存されている / UnitOfWorkProvider.run の中で find し、retire した台帳を save して、コミットする", async () => {
        const h = await makeHarness();
        const s = setup();
        await s.establish(h);
        await h.uow.run(async ({ categoryCatalogRepository }) => {
          const read = await categoryCatalogRepository.find();
          await categoryCatalogRepository.save(
            CategoryCatalog.retire(read.entity, s.id(2), s.id(3), s.f.tick())
              .entity,
            read.expectedVersion,
          );
        });
        const found = (await findCatalog(h)).entity;
        expect(CategoryCatalog.find(found, s.id(2))).toEqual({
          id: s.id(2),
          name: "体験",
          status: "retired",
          successorId: s.id(3),
        });
      });

      it("categoryCatalogRepository#14 台帳が保存されている / run の中で台帳を save した後に、例外を投げる", async () => {
        const h = await makeHarness();
        const s = setup();
        const saved = await s.establish(h);
        const read = await findCatalog(h);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ categoryCatalogRepository }) => {
            await categoryCatalogRepository.save(
              CategoryCatalog.retire(read.entity, s.id(2), s.id(3), s.f.tick())
                .entity,
              read.expectedVersion,
            );
            throw abort;
          }),
        ).rejects.toBe(abort);
        const after = await findCatalog(h);
        expect(after.entity).toEqual(saved);
        expect(after.expectedVersion).toBe(read.expectedVersion);
      });

      it("categoryCatalogRepository#15 保存された台帳がない / run の中で空の台帳の expectedVersion で save した後に、例外を投げる", async () => {
        const h = await makeHarness();
        const s = setup();
        const empty = await findCatalog(h);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ categoryCatalogRepository }) => {
            await categoryCatalogRepository.save(
              openingCatalog(s.ids, s.f.tick()),
              empty.expectedVersion,
            );
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect((await findCatalog(h)).entity.categories).toEqual([]);
        const later = openingCatalog(s.ids, s.f.tick());
        await saveCatalog(h, later, empty.expectedVersion);
        expect((await findCatalog(h)).entity).toEqual(later);
      });

      it("categoryCatalogRepository#16 台帳が保存されている / run の中で、古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const s = setup();
        await s.establish(h);
        const stale = await findCatalog(h);
        const winner = CategoryCatalog.rename(
          stale.entity,
          s.id(0),
          CategoryName.create("食事"),
          s.f.tick(),
        ).entity;
        await saveCatalog(h, winner, stale.expectedVersion);
        const listing = s.f.draft(s.f.place());
        await expect(
          h.uow.run(
            async ({ categoryCatalogRepository, listingRepository }) => {
              await listingRepository.insert(listing);
              await categoryCatalogRepository.save(
                CategoryCatalog.rename(
                  stale.entity,
                  s.id(1),
                  CategoryName.create("買い物"),
                  s.f.tick(),
                ).entity,
                stale.expectedVersion,
              );
            },
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await findCatalog(h)).entity).toEqual(winner);
        expect(
          await h.uow.run(({ listingRepository }) =>
            listingRepository.findById(listing.id),
          ),
        ).toBeNull();
      });
    });
  });
}
