import type { UnitOfWorkProvider } from "@repo/core/application/execution/unitOfWork";
import type { StewardedTargetDirectory } from "@repo/core/domain/authority/ports/stewardedTargetDirectory";
import type { PlaceRef } from "@repo/core/domain/authority/stewardship";
import { RegionId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { Place } from "@repo/core/domain/place/place";
import { describe, expect, it } from "vitest";
import type { SqlExec, SqlRow } from "../sql";
import { placeStewardedTargetLookup } from "../store/place";
import type {
  StewardedTargetLookup,
  StewardedTargetLookups,
} from "../store/stewardedTargetLookups";
import { expectBusinessRuleError } from "./assertions";
import { authorityIds } from "./authorityFixtures";
import { newPlace, PLACE_T0 } from "./placeFixtures";

/**
 * Places are stored through Place's `PlaceRepository` and read by the real
 * place lookup (`placeStewardedTargetLookup`). Regions and occasions arrive
 * in S3A, so until then they are stored in a conformance-only table and
 * read by its lookups; the directory's per-kind mechanism
 * (`describeStewardedTargets`) runs over both, on both backends. When a
 * kind's tables land, its seeding moves to that kind's repository and the
 * lookup to `STEWARDED_TARGET_LOOKUPS`.
 */
export type SeedTarget = Readonly<{
  target: StewardedRef;
  name: string | null;
}>;

export type DirectoryHarness = Readonly<{
  directory: StewardedTargetDirectory;
  /** The store's unit of work: places are inserted through it. */
  uow: UnitOfWorkProvider;
  /** Stores regions and occasions in the conformance-only table. */
  seed(targets: readonly SeedTarget[]): Promise<void>;
}>;

const TABLE = "conformance_stewarded_targets";

export function createConformanceTargetTable(sql: SqlExec): void {
  sql.exec(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT,
      PRIMARY KEY (kind, id)
    )`,
  );
}

export function seedConformanceTargets(
  sql: SqlExec,
  targets: readonly SeedTarget[],
): void {
  if (targets.some(({ target }) => target.kind === "place")) {
    throw new Error("Places are stored through PlaceRepository");
  }
  createConformanceTargetTable(sql);
  sql.exec(
    `INSERT INTO ${TABLE} (kind, id, name)
       SELECT json_extract(value, '$.kind'), json_extract(value, '$.id'),
              json_extract(value, '$.name')
       FROM json_each(?)`,
    JSON.stringify(
      targets.map(({ target, name }) => ({
        kind: target.kind,
        id: target.id,
        name,
      })),
    ),
  );
}

const lookupOf =
  (kind: StewardedRef["kind"]): StewardedTargetLookup =>
  (sql, ids) => {
    createConformanceTargetTable(sql);
    return sql
      .exec<{ id: string; name: string | null } & SqlRow>(
        `SELECT id, name FROM ${TABLE}
           WHERE kind = ? AND id IN (SELECT value FROM json_each(?))`,
        kind,
        JSON.stringify(ids),
      )
      .toArray()
      .map((row) => ({ id: row.id, name: row.name }));
  };

/**
 * The real place lookup, plus conformance-only lookups for the kinds whose
 * tables have not landed (region, occasion).
 */
export const CONFORMANCE_TARGET_LOOKUPS: StewardedTargetLookups = {
  place: placeStewardedTargetLookup,
  region: lookupOf("region"),
  occasion: lookupOf("occasion"),
};

const named = (target: StewardedRef, name: string | null): SeedTarget => ({
  target,
  name,
});

/** Inserts a place named `name` for each ref, one unit of work each. */
async function storePlaces(
  h: DirectoryHarness,
  places: readonly Readonly<{ ref: PlaceRef; name: string }>[],
  options: Readonly<{ suspended?: boolean }> = {},
): Promise<void> {
  for (const { ref, name } of places) {
    const registered = newPlace(ref.id, { name });
    await h.uow.run(({ placeRepository }) =>
      placeRepository.insert(
        options.suspended
          ? Place.suspend(registered, PLACE_T0).entity
          : registered,
      ),
    );
  }
}

/** `spec/testcases/ports/stewardedTargetDirectory.md`. */
export function describeStewardedTargetDirectoryContract(
  makeHarness: () => Promise<DirectoryHarness>,
): void {
  describe("StewardedTargetDirectory contract", () => {
    describe("describe", () => {
      it("stewardedTargetDirectory#1 店舗 P1、公開中の地域 R1、公開中のイベント O1 が保存されている / describe([O1, R1, P1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [P1, R1, O1] = [ids.place(), ids.region(), ids.occasion()];
        await storePlaces(h, [{ ref: P1, name: "喫茶ルント" }]);
        await h.seed([named(O1, "夏祭り"), named(R1, "谷中")]);
        expect(await h.directory.describe([O1, R1, P1])).toEqual([
          named(P1, "喫茶ルント"),
          named(R1, "谷中"),
          named(O1, "夏祭り"),
        ]);
      });

      it("stewardedTargetDirectory#2 店舗 P2、P1 が保存されている / describe([P2, P1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [P1, P2] = [ids.place(), ids.place()];
        await storePlaces(h, [
          { ref: P2, name: "二号店" },
          { ref: P1, name: "一号店" },
        ]);
        expect(await h.directory.describe([P2, P1])).toEqual([
          named(P1, "一号店"),
          named(P2, "二号店"),
        ]);
      });

      it("stewardedTargetDirectory#3 店舗 P1 が保存されている。P2 は保存されていない / describe([P1, P2])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [P1, P2] = [ids.place(), ids.place()];
        await storePlaces(h, [{ ref: P1, name: "一号店" }]);
        expect(await h.directory.describe([P1, P2])).toEqual([
          named(P1, "一号店"),
        ]);
      });

      it("stewardedTargetDirectory#4 店舗 P1 が保存されている / kind が region で、id の文字列が P1 と同じ StewardedRef で describe", async () => {
        const h = await makeHarness();
        const P1 = authorityIds().place();
        await storePlaces(h, [{ ref: P1, name: "一号店" }]);
        expect(
          await h.directory.describe([
            { kind: "region", id: RegionId.create(P1.id) },
          ]),
        ).toEqual([]);
      });

      it("stewardedTargetDirectory#5 名称を持つ下書きの地域 R1 が保存されている / describe([R1])", async () => {
        const h = await makeHarness();
        const R1 = authorityIds().region();
        await h.seed([named(R1, "下書きの地域")]);
        expect(await h.directory.describe([R1])).toEqual([
          named(R1, "下書きの地域"),
        ]);
      });

      it("stewardedTargetDirectory#6 名称が未入力の下書きの地域 R1 と、名称が未入力の下書きのイベント O1 が保存されている / describe([R1, O1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [R1, O1] = [ids.region(), ids.occasion()];
        await h.seed([named(R1, null), named(O1, null)]);
        expect(await h.directory.describe([R1, O1])).toEqual([
          named(R1, null),
          named(O1, null),
        ]);
      });

      it("stewardedTargetDirectory#7 運営による非公開の店舗 P1、運営による非公開の地域 R1、公開を取り下げたイベント O1 が保存されている / describe([P1, R1, O1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [P1, R1, O1] = [ids.place(), ids.region(), ids.occasion()];
        await storePlaces(h, [{ ref: P1, name: "非公開の店舗" }], {
          suspended: true,
        });
        await h.seed([
          named(R1, "非公開の地域"),
          named(O1, "取り下げたイベント"),
        ]);
        expect(await h.directory.describe([P1, R1, O1])).toEqual([
          named(P1, "非公開の店舗"),
          named(R1, "非公開の地域"),
          named(O1, "取り下げたイベント"),
        ]);
      });

      it("stewardedTargetDirectory#8 店舗 P1 が保存されている / describe([])", async () => {
        const h = await makeHarness();
        await storePlaces(h, [{ ref: authorityIds().place(), name: "一号店" }]);
        expect(await h.directory.describe([])).toEqual([]);
      });

      it("stewardedTargetDirectory#9 100件の店舗が保存されている / 100件の対象で describe", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const places = Array.from({ length: 100 }, (_, i) => ({
          ref: ids.place(),
          name: `店舗${i}`,
        }));
        const registered = places.map(({ ref, name }) =>
          newPlace(ref.id, { name }),
        );
        await h.uow.run(async ({ placeRepository }) => {
          for (const place of registered) await placeRepository.insert(place);
        });
        expect(
          await h.directory.describe(
            [...places].reverse().map((place) => place.ref),
          ),
        ).toEqual(places.map(({ ref, name }) => named(ref, name)));
      });

      it("stewardedTargetDirectory#10 店舗 P1 が保存されている / 101件の対象で describe", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const P1 = ids.place();
        await storePlaces(h, [{ ref: P1, name: "一号店" }]);
        await expectBusinessRuleError(
          h.directory.describe([
            P1,
            ...Array.from({ length: 100 }, () => ids.place()),
          ]),
          "COMMON_INVALID_INPUT",
        );
      });
    });

    // Region's repository arrives in S3A; until then no unit of work can
    // store a region, so these three wait for it. The same read-your-writes
    // behaviour for places is covered below.
    describe("可視性", () => {
      it.todo(
        "stewardedTargetDirectory#11 空 / UnitOfWork の中で地域 R1 を insert してコミットし、直後に describe([R1])",
      );
      it.todo(
        "stewardedTargetDirectory#12 地域 R1 が保存されている / UnitOfWork の中で R1 の名称を変えて save してコミットし、直後に describe([R1])",
      );
      it.todo(
        "stewardedTargetDirectory#13 空 / UnitOfWork の中で地域 R1 を insert し、fn が例外を投げた後、describe([R1])",
      );

      it("shows a place committed through a unit of work, its new name after a save, and nothing after a rollback", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [P1, P2] = [ids.place(), ids.place()];
        await storePlaces(h, [{ ref: P1, name: "一号店" }]);
        expect(await h.directory.describe([P1])).toEqual([named(P1, "一号店")]);

        await h.uow.run(async ({ placeRepository }) => {
          const read = await placeRepository.findById(P1.id);
          if (read === null) throw new Error("P1 missing");
          await placeRepository.save(
            Place.updateProfile(
              read.entity,
              newPlace(P1.id, { name: "改名した店" }).profile,
              PLACE_T0,
            ).entity,
            read.expectedVersion,
          );
        });
        expect(await h.directory.describe([P1])).toEqual([
          named(P1, "改名した店"),
        ]);

        await expect(
          h.uow.run(async ({ placeRepository }) => {
            await placeRepository.insert(newPlace(P2.id, { name: "二号店" }));
            throw new Error("abort");
          }),
        ).rejects.toThrow("abort");
        expect(await h.directory.describe([P2])).toEqual([]);
      });
    });
  });
}
