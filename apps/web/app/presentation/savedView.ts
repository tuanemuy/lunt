import type { ResolveReferencesOutput } from "@repo/core/application/discovery/resolveReferences";
import {
  type ListingCardItem,
  listingCard,
  type PlaceRowItem,
  placeRow,
} from "./detailView";

/** A saved listing or place, by kind and raw id (as URLs and the device carry it). */
export type SaveTarget = Readonly<{ kind: "listing" | "place"; id: string }>;

export const SAVE_TARGET_KINDS = ["listing", "place"] as const;

/** `listing:{id}` / `place:{id}`: one key per target. */
export const saveKey = (target: SaveTarget): string =>
  `${target.kind}:${target.id}`;

/**
 * What a screen knows about the viewer's saves of the targets it shows:
 * signed out, the device decides (CF-04); signed in, the account's saves
 * among them (`getSavedTargets`), as `saveKey`s.
 */
export type SaveState =
  | Readonly<{ signedIn: false }>
  | Readonly<{ signedIn: true; saved: readonly string[] }>;

/** The account's answer for `target`, or `null` while signed out. */
export function accountSaved(
  state: SaveState,
  target: SaveTarget,
): boolean | null {
  return state.signedIn ? state.saved.includes(saveKey(target)) : null;
}

/**
 * A row of VW-10: a viewable listing (card) or place (row), or a save whose
 * target is not viewable — shown without its name or photo (V-39).
 */
export type SavedItem =
  | Readonly<{ target: SaveTarget; view: "listing"; card: ListingCardItem }>
  | Readonly<{ target: SaveTarget; view: "place"; place: PlaceRowItem }>
  | Readonly<{ target: SaveTarget; view: "unavailable" }>;

/** One page of VW-10 (CF-05): the rows in saved order, and all saves' count. */
export type SavedPage = Readonly<{
  items: readonly SavedItem[];
  count: number;
}>;

/** Saves per page of VW-10: `listBookmarks` reads at most 100 a page. */
export const SAVED_PAGE_SIZE = 100;

/**
 * VW-10's rows of `resolveReferences`' answer, in its order (the order of
 * the refs it was given). Reference scene: the listing's offering state
 * and the place's operating status come along.
 */
export function toSavedItems(
  output: ResolveReferencesOutput,
  today: string,
): readonly SavedItem[] {
  return output.items.map((item): SavedItem => {
    const target: SaveTarget = { kind: item.ref.kind, id: item.ref.id };
    if (!item.viewable) return { target, view: "unavailable" };
    return item.target.kind === "listing"
      ? {
          target,
          view: "listing",
          card: listingCard(item.target.summary, output.photos, today),
        }
      : {
          target,
          view: "place",
          place: placeRow(item.target.summary, output.photos),
        };
  });
}
