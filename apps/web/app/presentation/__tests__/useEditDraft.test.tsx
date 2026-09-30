// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { savedDraft, useEditDraft } from "../editDraft";

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
});
