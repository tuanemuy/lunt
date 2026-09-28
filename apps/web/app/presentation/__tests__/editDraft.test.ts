import { describe, expect, it } from "vitest";
import {
  type EditDraft,
  followDraft,
  isDirty,
  movedDraft,
  reloadDraft,
  savedDraft,
  settledDraft,
  startEditDraft,
  syncEditDraft,
} from "../editDraft";

type Values = Readonly<{ name: string }>;

const typed = (draft: EditDraft<Values>, name: string): EditDraft<Values> => ({
  ...draft,
  values: { name },
});

describe("editDraft", () => {
  it("a save takes the reply's version before the loader's copy arrives", () => {
    const edited = typed(startEditDraft({ name: "before" }, 3), "after");
    const saved = savedDraft(edited, { name: "after" }, 4);
    expect(saved.version).toBe(4);
    expect(saved.values).toEqual({ name: "after" });
    expect(isDirty(saved)).toBe(false);
    // The reconcile resolved, but the loader's copy is still the old one.
    expect(syncEditDraft(saved, () => ({ name: "before" }), 3)).toBe(saved);
  });

  it("the loader's copy of the saved version replaces the form when it arrives", () => {
    const saved = savedDraft(
      typed(startEditDraft({ name: "before" }, 3), " after"),
      { name: " after" },
      4,
    );
    const synced = syncEditDraft(saved, () => ({ name: "after" }), 4);
    expect(synced.values).toEqual({ name: "after" });
    expect(synced.base).toEqual({ name: "after" });
    expect(synced.version).toBe(4);
    expect(synced.resync).toBeNull();
    expect(syncEditDraft(synced, () => ({ name: "later" }), 5)).toBe(synced);
  });

  it("a state change moves only the version and keeps unsaved values", () => {
    const edited = typed(startEditDraft({ name: "before" }, 3), "typing");
    const moved = movedDraft(edited, 4);
    expect(moved.version).toBe(4);
    expect(moved.values).toEqual({ name: "typing" });
    expect(isDirty(moved)).toBe(true);
  });

  it("a save then a publish ends at the publish's version with the saved content", () => {
    const edited = typed(startEditDraft({ name: "before" }, 3), "after");
    const published = movedDraft(savedDraft(edited, { name: "after" }, 4), 5);
    expect(published.version).toBe(5);
    expect(published.values).toEqual({ name: "after" });
    const synced = syncEditDraft(published, () => ({ name: "after" }), 5);
    expect(synced.version).toBe(5);
    expect(isDirty(synced)).toBe(false);
  });

  it("reloading restarts from the loader's copy once it is newer than the draft", () => {
    const reloading = reloadDraft(
      typed(startEditDraft({ name: "before" }, 3), "mine"),
    );
    expect(syncEditDraft(reloading, () => ({ name: "before" }), 3)).toBe(
      reloading,
    );
    const synced = syncEditDraft(reloading, () => ({ name: "theirs" }), 4);
    expect(synced.values).toEqual({ name: "theirs" });
    expect(synced.version).toBe(4);
    expect(isDirty(synced)).toBe(false);
  });

  it("following keeps the values and takes the newer version", () => {
    const following = followDraft(
      typed(startEditDraft({ name: "before" }, 3), "mine"),
    );
    const synced = syncEditDraft(following, () => ({ name: "theirs" }), 4);
    expect(synced.values).toEqual({ name: "mine" });
    expect(synced.version).toBe(4);
  });

  it("a new operation drops a resync still waiting", () => {
    const following = followDraft(startEditDraft({ name: "before" }, 3));
    const settled = settledDraft(following);
    expect(settled.resync).toBeNull();
    expect(syncEditDraft(settled, () => ({ name: "theirs" }), 4)).toBe(settled);
  });
});
