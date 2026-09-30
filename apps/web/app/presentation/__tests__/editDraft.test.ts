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
    expect(syncEditDraft(synced, () => ({ name: "older" }), 3)).toBe(synced);
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
    const saved = savedDraft(edited, { name: "after" }, 4);
    // The publish does not check the version; its reply leaves the draft alone.
    const synced = syncEditDraft(saved, () => ({ name: "after" }), 5);
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

  it("following keeps the values and takes the newer version of unchanged content", () => {
    const following = followDraft(
      typed(startEditDraft({ name: "before" }, 3), "mine"),
    );
    const synced = syncEditDraft(following, () => ({ name: "before" }), 4);
    expect(synced.values).toEqual({ name: "mine" });
    expect(synced.version).toBe(4);
    expect(synced.resync).toBeNull();
  });

  it("following keeps the values and the old version when the content changed", () => {
    const following = followDraft(
      typed(startEditDraft({ name: "before" }, 3), "mine"),
    );
    const synced = syncEditDraft(following, () => ({ name: "theirs" }), 4);
    expect(synced.values).toEqual({ name: "mine" });
    expect(synced.version).toBe(3);
    expect(synced.resync).toBeNull();
  });

  it("a new operation drops a resync still waiting", () => {
    const following = followDraft(
      typed(startEditDraft({ name: "before" }, 3), "mine"),
    );
    const settled = settledDraft(following);
    expect(settled.resync).toBeNull();
    expect(syncEditDraft(settled, () => ({ name: "theirs" }), 4)).toBe(settled);
  });

  it("an unedited form takes a newer loader copy, content and version", () => {
    // A navigation mounts the form on the cached copy, then the fresh one arrives.
    const cached = startEditDraft({ name: "before publish" }, 3);
    const synced = syncEditDraft(cached, () => ({ name: "published" }), 4);
    expect(synced.values).toEqual({ name: "published" });
    expect(synced.base).toEqual({ name: "published" });
    expect(synced.version).toBe(4);
    expect(isDirty(synced)).toBe(false);
  });

  it("an unedited form ignores a loader copy that is not newer", () => {
    const draft = startEditDraft({ name: "current" }, 4);
    expect(syncEditDraft(draft, () => ({ name: "older" }), 3)).toBe(draft);
    expect(syncEditDraft(draft, () => ({ name: "same" }), 4)).toBe(draft);
  });

  it("an edited form keeps its values and version when a newer copy changed the content", () => {
    const edited = typed(startEditDraft({ name: "before" }, 3), "mine");
    expect(syncEditDraft(edited, () => ({ name: "theirs" }), 4)).toBe(edited);
  });

  it("an edited form takes a newer version whose content is unchanged", () => {
    const edited = typed(startEditDraft({ name: "before" }, 3), "mine");
    const synced = syncEditDraft(edited, () => ({ name: "before" }), 4);
    expect(synced.values).toEqual({ name: "mine" });
    expect(synced.version).toBe(4);
    expect(isDirty(synced)).toBe(true);
  });

  it("after an unchecked state change, an unedited form takes someone else's earlier save with the new version", () => {
    // Loaded at 3; someone saves (4); the editor publishes (5, no version check).
    const loaded = startEditDraft({ name: "before" }, 3);
    const synced = syncEditDraft(loaded, () => ({ name: "theirs" }), 5);
    expect(synced.values).toEqual({ name: "theirs" });
    expect(synced.base).toEqual({ name: "theirs" });
    expect(synced.version).toBe(5);
  });

  it("after a state change the loader's copy of that version changes nothing", () => {
    const moved = movedDraft(startEditDraft({ name: "before" }, 3), 4);
    expect(syncEditDraft(moved, () => ({ name: "before" }), 3)).toBe(moved);
    expect(syncEditDraft(moved, () => ({ name: "before" }), 4)).toBe(moved);
  });
});
