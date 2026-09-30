import type { Actor } from "@repo/core/domain/common/actor";
import { ListingId, PlaceId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { BookmarkRef } from "@repo/core/domain/common/refs";
import type { Listing } from "@repo/core/domain/listing/listing";
import type { Place } from "@repo/core/domain/place/place";
import { discoveryKit } from "../../discovery/__tests__/kit";
import { resolveReferences } from "../../discovery/resolveReferences";
import { getSavedTargets } from "../getSavedTargets";
import { listBookmarks } from "../listBookmarks";
import { mergeDeviceBookmarks } from "../mergeDeviceBookmarks";
import { removeBookmark } from "../removeBookmark";
import { saveBookmark } from "../saveBookmark";

export const MINUTE = 60_000;
const FIRST_PAGE: Pagination = { page: 1, limit: 100 };

export const listingRef = (listing: Pick<Listing, "id">): BookmarkRef => ({
  kind: "listing",
  id: listing.id,
});
export const placeRef = (place: Pick<Place, "id">): BookmarkRef => ({
  kind: "place",
  id: place.id,
});

/**
 * Usecase-test kit for Bookmark: Discovery's kit (production-shaped
 * container, places and listings stored through their repositories,
 * accounts) plus the Bookmark usecases bound to it. `tick()` moves the
 * clock a minute and returns the new time.
 */
export async function bookmarkKit() {
  const k = await discoveryKit();
  const { container } = k;

  const tick = (): Date => {
    k.clock.advance(MINUTE);
    return k.clock.now();
  };

  // Far above the fixtures' and the container's sequential ids.
  let unused = 0x7000_0000;
  const unusedId = (): string => {
    unused += 1;
    return `ffffffff-ffff-7fff-8fff-${unused.toString(16).padStart(12, "0")}`;
  };
  /** A listing or place id nothing is stored under. */
  const nowhereListing = (): BookmarkRef => ({
    kind: "listing",
    id: ListingId.create(unusedId()),
  });
  const nowherePlace = (): BookmarkRef => ({
    kind: "place",
    id: PlaceId.create(unusedId()),
  });

  const save = (who: Actor | null, target: BookmarkRef) =>
    saveBookmark({ container, actor: who, input: { target } });

  const remove = (who: Actor | null, target: BookmarkRef) =>
    removeBookmark({ container, actor: who, input: { target } });

  const merge = (
    who: Actor | null,
    bookmarks: readonly Readonly<{ target: BookmarkRef; savedAt: Date }>[],
  ) => mergeDeviceBookmarks({ container, actor: who, input: { bookmarks } });

  const list = (who: Actor | null, pagination: Pagination = FIRST_PAGE) =>
    listBookmarks({ container, actor: who, input: { pagination } });

  const savedTargets = (who: Actor | null, targets: readonly BookmarkRef[]) =>
    getSavedTargets({ container, actor: who, input: { targets } });

  const resolve = (refs: readonly BookmarkRef[]) =>
    resolveReferences({ container, input: { refs } });

  /** The listed targets, in list order. */
  const listed = async (who: Actor) =>
    (await list(who)).items.map((item) => item.target);

  const eventCount = async () => (await k.storedEvents()).length;

  return {
    ...k,
    tick,
    nowhereListing,
    nowherePlace,
    save,
    remove,
    merge,
    list,
    savedTargets,
    resolve,
    listed,
    eventCount,
  };
}

export type BookmarkKit = Awaited<ReturnType<typeof bookmarkKit>>;

/** `refs` as a set, for results in no particular order. */
export const asSet = (refs: readonly BookmarkRef[]) =>
  new Set(refs.map((ref) => `${ref.kind}:${ref.id}`));
