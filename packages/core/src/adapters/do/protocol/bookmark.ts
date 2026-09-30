import type { QuerySpec } from "./queries";

/** A `BookmarkRef` on the wire. */
export type BookmarkTargetRecord = Readonly<{ kind: string; id: string }>;

/** At-rest shape of a bookmark; `savedAt` is epoch milliseconds. */
export type BookmarkRecord = Readonly<{
  accountId: string;
  target: BookmarkTargetRecord;
  savedAt: number;
}>;

/**
 * Bookmark's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/bookmark.ts` must cover every one.
 */
export type BookmarkQueries = {
  "bookmark.findByAccount": QuerySpec<
    { accountId: string; page: number; limit: number },
    Readonly<{ items: readonly BookmarkRecord[]; count: number }>
  >;
  /** The account's saved targets among `targets` (at most 100). */
  "bookmark.findSavedTargets": QuerySpec<
    { accountId: string; targets: readonly BookmarkTargetRecord[] },
    readonly BookmarkTargetRecord[]
  >;
};

export type BookmarkCommand =
  | Readonly<{
      /** Insert-if-absent per (`accountId`, `target`). */
      kind: "bookmark.addAll";
      records: readonly BookmarkRecord[];
    }>
  | Readonly<{
      kind: "bookmark.remove";
      accountId: string;
      target: BookmarkTargetRecord;
    }>
  | Readonly<{ kind: "bookmark.removeAllByAccount"; accountId: string }>;
