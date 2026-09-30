import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { PAGINATION_MAX_PAGE } from "./pagination";
import { SAVE_TARGET_KINDS, type SavedPage, type SaveState } from "./savedView";
import { validateInput } from "./validator";

/** Targets per saved-state read, per resolve and per merge (`IdBatch`, `BookmarkMerge`). */
export const SAVE_BATCH_MAX = 100;

/** The largest `|epoch ms|` a `Date` can hold (ECMAScript time values). */
const DATE_LIMIT_MS = 8.64e15;

const targetField = z.object({
  kind: z.enum(SAVE_TARGET_KINDS),
  id: z.string().trim().min(1).max(128),
});

export const saveTargetSchema = targetField;

export const saveTargetsSchema = z.object({
  targets: z.array(targetField).max(SAVE_BATCH_MAX),
});

/**
 * One merge call's device saves (KEP-04): shape and DoS limits only — the
 * kind, a non-blank id of bounded length, a time a `Date` can hold, and at
 * most 100 per call (the device sends more in runs).
 */
export const mergeDeviceSavesSchema = z.object({
  bookmarks: z
    .array(
      targetField.extend({
        savedAt: z.number().min(-DATE_LIMIT_MS).max(DATE_LIMIT_MS),
      }),
    )
    .max(SAVE_BATCH_MAX),
});

export const savedPageSchema = z.object({
  page: z.number().int().min(1).max(PAGINATION_MAX_PAGE),
});

/**
 * The viewer's `SaveState` for the targets a screen shows (CF-04 on
 * DT-01, DT-02, VW-01's cards): the account's saves among them when
 * signed in; `{ signedIn: false }` otherwise, and the device decides.
 */
export const loadSaveStateFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(saveTargetsSchema))
  .handler(async ({ data }): Promise<SaveState> => {
    const [{ getContainer }, { resolveActor }, { loadSaveState }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("./actor"),
        import("./bookmarkData"),
      ]);
    const container = await getContainer();
    return loadSaveState(
      container,
      await resolveActor(container),
      data.targets,
    );
  });

/** CF-04: saves the target to the signed-in account (`saveBookmark`). */
export const saveBookmarkFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(saveTargetSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { saveBookmark },
      { BookmarkRef },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/bookmark/saveBookmark"),
      import("@repo/core/domain/common/refs"),
    ]);
    const container = await getContainer();
    await saveBookmark({
      container,
      actor: await requireActor(container),
      input: { target: BookmarkRef.create(data.kind, data.id) },
    });
    return null;
  });

/** CF-04: removes the target from the signed-in account's saves (`removeBookmark`). */
export const removeBookmarkFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(saveTargetSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { removeBookmark },
      { BookmarkRef },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/bookmark/removeBookmark"),
      import("@repo/core/domain/common/refs"),
    ]);
    const container = await getContainer();
    await removeBookmark({
      container,
      actor: await requireActor(container),
      input: { target: BookmarkRef.create(data.kind, data.id) },
    });
    return null;
  });

/**
 * KEP-04: merges one batch of this browser's device saves into the
 * signed-in account (`mergeDeviceBookmarks`, all or nothing, idempotent).
 * The device drops the batch only after this resolves.
 */
export const mergeDeviceSavesFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(mergeDeviceSavesSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { mergeDeviceBookmarks },
      { DeviceSaves },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/bookmark/mergeDeviceBookmarks"),
      import("@repo/core/application/bookmark/deviceSaves"),
    ]);
    const container = await getContainer();
    await mergeDeviceBookmarks({
      container,
      actor: await requireActor(container),
      input: { bookmarks: DeviceSaves.toDeviceBookmarks(data.bookmarks) },
    });
    return null;
  });

/** VW-10 (「アカウントの保存」), continued (CF-05). */
export const listAccountSavedFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(savedPageSchema))
  .handler(async ({ data }): Promise<SavedPage> => {
    const { loadAccountSavedPage } = await import("./bookmarkData");
    return loadAccountSavedPage(data.page);
  });

/**
 * VW-10 (「端末の保存」): the device's saves, already in saved order, as
 * rows — their content and whether they are viewable. Nothing is stored.
 */
export const resolveDeviceSavedFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(saveTargetsSchema))
  .handler(async ({ data }): Promise<SavedPage["items"]> => {
    const [{ getContainer }, { resolveSaved }] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./bookmarkData"),
    ]);
    return resolveSaved(await getContainer(), data.targets);
  });
