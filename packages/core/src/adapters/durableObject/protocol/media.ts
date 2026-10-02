import type { QuerySpec } from "./queries";

/** At-rest shape of a photo record. Times are epoch milliseconds. */
export type PhotoAssetRecord = Readonly<{
  id: string;
  registeredBy: string;
  consentedAt: number;
  digest: string;
  registeredAt: number;
  stage: string;
  /** `null` unless `stored` and owned. */
  owner: Readonly<{ kind: string; id: string }> | null;
  version: number;
}>;

/**
 * Media's named reads and write commands on the Lunt state object. The
 * handler tables in `store/media.ts` cover every one.
 */
export type MediaQueries = {
  "media.photo.findById": QuerySpec<{ id: string }, PhotoAssetRecord | null>;
  /** Stored photos among `ids` (at most 100), in id order. */
  "media.photo.findByIds": QuerySpec<
    { ids: readonly string[] },
    readonly PhotoAssetRecord[]
  >;
  /**
   * `discarded` photos, and unowned `accepted` / `stored` ones registered
   * before `registeredBefore` (epoch ms): oldest first, ties by id.
   */
  "media.photo.findPageSweepable": QuerySpec<
    { registeredBefore: number; page: number; limit: number },
    Readonly<{ items: readonly PhotoAssetRecord[]; count: number }>
  >;
};

export type MediaCommand =
  | Readonly<{ kind: "media.photo.insert"; record: PhotoAssetRecord }>
  | Readonly<{
      kind: "media.photo.save";
      record: PhotoAssetRecord;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "media.photo.delete";
      id: string;
      expectedVersion: number;
    }>;
