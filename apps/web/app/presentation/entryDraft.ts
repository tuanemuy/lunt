import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { z } from "zod";

const PREFIX = "lunt:entry-draft";

/**
 * Keeps a form's input across a round trip through a page it links to
 * (CF-02: 候補から閲覧側の詳細を開いて確かめ、戻ると元の入力は変わらない).
 * `stash` stores the input under the current history entry; coming back
 * to that same entry (the browser's back, a detail's 戻る) hands it to
 * `restore` once mounted. Opening the form afresh is a new history entry
 * and starts empty, as leaving without submitting promises.
 *
 * What was stored is parsed by `schema` again: session storage is outside
 * the page, and a draft that no longer fits is dropped.
 */
export function useEntryDraft<T>(
  scope: string,
  schema: z.ZodType<T>,
  restore: (draft: T) => void,
): Readonly<{ stash: (draft: T) => void; clear: () => void }> {
  const entry = useLocation({
    select: (location) =>
      location.state.__TSR_key ?? location.state.key ?? null,
  });
  const key = entry === null ? null : `${PREFIX}:${scope}:${entry}`;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    if (key === null) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(key);
    } catch {
      return;
    }
    if (raw === null) return;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = schema.safeParse(value);
    if (parsed.success) restoreRef.current(parsed.data);
  }, [key, schema]);

  return {
    stash: (draft) => {
      if (key === null) return;
      try {
        sessionStorage.setItem(key, JSON.stringify(draft));
      } catch {
        // Storage refused (private mode, quota): the input starts empty on return.
      }
    },
    clear: () => {
      if (key === null) return;
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Nothing was kept.
      }
    },
  };
}
