import { SAVE_BATCH_MAX } from "@/presentation/bookmark";
import { type SaveState, saveKey } from "@/presentation/savedView";

/**
 * The listings a feed shows, per history entry, so VW-01's loader can read
 * the account's saves of all of them afresh — the first page's and every
 * page loaded since. A save (CF-04) makes the feed re-read when it is
 * returned to (`rereadOnReturn`), and a card of a later page must not fall
 * back to what its page said when it was loaded. In memory only: the
 * server render and a reload start empty.
 */
const shown = new Map<string, ReadonlySet<string>>();
const MAX_ENTRIES = 20;

export const feedSaves = {
  /** Records the listing ids the feed of `entry` shows. */
  record: (entry: string | null, listingIds: readonly string[]): void => {
    if (entry === null) return;
    shown.delete(entry);
    shown.set(entry, new Set(listingIds));
    for (const oldest of shown.keys()) {
      if (shown.size <= MAX_ENTRIES) break;
      shown.delete(oldest);
    }
  },
  shownIn: (entry: string | undefined): readonly string[] =>
    entry === undefined ? [] : [...(shown.get(entry) ?? [])],
};

/** The account's answer for the listings `targets` (as keys), fresh. */
export type FeedSaves = Readonly<{
  targets: readonly string[];
  saved: readonly string[];
}>;

/**
 * `loadSaveState` for `listingIds` in runs of 100 (`SAVE_BATCH_MAX`);
 * `null` while signed out (the device decides) or with nothing shown.
 */
export async function readFeedSaves(
  listingIds: readonly string[],
  load: (
    targets: readonly { kind: "listing"; id: string }[],
  ) => Promise<SaveState>,
): Promise<FeedSaves | null> {
  if (listingIds.length === 0) return null;
  const runs: string[][] = [];
  for (let i = 0; i < listingIds.length; i += SAVE_BATCH_MAX) {
    runs.push(listingIds.slice(i, i + SAVE_BATCH_MAX));
  }
  const states = await Promise.all(
    runs.map((ids) => load(ids.map((id) => ({ kind: "listing", id })))),
  );
  if (states.some((state) => !state.signedIn)) return null;
  return {
    targets: listingIds.map((id) => saveKey({ kind: "listing", id })),
    saved: states.flatMap((state) => (state.signedIn ? state.saved : [])),
  };
}

/**
 * A card's `SaveState`: signed out, the device; signed in, the fresh read
 * when it covers the card, else what the card's page said.
 */
export function cardSaveState(
  signedIn: boolean,
  listingId: string,
  pageSaved: boolean,
  fresh: FeedSaves | null,
): SaveState {
  if (!signedIn) return { signedIn: false };
  const key = saveKey({ kind: "listing", id: listingId });
  const saved =
    fresh?.targets.includes(key) === true
      ? fresh.saved.includes(key)
      : pageSaved;
  return { signedIn: true, saved: saved ? [key] : [] };
}
