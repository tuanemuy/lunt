import type { StewardedTargetDirectory } from "@repo/core/domain/authority/ports/stewardedTargetDirectory";
import { RegionId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import type { SqlExec, SqlRow } from "../sql";
import type {
  StewardedTargetLookup,
  StewardedTargetLookups,
} from "../store/stewardedTargetLookups";
import { expectBusinessRuleError } from "./assertions";
import { authorityIds } from "./authorityFixtures";

/**
 * P1 has no target kind yet — places arrive in S2A, regions and occasions
 * in S3A — so this suite stores targets in a conformance-only table and
 * runs the directory's per-kind lookup mechanism
 * (`describeStewardedTargets`) over it on both backends. When a kind's
 * tables land, its seeding moves to that kind's repository and the
 * lookup to `STEWARDED_TARGET_LOOKUPS`.
 */
export type SeedTarget = Readonly<{
  target: StewardedRef;
  name: string | null;
}>;

export type DirectoryHarness = Readonly<{
  directory: StewardedTargetDirectory;
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
  (sql, ids) =>
    sql
      .exec<{ id: string; name: string | null } & SqlRow>(
        `SELECT id, name FROM ${TABLE}
           WHERE kind = ? AND id IN (SELECT value FROM json_each(?))`,
        kind,
        JSON.stringify(ids),
      )
      .toArray()
      .map((row) => ({ id: row.id, name: row.name }));

/** Lookups over the conformance-only table, one per kind. */
export const CONFORMANCE_TARGET_LOOKUPS: StewardedTargetLookups = {
  place: lookupOf("place"),
  region: lookupOf("region"),
  occasion: lookupOf("occasion"),
};

const named = (target: StewardedRef, name: string | null): SeedTarget => ({
  target,
  name,
});

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
        await h.seed([
          named(O1, "夏祭り"),
          named(R1, "谷中"),
          named(P1, "喫茶ルント"),
        ]);
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
        await h.seed([named(P2, "二号店"), named(P1, "一号店")]);
        expect(await h.directory.describe([P2, P1])).toEqual([
          named(P1, "一号店"),
          named(P2, "二号店"),
        ]);
      });

      it("stewardedTargetDirectory#3 店舗 P1 が保存されている。P2 は保存されていない / describe([P1, P2])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [P1, P2] = [ids.place(), ids.place()];
        await h.seed([named(P1, "一号店")]);
        expect(await h.directory.describe([P1, P2])).toEqual([
          named(P1, "一号店"),
        ]);
      });

      it("stewardedTargetDirectory#4 店舗 P1 が保存されている / kind が region で、id の文字列が P1 と同じ StewardedRef で describe", async () => {
        const h = await makeHarness();
        const P1 = authorityIds().place();
        await h.seed([named(P1, "一号店")]);
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
        await h.seed([
          named(P1, "非公開の店舗"),
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
        await h.seed([named(authorityIds().place(), "一号店")]);
        expect(await h.directory.describe([])).toEqual([]);
      });

      it("stewardedTargetDirectory#9 100件の店舗が保存されている / 100件の対象で describe", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const places = Array.from({ length: 100 }, (_, i) =>
          named(ids.place(), `店舗${i}`),
        );
        await h.seed(places);
        expect(
          await h.directory.describe(
            [...places].reverse().map((place) => place.target),
          ),
        ).toEqual(places);
      });

      it("stewardedTargetDirectory#10 店舗 P1 が保存されている / 101件の対象で describe", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const P1 = ids.place();
        await h.seed([named(P1, "一号店")]);
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
    // store a region, so these three wait for it.
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
    });
  });
}
