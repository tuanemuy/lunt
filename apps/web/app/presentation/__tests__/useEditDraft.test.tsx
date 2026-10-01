// @vitest-environment happy-dom
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  followDraft,
  isDirty,
  reloadDraft,
  savedDraft,
  useEditDraft,
} from "../editDraft";

type Data = Readonly<{ version: number; name: string }>;
type Values = Readonly<{ name: string }>;

const valuesOf = (data: Data): Values => ({ name: data.name });

const renderDraft = (initial: Data) =>
  renderHook(({ data }: { data: Data }) => useEditDraft(data, valuesOf), {
    initialProps: { data: initial },
  });

afterEach(cleanup);

describe("useEditDraft", () => {
  it("mounted on a cached copy, takes the fresh copy's version and content", () => {
    const { result, rerender } = renderDraft({
      version: 3,
      name: "before publish",
    });
    rerender({ data: { version: 4, name: "published" } });
    const [draft] = result.current;
    expect(draft.version).toBe(4);
    expect(draft.values).toEqual({ name: "published" });
  });

  it("keeps the user's edits and their version when a newer copy changed the content", () => {
    const { result, rerender } = renderDraft({ version: 3, name: "before" });
    act(() => {
      const [, setDraft] = result.current;
      setDraft((draft) => ({ ...draft, values: { name: "mine" } }));
    });
    rerender({ data: { version: 4, name: "theirs" } });
    const [draft] = result.current;
    expect(draft.version).toBe(3);
    expect(draft.values).toEqual({ name: "mine" });
  });

  it("after an unchecked publish, shows the content someone saved before it", () => {
    const { result, rerender } = renderDraft({ version: 3, name: "before" });
    // Someone saves (4), then this editor publishes (5); the reconcile brings 5.
    rerender({ data: { version: 5, name: "theirs" } });
    expect(result.current[0].version).toBe(5);
    expect(result.current[0].values).toEqual({ name: "theirs" });
  });

  it("with edits made before an unchecked publish, keeps the old version so the next save conflicts", () => {
    const { result, rerender } = renderDraft({ version: 3, name: "before" });
    act(() => {
      const [, setDraft] = result.current;
      setDraft((draft) => ({ ...draft, values: { name: "mine" } }));
    });
    rerender({ data: { version: 5, name: "theirs" } });
    expect(result.current[0].version).toBe(3);
    expect(result.current[0].values).toEqual({ name: "mine" });
  });

  it("with edits, takes the version of a publish that changed no content", () => {
    const { result, rerender } = renderDraft({ version: 3, name: "before" });
    act(() => {
      const [, setDraft] = result.current;
      setDraft((draft) => ({ ...draft, values: { name: "mine" } }));
    });
    rerender({ data: { version: 4, name: "before" } });
    expect(result.current[0].version).toBe(4);
    expect(result.current[0].values).toEqual({ name: "mine" });
  });

  it("after its own save, keeps the reply's version over the older loader copy", () => {
    const { result, rerender } = renderDraft({ version: 3, name: "before" });
    act(() => {
      const [, setDraft] = result.current;
      setDraft((draft) =>
        savedDraft(
          { ...draft, values: { name: "after" } },
          { name: "after" },
          4,
        ),
      );
    });
    rerender({ data: { version: 3, name: "before" } });
    expect(result.current[0].version).toBe(4);
    expect(result.current[0].values).toEqual({ name: "after" });
    rerender({ data: { version: 4, name: "after" } });
    expect(result.current[0].version).toBe(4);
    expect(result.current[0].resync).toBeNull();
  });

  it("unedited, takes a fresh copy at the same version whose shown content changed", () => {
    const { result, rerender } = renderDraft({ version: 3, name: "shown" });
    // Back from CM-03: the cached copy, then the fresh one (a showcase hidden meanwhile).
    rerender({ data: { version: 3, name: "hidden" } });
    expect(result.current[0].version).toBe(3);
    expect(result.current[0].values).toEqual({ name: "hidden" });
    expect(result.current[0].base).toEqual({ name: "hidden" });
  });

  it("with edits, keeps them over a fresh copy at the same version", () => {
    const { result, rerender } = renderDraft({ version: 3, name: "shown" });
    act(() => {
      const [, setDraft] = result.current;
      setDraft((draft) => ({ ...draft, values: { name: "mine" } }));
    });
    rerender({ data: { version: 3, name: "hidden" } });
    expect(result.current[0].version).toBe(3);
    expect(result.current[0].values).toEqual({ name: "mine" });
    expect(result.current[0].base).toEqual({ name: "shown" });
  });

  it("keeps what was typed before the loader's fresh copy arrived, whatever that copy brings", () => {
    const { result, rerender } = renderDraft({ version: 3, name: "cached" });
    act(() => {
      const [, setDraft] = result.current;
      setDraft((draft) => ({ ...draft, values: { name: "typed early" } }));
    });
    rerender({ data: { version: 3, name: "cached" } });
    expect(result.current[0].values).toEqual({ name: "typed early" });
    rerender({ data: { version: 4, name: "cached" } });
    expect(result.current[0].values).toEqual({ name: "typed early" });
    expect(result.current[0].version).toBe(4);
    rerender({ data: { version: 5, name: "theirs" } });
    expect(result.current[0].values).toEqual({ name: "typed early" });
    expect(result.current[0].version).toBe(4);
  });

  it("settles when the caller builds the data afresh on every render", () => {
    let renders = 0;
    const { result, rerender } = renderHook(
      ({ name, version }: { name: string; version: number }) => {
        renders += 1;
        return useEditDraft({ version, name }, valuesOf);
      },
      { initialProps: { name: "before", version: 3 } },
    );
    const start = renders;
    rerender({ name: "before", version: 3 });
    rerender({ name: "before", version: 3 });
    expect(renders - start).toBe(2);
    rerender({ name: "after", version: 4 });
    expect(result.current[0].version).toBe(4);
    expect(result.current[0].values).toEqual({ name: "after" });
  });

  it("keeps a component that passes a fresh object every render interactive (CM-04)", () => {
    let renders = 0;
    function Form({ version }: { version: number }) {
      const [tick, setTick] = useState(0);
      const [draft, setDraft] = useEditDraft(
        { version, name: "stored", tick },
        valuesOf,
      );
      renders += 1;
      return (
        <button
          type="button"
          onClick={() => {
            setTick((n) => n + 1);
            setDraft((current) => ({ ...current, values: { name: "typed" } }));
          }}
        >
          {draft.values.name}
        </button>
      );
    }
    const { getByRole, rerender } = render(<Form version={3} />);
    act(() => getByRole("button").click());
    expect(getByRole("button").textContent).toBe("typed");
    rerender(<Form version={3} />);
    expect(getByRole("button").textContent).toBe("typed");
    expect(renders).toBeLessThan(10);
  });

  it("with edits, takes the version of a change that moved only what the form shows (no false CS-07)", () => {
    type Shown = Readonly<{ version: number; name: string; state: string }>;
    const { result, rerender } = renderHook(
      ({ data }: { data: Shown }) =>
        useEditDraft(
          data,
          (d) => ({ name: d.name, state: d.state }),
          (values) => values.name,
        ),
      { initialProps: { data: { version: 3, name: "before", state: "open" } } },
    );
    act(() => {
      const [, setDraft] = result.current;
      setDraft((draft) => ({
        ...draft,
        values: { ...draft.values, name: "mine" },
      }));
    });
    // A showcase suspended (no new version), then the editor's own unpublish (4).
    rerender({ data: { version: 3, name: "before", state: "suspended" } });
    rerender({ data: { version: 4, name: "before", state: "suspended" } });
    expect(result.current[0].version).toBe(4);
    expect(result.current[0].values.name).toBe("mine");
    expect(isDirty(result.current[0])).toBe(true);
  });

  it("unedited, takes a change of what the form shows without counting it as an edit", () => {
    type Shown = Readonly<{ version: number; name: string; state: string }>;
    const { result, rerender } = renderHook(
      ({ data }: { data: Shown }) =>
        useEditDraft(
          data,
          (d) => ({ name: d.name, state: d.state }),
          (values) => values.name,
        ),
      { initialProps: { data: { version: 3, name: "same", state: "open" } } },
    );
    rerender({ data: { version: 3, name: "same", state: "suspended" } });
    expect(result.current[0].values.state).toBe("suspended");
    expect(isDirty(result.current[0])).toBe(false);
  });

  it("after CS-08, follows a newer copy that kept the content: its version, with the edits", () => {
    const { result, rerender } = renderDraft({ version: 3, name: "before" });
    act(() => {
      const [, setDraft] = result.current;
      setDraft((draft) => followDraft({ ...draft, values: { name: "mine" } }));
    });
    rerender({ data: { version: 4, name: "before" } });
    expect(result.current[0].version).toBe(4);
    expect(result.current[0].values).toEqual({ name: "mine" });
    expect(result.current[0].resync).toBeNull();
  });

  it("after CS-08, keeps the old version when the newer copy changed the content", () => {
    const { result, rerender } = renderDraft({ version: 3, name: "before" });
    act(() => {
      const [, setDraft] = result.current;
      setDraft((draft) => followDraft({ ...draft, values: { name: "mine" } }));
    });
    rerender({ data: { version: 4, name: "theirs" } });
    expect(result.current[0].version).toBe(3);
    expect(result.current[0].values).toEqual({ name: "mine" });
  });

  it("after CS-07's reload, restarts from the newer copy", () => {
    const { result, rerender } = renderDraft({ version: 3, name: "before" });
    act(() => {
      const [, setDraft] = result.current;
      setDraft((draft) => reloadDraft({ ...draft, values: { name: "mine" } }));
    });
    rerender({ data: { version: 3, name: "before" } });
    expect(result.current[0].values).toEqual({ name: "mine" });
    rerender({ data: { version: 5, name: "theirs" } });
    expect(result.current[0].version).toBe(5);
    expect(result.current[0].values).toEqual({ name: "theirs" });
    expect(isDirty(result.current[0])).toBe(false);
  });
});
