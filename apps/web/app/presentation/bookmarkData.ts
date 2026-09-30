// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { getSavedTargets } from "@repo/core/application/bookmark/getSavedTargets";
import { listBookmarks } from "@repo/core/application/bookmark/listBookmarks";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { resolveReferences } from "@repo/core/application/discovery/resolveReferences";
import type { Actor } from "@repo/core/domain/common/actor";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { BookmarkRef, ContentRef } from "@repo/core/domain/common/refs";
import { requireActor, resolveActor } from "./actor";
import { readFromOffset } from "./offsetRead";
import {
  SAVED_PAGE_SIZE,
  type SavedPage,
  type SaveState,
  type SaveTarget,
  toSavedItems,
} from "./savedView";

const refOf = (target: SaveTarget): BookmarkRef =>
  BookmarkRef.create(target.kind, target.id);

/**
 * The viewer's `SaveState` for up to 100 targets a screen shows (CF-04):
 * `getSavedTargets` when signed in, nothing to read otherwise. For screens
 * that render their cards on the server (VW-01's feed); a client loader
 * uses `loadSaveStateFn`.
 */
export async function loadSaveState(
  container: RequestContainer,
  actor: Actor | null,
  targets: readonly SaveTarget[],
): Promise<SaveState> {
  if (actor === null) return { signedIn: false };
  if (targets.length === 0) return { signedIn: true, saved: [] };
  const saved = await getSavedTargets({
    container,
    actor,
    input: { targets: targets.map(refOf) },
  });
  return { signedIn: true, saved: saved.map(ContentRef.key) };
}

/** VW-10's rows for refs in saved order (≤100), signed in or not. */
export async function resolveSaved(
  container: RequestContainer,
  targets: readonly SaveTarget[],
): Promise<SavedPage["items"]> {
  if (targets.length === 0) return [];
  const output = await resolveReferences({
    container,
    input: { refs: targets.map(refOf) },
  });
  return toSavedItems(output, LocalDate.fromInstant(container.clock.now()));
}

/**
 * Up to a page of the signed-in account's saves (VW-10, 「アカウントの
 * 保存」) from row `offset` of the list as it stands, newest first, with
 * hidden and deleted targets as unavailable rows. `UnauthorizedError`
 * when the session is gone.
 */
export async function loadAccountSavedFrom(offset: number): Promise<SavedPage> {
  const container = await getContainer();
  const actor = await requireActor(container);
  const output = await readFromOffset(offset, SAVED_PAGE_SIZE, (page) =>
    listBookmarks({
      container,
      actor,
      input: { pagination: { page, limit: SAVED_PAGE_SIZE } },
    }),
  );
  const items = await resolveSaved(
    container,
    output.items.map(({ target }) => ({ kind: target.kind, id: target.id })),
  );
  return { items, count: output.count };
}

/** Whether this request is signed in (VW-10 picks the account or the device list). */
export async function isSignedIn(): Promise<boolean> {
  return (await resolveActor(await getContainer())) !== null;
}
