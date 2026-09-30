import { useState } from "react";

/**
 * An edit form's state against a versioned target (SM-02, SM-04, AM-02, …):
 * what the form holds, the content it started from, the version the next
 * save sends, and a pending resync with the loader's copy.
 *
 * Every comparison — whether the form was edited, whether someone else
 * changed the target — looks only at `contentOf`, the part of the values a
 * save persists. What the form merely shows of other targets (a showcase's
 * state line, whether viewers can see it) changes without anyone saving,
 * and must never read as an edit or as someone else's change (CS-07).
 *
 * The version the next save sends comes from the server's reply to the
 * editor's own save or version-checked change, never from the loader right
 * after `useReconcile()`: the reconcile resolves before the island
 * re-renders with the fresh payload (`Deferred` adopts it in the same
 * commit), so reading the loader's data there still sees the copy from
 * before the change. The fresh payload is folded in when it arrives, by
 * `syncEditDraft` during render.
 *
 * Without a resync waiting, a loader copy newer than the draft is followed
 * (`follow`): an unedited form takes its content and version together; an
 * edited form keeps its values and takes the version only when the content
 * is still the one it started from. Otherwise the form keeps its version, so
 * saving the edits over someone else's change is the conflict CS-07 reports.
 * This covers a navigation, which shows the route's cached payload first and
 * swaps in the fresh one without remounting the form, and the editor's own
 * publication changes, which do not check the version: taking their reply's
 * version alone would let the next save overwrite an edit saved before them.
 */
export type EditDraft<V> = Readonly<{
  values: V;
  base: V;
  version: number;
  /**
   * Take the loader's copy once it has reached `atLeast`: its content and
   * version (`restart`), its content unless the form was edited since
   * (`content`), or follow it as a newer copy (`version`).
   */
  resync: Readonly<{
    mode: "restart" | "content" | "version";
    atLeast: number;
  }> | null;
  /** The persisted content of the form's values; display-only parts left out. */
  contentOf: (values: V) => unknown;
}>;

const signature = (value: unknown): string => JSON.stringify(value);

const sameContent = <V>(draft: EditDraft<V>, a: V, b: V): boolean =>
  signature(draft.contentOf(a)) === signature(draft.contentOf(b));

const wholeValues = <V>(values: V): unknown => values;

export const startEditDraft = <V>(
  values: V,
  version: number,
  contentOf: (values: V) => unknown = wholeValues,
): EditDraft<V> => ({
  values,
  base: values,
  version,
  resync: null,
  contentOf,
});

export const isDirty = <V>(draft: EditDraft<V>): boolean =>
  !sameContent(draft, draft.values, draft.base);

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
  ...draft,
  values: sameContent(draft, draft.values, submitted)
    ? submitted
    : draft.values,
  base: submitted,
  version,
  resync: { mode: "content", atLeast: version },
});

/**
 * The editor's own change that the server checked against the draft's
 * version went through at `version`: the content is still the draft's base,
 * so only the version moves. After a change that does not check the version
 * (publication), leave the draft alone: the reconcile's copy is followed.
 */
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
 * Keep the unsaved values and follow the loader's copy once it moves past
 * the draft (a CS-08 whose change the editor then shows).
 */
export const followDraft = <V>(draft: EditDraft<V>): EditDraft<V> => ({
  ...draft,
  resync: { mode: "version", atLeast: draft.version + 1 },
});

/** An operation starts: a resync still waiting from an earlier one is dropped. */
export const settledDraft = <V>(draft: EditDraft<V>): EditDraft<V> =>
  draft.resync === null ? draft : { ...draft, resync: null };

/**
 * A newer loader copy: an unedited form takes it whole; an edited one keeps
 * its values and takes the version only when nobody changed the content.
 */
function follow<V>(
  draft: EditDraft<V>,
  fresh: V,
  version: number,
): EditDraft<V> {
  if (!isDirty(draft)) {
    return { ...draft, values: fresh, base: fresh, version, resync: null };
  }
  if (sameContent(draft, fresh, draft.base)) {
    return { ...draft, base: fresh, version, resync: null };
  }
  return draft.resync === null ? draft : { ...draft, resync: null };
}

/**
 * The draft after the loader's copy `fresh` at `version` arrived: the
 * waiting resync applied, or, with none waiting, a newer copy followed.
 * Otherwise the same draft, so applying it again changes nothing.
 */
export function syncEditDraft<V>(
  draft: EditDraft<V>,
  fresh: () => V,
  version: number,
): EditDraft<V> {
  const { resync } = draft;
  if (resync === null) {
    return version <= draft.version ? draft : follow(draft, fresh(), version);
  }
  if (version < resync.atLeast) return draft;
  if (resync.mode === "version") return follow(draft, fresh(), version);
  const content = fresh();
  return {
    ...draft,
    values:
      resync.mode === "content" && isDirty(draft) ? draft.values : content,
    base: content,
    version,
    resync: null,
  };
}

/**
 * A new loader copy at the draft's own version: an unedited form with no
 * resync waiting takes it. The target's stored content is the same, but
 * what the form shows of other targets (a showcase's viewability and state)
 * can change without a new version — a navigation back to the form shows
 * the cached copy first and swaps in the fresh one.
 */
export function refreshDraft<V>(
  draft: EditDraft<V>,
  fresh: V,
  version: number,
): EditDraft<V> {
  if (
    draft.resync !== null ||
    version !== draft.version ||
    isDirty(draft) ||
    signature(fresh) === signature(draft.values)
  ) {
    return draft;
  }
  return { ...draft, values: fresh, base: fresh };
}

/**
 * `EditDraft` as component state, synced with the loader's `data` during
 * render (React's "adjusting state when a prop changes").
 *
 * The loader's copy is told apart by its revision — its version and the
 * values it gives the form — never by object identity, so a caller may
 * build `data` afresh on every render. Each new revision is offered to
 * `refreshDraft` once, and `syncEditDraft` returns the same draft when
 * there is nothing left to apply, so a render settles after at most one
 * extra pass.
 *
 * `contentOf` picks what a save persists out of the values (default: all
 * of them); see `EditDraft`. It is read once, when the draft starts.
 */
export function useEditDraft<D extends Readonly<{ version: number }>, V>(
  data: D,
  valuesOf: (data: D) => V,
  contentOf?: (values: V) => unknown,
): readonly [
  EditDraft<V>,
  (next: (draft: EditDraft<V>) => EditDraft<V>) => void,
] {
  const fresh = valuesOf(data);
  const revision = `${data.version}:${signature(fresh)}`;
  const [draft, setDraft] = useState(() =>
    startEditDraft(fresh, data.version, contentOf),
  );
  const [seen, setSeen] = useState(revision);
  let synced = syncEditDraft(draft, () => fresh, data.version);
  if (revision !== seen) {
    setSeen(revision);
    synced = refreshDraft(synced, fresh, data.version);
  }
  if (synced !== draft) setDraft(synced);
  return [synced, setDraft];
}
