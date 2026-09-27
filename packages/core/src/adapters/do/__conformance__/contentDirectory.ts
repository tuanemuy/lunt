import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { PhotoId } from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import type {
  ContentDirectory,
  ContentSummary,
} from "@repo/core/domain/moderation/ports/contentDirectory";
import { notificationIds } from "@repo/core/domain/notification/testing/samples";
import { describe, expect, it } from "vitest";
import type { SqlExec, SqlRow } from "../sql";
import type { ContentLookup, ContentLookups } from "../store/contentLookups";
import { expectBusinessRuleError } from "./assertions";

/**
 * Stage 1 has no content kind — listings and places arrive in S2, regions
 * and occasions in S3, articles in S5 — so this suite stores targets in a
 * conformance-only table and runs the directory's per-kind lookup
 * mechanism (`describeContent`) over it on both backends. The rows whose
 * preconditions need a kind's own repository (publication states, delete,
 * save) stay `todo` until that kind lands; its seeding then moves to the
 * repository and its lookup to `CONTENT_LOOKUPS`.
 */
export type ContentDirectoryHarness = Readonly<{
  directory: ContentDirectory;
  seed(targets: readonly ContentSummary[]): Promise<void>;
}>;

const TABLE = "conformance_content";

export function seedConformanceContent(
  sql: SqlExec,
  targets: readonly ContentSummary[],
): void {
  sql.exec(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT,
      photo_ids TEXT NOT NULL,
      PRIMARY KEY (kind, id)
    )`,
  );
  for (const { target, name, photoIds } of targets) {
    sql.exec(
      `INSERT INTO ${TABLE} (kind, id, name, photo_ids) VALUES (?, ?, ?, ?)`,
      target.kind,
      target.id,
      name,
      JSON.stringify(photoIds),
    );
  }
}

type Row = Readonly<{
  id: string;
  name: string | null;
  photo_ids: string;
}> &
  SqlRow;

const lookupOf =
  (kind: ContentRef["kind"]): ContentLookup =>
  (sql, ids) => {
    const exists = sql
      .exec<{ n: number } & SqlRow>(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE name = ?",
        TABLE,
      )
      .toArray()[0];
    if (Number(exists?.n ?? 0) === 0) return [];
    return sql
      .exec<Row>(
        `SELECT id, name, photo_ids FROM ${TABLE}
           WHERE kind = ? AND id IN (SELECT value FROM json_each(?))`,
        kind,
        JSON.stringify(ids),
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        name: row.name,
        photoIds: JSON.parse(row.photo_ids) as string[],
      }));
  };

/** Lookups over the conformance-only table, one per kind. */
export const CONFORMANCE_CONTENT_LOOKUPS: ContentLookups = {
  listing: lookupOf("listing"),
  place: lookupOf("place"),
  region: lookupOf("region"),
  occasion: lookupOf("occasion"),
  article: lookupOf("article"),
};

/** `spec/testcases/ports/contentDirectory.md`. */
export function describeContentDirectoryContract(
  makeHarness: () => Promise<ContentDirectoryHarness>,
): void {
  const ids = () => notificationIds(0x60_0000);
  const place = (
    id: ReturnType<ReturnType<typeof notificationIds>["place"]>,
    name: string | null,
  ): ContentSummary => ({ target: { kind: "place", id }, name, photoIds: [] });

  describe("ContentDirectory contract", () => {
    describe("describe", () => {
      it.todo(
        "contentDirectory#1 公開中の掲載 L1、店舗 P1、公開中の地域 R1、公開中のイベント O1、公開中の読みもの A1 が保存されている / describe([A1, O1, R1, P1, L1])",
      );
      it.todo(
        "contentDirectory#2 店舗 P2、P1 が保存されている / describe([P2, P1])",
      );
      it.todo(
        "contentDirectory#3 写真 X・Y・Z をこの順に持つ掲載 L1 が保存されている / describe([L1])",
      );
      it.todo(
        "contentDirectory#4 写真を持たない店舗 P1 が保存されている / describe([P1])",
      );

      it("contentDirectory#5 店舗 P1 が保存されている。P2 は保存されていない / describe([P1, P2])", async () => {
        const h = await makeHarness();
        const id = ids();
        const [P1, P2] = [id.place(), id.place()];
        const photo = PhotoId.create(id.raw());
        await h.seed([
          {
            target: { kind: "place", id: P1 },
            name: "一号店",
            photoIds: [photo],
          },
        ]);
        expect(
          await h.directory.describe([
            { kind: "place", id: P1 },
            { kind: "place", id: P2 },
          ]),
        ).toEqual([
          {
            target: { kind: "place", id: P1 },
            name: "一号店",
            photoIds: [photo],
          },
        ]);
      });

      it.todo(
        "contentDirectory#6 掲載 L1 が保存されている / UnitOfWork の中で L1 を delete してコミットし、直後に describe([L1])",
      );
      it.todo(
        "contentDirectory#7 店舗 P1 が保存されている / kind が listing で、id の文字列が P1 と同じ ContentRef で describe",
      );
      it.todo(
        "contentDirectory#8 運営による非公開の掲載 L1、非公開の店舗 P1、公開を取り下げた地域 R1、運営による非公開のイベント O1、公開を取り下げた読みもの A1 が保存されている / describe([L1, P1, R1, O1, A1])",
      );
      it.todo(
        "contentDirectory#9 非公開の店舗 P1 に紐づく公開中の掲載 L1 が保存されている / describe([L1])",
      );
      it.todo(
        "contentDirectory#10 名称が未入力の下書きの地域 R1 と、タイトルが未入力の下書きの読みもの A1 が保存されている / describe([R1, A1])",
      );

      it("contentDirectory#11 店舗 P1 が保存されている / describe([])", async () => {
        const h = await makeHarness();
        await h.seed([place(ids().place(), "一号店")]);
        expect(await h.directory.describe([])).toEqual([]);
      });

      it.todo(
        "contentDirectory#12 100件の店舗が保存されている / 100件の対象で describe",
      );

      it("contentDirectory#13 店舗 P1 が保存されている / 101件の対象で describe", async () => {
        const h = await makeHarness();
        const id = ids();
        const P1 = id.place();
        await h.seed([place(P1, "一号店")]);
        await expectBusinessRuleError(
          h.directory.describe([
            { kind: "place", id: P1 },
            ...Array.from({ length: 100 }, () => ({
              kind: "place" as const,
              id: id.place(),
            })),
          ]),
          CommonErrorCode.InvalidInput,
        );
      });
    });

    describe("可視性", () => {
      it.todo(
        "contentDirectory#14 写真 X・Y を持つ掲載 L1 が保存されている / UnitOfWork の中で、X を外した L1 を save してコミットし、直後に describe([L1])",
      );
      it.todo(
        "contentDirectory#15 写真 X を持つ地域 R1 が保存されている / UnitOfWork の中で、写真 Y を加えた R1 を save してコミットし、直後に describe([R1])",
      );
      it.todo(
        "contentDirectory#16 読みもの A1 が保存されている / UnitOfWork の中で A1 のタイトルを変えて save してコミットし、直後に describe([A1])",
      );
      it.todo(
        "contentDirectory#17 空 / UnitOfWork の中で店舗 P1 を insert し、fn が例外を投げた後、describe([P1])",
      );
    });

    describe("beyond the spec rows", () => {
      it("asks one lookup per kind and returns listing, place, …, then id order", async () => {
        const h = await makeHarness();
        const id = ids();
        const [P1, P2, L1] = [id.place(), id.place(), id.listing()];
        await h.seed([
          place(P2, "二号店"),
          { target: { kind: "listing", id: L1 }, name: null, photoIds: [] },
          place(P1, "一号店"),
        ]);
        expect(
          await h.directory.describe([
            { kind: "place", id: P2 },
            { kind: "listing", id: L1 },
            { kind: "place", id: P1 },
            { kind: "place", id: P2 },
          ]),
        ).toEqual([
          { target: { kind: "listing", id: L1 }, name: null, photoIds: [] },
          place(P1, "一号店"),
          place(P2, "二号店"),
        ]);
      });
    });
  });
}
