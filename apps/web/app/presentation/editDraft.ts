import { useState } from "react";

/**
 * An edit form's state against a versioned target (SM-02, SM-04, AM-02, …):
 * what the form holds, the content it started from, the version the next
 * save sends, and a pending resync with the loader's copy.
 *
 * The version the next save sends comes from the server's reply to the
 * editor's own save or state change, never from the loader right after
 * `useReconcile()`: the reconcile resolves before the island re-renders with
 * the fresh payload (`Deferred` adopts it in the same commit), so reading the
 * loader's data there still sees the copy from before the change. The fresh
 * payload is folded in when it arrives, by `syncEditDraft` during render.
 *
 * Without a resync waiting, a loader copy newer than the draft replaces an
 * unedited form. A navigation shows the route's cached payload first and
 * swaps in the fresh one without remounting the form, so a form seeded from
 * the cached copy would otherwise send a version the server has moved past
 * (a false CS-07). A form with unsaved edits keeps them and its version:
 * saving them over someone else's change is the conflict CS-07 reports.
 */
export type EditDraft<V> = Readonly<{
  values: V;
  base: V;
  version: number;
  /**
   * Take the loader's copy once it has reached `atLeast`: its content and
   * version (`restart`), its content unless the form was edited since
   * (`content`), or only its version (`version`).
   */
  resync: Readonly<{
    mode: "restart" | "content" | "version";
    atLeast: number;
  }> | null;
}>;

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export const startEditDraft = <V>(
  values: V,
  version: number,
): EditDraft<V> => ({
  values,
  base: values,
  version,
  resync: null,
});

export const isDirty = <V>(draft: EditDraft<V>): boolean =>
  !same(draft.values, draft.base);

/**
 * The editor's save went through at `version`: the form keeps what it sent
 * (now the saved content), and the loader's copy of that version replaces it
 * when it arrives, in case the server normalized it.
 */
export const savedDraft = <V>(
  draft: EditDraft<V>,
  submitted: V,
  version: number,
): EditDraft<V> => ({
  values: same(draft.values, submitted) ? submitted : draft.values,
  base: submitted,
  version,
  resync: { mode: "content", atLeast: version },
});

/** The editor's own state change went through at `version`; the content did not change. */
export const movedDraft = <V>(
  draft: EditDraft<V>,
  version: number,
): EditDraft<V> => ({ ...draft, version: Math.max(draft.version, version) });

/**
 * Start again from the server's content (CS-07 最新の内容を読み直す): the
 * loader's copy replaces the form once it is newer than the draft.
 */
export const reloadDraft = <V>(draft: EditDraft<V>): EditDraft<V> => ({
  ...draft,
  resync: { mode: "restart", atLeast: draft.version + 1 },
});

/**
 * Keep the unsaved values but follow the loader's version once it moves
 * past the draft (a CS-08 whose change the editor then shows).
 */
export const followDraft = <V>(draft: EditDraft<V>): EditDraft<V> => ({
  ...draft,
  resync: { mode: "version", atLeast: draft.version + 1 },
});

/** An operation starts: a resync still waiting from an earlier one is dropped. */
export const settledDraft = <V>(draft: EditDraft<V>): EditDraft<V> =>
  draft.resync === null ? draft : { ...draft, resync: null };

/**
 * The draft after the loader's copy `fresh` at `version` arrived: the
 * waiting resync applied, or, with none waiting, a newer copy taken by an
 * unedited form. Otherwise the same draft.
 */
export function syncEditDraft<V>(
  draft: EditDraft<V>,
  fresh: () => V,
  version: number,
): EditDraft<V> {
  const { resync } = draft;
  if (resync === null) {
    if (version <= draft.version || isDirty(draft)) return draft;
    const content = fresh();
    return { values: content, base: content, version, resync: null };
  }
  if (version < resync.atLeast) return draft;
  if (resync.mode === "version") return { ...draft, version, resync: null };
  const content = fresh();
  return {
    values:
      resync.mode === "content" && !same(draft.values, draft.base)
        ? draft.values
        : content,
    base: content,
    version,
    resync: null,
  };
}

/**
 * `EditDraft` as component state, synced with the loader's `data` during
 * render (React's "adjusting state when a prop changes").
 */
export function useEditDraft<D extends Readonly<{ version: number }>, V>(
  data: D,
  valuesOf: (data: D) => V,
): readonly [
  EditDraft<V>,
  (next: (draft: EditDraft<V>) => EditDraft<V>) => void,
] {
  const [draft, setDraft] = useState(() =>
    startEditDraft(valuesOf(data), data.version),
  );
  const synced = syncEditDraft(draft, () => valuesOf(data), data.version);
  if (synced !== draft) setDraft(synced);
  return [synced, setDraft];
}
