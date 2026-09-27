import type { QuerySpec } from "./queries";

/** A `ContentRef` on the wire. */
export type ContentRefRecord = Readonly<{ kind: string; id: string }>;

export type ContentSummaryRecord = Readonly<{
  target: ContentRefRecord;
  name: string | null;
  photoIds: readonly string[];
}>;

/**
 * Moderation's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/moderation.ts` must cover every one.
 */
export type ModerationQueries = {
  /** Existing targets among `targets` (at most 100), in `ContentOrder`. */
  "moderation.describeContent": QuerySpec<
    { targets: readonly ContentRefRecord[] },
    readonly ContentSummaryRecord[]
  >;
};
