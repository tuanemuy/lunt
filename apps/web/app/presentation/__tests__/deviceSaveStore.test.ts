import type { DeviceSave } from "@repo/core/application/bookmark/deviceSaves";
import { UnauthorizedError } from "@repo/core/application/errors";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createDeviceMerger,
  createDeviceSaveStore,
  DEVICE_SAVES_KEY,
  type SaveStorage,
  useDeviceSaves,
  useMergeStatus,
} from "../deviceSaveStore";
import { AppServerError } from "../errorResponse";

function memoryStorage(initial?: string): SaveStorage & {
  raw: () => string | null;
} {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(DEVICE_SAVES_KEY, initial);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    raw: () => values.get(DEVICE_SAVES_KEY) ?? null,
  };
}

function inMemoryStore() {
  const storage = memoryStorage();
  return createDeviceSaveStore(() => storage);
}

const L1 = { kind: "listing", id: "l1" } as const;
const S1 = { kind: "place", id: "s1" } as const;

describe("createDeviceSaveStore", () => {
  it("keeps saves in storage, a saved target keeping its time", () => {
    const storage = memoryStorage();
    const store = createDeviceSaveStore(() => storage);
    expect(store.snapshot()).toEqual([]);

    expect(store.save(L1, 100)).toBe(true);
    expect(store.save(S1, 200)).toBe(true);
    expect(store.save(L1, 300)).toBe(true);
    expect(store.snapshot()).toEqual([
      { kind: "listing", id: "l1", savedAt: 100 },
      { kind: "place", id: "s1", savedAt: 200 },
    ]);
    expect(JSON.parse(storage.raw() ?? "null")).toEqual(store.snapshot());
    expect(store.has(L1)).toBe(true);

    expect(store.remove(L1)).toBe(true);
    expect(store.has(L1)).toBe(false);
    expect(store.save(L1, 400)).toBe(true);
    expect(store.snapshot().find((entry) => entry.id === "l1")?.savedAt).toBe(
      400,
    );
  });

  it("empties the key when the last save goes", () => {
    const storage = memoryStorage();
    const store = createDeviceSaveStore(() => storage);
    store.save(L1, 100);
    store.remove(L1);
    expect(storage.raw()).toBeNull();
  });

  it("keeps the same snapshot until the stored list changes", () => {
    const store = inMemoryStore();
    const storage = memoryStorage();
    const live = createDeviceSaveStore(() => storage);
    expect(store.snapshot()).toBe(store.snapshot());
    live.save(L1, 1);
    const first = live.snapshot();
    expect(live.snapshot()).toBe(first);
    live.save(S1, 2);
    expect(live.snapshot()).not.toBe(first);
  });

  it("reads a damaged or foreign value as no saves, dropping bad entries", () => {
    expect(
      createDeviceSaveStore(() => memoryStorage("{not json")).snapshot(),
    ).toEqual([]);
    expect(
      createDeviceSaveStore(() =>
        memoryStorage('{"kind":"listing"}'),
      ).snapshot(),
    ).toEqual([]);
    const mixed = JSON.stringify([
      { kind: "listing", id: "l1", savedAt: 1 },
      { kind: "region", id: "r1", savedAt: 2 },
      { kind: "place", id: "", savedAt: 3 },
      { kind: "place", id: "s1", savedAt: 1e16 },
    ]);
    expect(
      createDeviceSaveStore(() => memoryStorage(mixed)).snapshot(),
    ).toEqual([{ kind: "listing", id: "l1", savedAt: 1 }]);
  });

  it("reports a write that storage refused, and reads nothing from it", () => {
    const blocked = createDeviceSaveStore(() => null);
    expect(blocked.save(L1, 1)).toBe(false);
    expect(blocked.snapshot()).toEqual([]);

    const throwing = createDeviceSaveStore(() => ({
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    }));
    expect(throwing.snapshot()).toEqual([]);
    expect(throwing.save(L1, 1)).toBe(false);
  });

  it("tells subscribers of every write and of other tabs' changes", () => {
    const store = inMemoryStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.save(L1, 1);
    store.changedElsewhere();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.remove(L1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("compacts the stored list to the entries it reads", () => {
    const storage = memoryStorage(
      JSON.stringify([
        { kind: "listing", id: "x".repeat(129), savedAt: 1 },
        { kind: "listing", id: " l1 ", savedAt: 2 },
      ]),
    );
    const store = createDeviceSaveStore(() => storage);
    expect(store.compact()).toBe(true);
    expect(JSON.parse(storage.raw() ?? "null")).toEqual([
      { kind: "listing", id: "l1", savedAt: 2 },
    ]);
    const clean = storage.raw();
    expect(store.compact()).toBe(true);
    expect(storage.raw()).toBe(clean);
  });

  it("drops exactly the entries a merged batch carried", () => {
    const store = inMemoryStore();
    store.save(L1, 1);
    store.save(S1, 2);
    const sent = store.snapshot();
    store.remove(L1);
    store.save(L1, 3);
    expect(store.drop(sent)).toBe(true);
    expect(store.snapshot()).toEqual([
      { kind: "listing", id: "l1", savedAt: 3 },
    ]);
  });
});

function storeWith(count: number) {
  const store = inMemoryStore();
  for (let i = 0; i < count; i++) {
    store.save({ kind: "listing", id: `l${i}` }, i + 1);
  }
  return store;
}

describe("createDeviceMerger", () => {
  it("sends the device saves in runs of 100 and empties the device", async () => {
    const store = storeWith(150);
    const sent: (readonly DeviceSave[])[] = [];
    const merger = createDeviceMerger(store, async (batch) => {
      expect(merger.status()).toEqual({ kind: "merging" });
      sent.push(batch);
    });
    await expect(merger.merge()).resolves.toBe("merged");
    expect(sent.map((batch) => batch.length)).toEqual([100, 50]);
    expect(store.snapshot()).toEqual([]);
    expect(merger.status()).toEqual({ kind: "idle" });
  });

  it("answers nothing to merge for an empty device", async () => {
    const send = vi.fn();
    const merger = createDeviceMerger(storeWith(0), send);
    await expect(merger.merge()).resolves.toBe("nothing");
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps a failed batch and the rest on the device, and retries them", async () => {
    const store = storeWith(150);
    let calls = 0;
    const merger = createDeviceMerger(store, async () => {
      calls += 1;
      if (calls === 2) throw new TypeError("Failed to fetch");
    });
    await expect(merger.merge()).resolves.toBe("failed");
    expect(store.snapshot()).toHaveLength(50);
    expect(merger.status()).toMatchObject({
      kind: "failed",
      error: { kind: "failed" },
    });

    await expect(merger.merge()).resolves.toBe("merged");
    expect(store.snapshot()).toEqual([]);
    expect(merger.status()).toEqual({ kind: "idle" });
  });

  it("merges the usable saves and clears broken entries from the device", async () => {
    const storage = memoryStorage(
      JSON.stringify([
        { kind: "listing", id: "l1", savedAt: 1 },
        { kind: "listing", id: "x".repeat(129), savedAt: 2 },
        { kind: "place", id: "  s1  ", savedAt: 3 },
        { kind: "place", id: "", savedAt: 4 },
      ]),
    );
    const store = createDeviceSaveStore(() => storage);
    const sent: (readonly DeviceSave[])[] = [];
    const merger = createDeviceMerger(store, async (batch) => {
      sent.push(batch);
    });
    await expect(merger.merge()).resolves.toBe("merged");
    expect(sent).toEqual([
      [
        { kind: "listing", id: "l1", savedAt: 1 },
        { kind: "place", id: "s1", savedAt: 3 },
      ],
    ]);
    expect(storage.raw()).toBeNull();
  });

  it("clears a device holding only broken entries without sending", async () => {
    const storage = memoryStorage(
      JSON.stringify([{ kind: "listing", id: " ", savedAt: 1 }]),
    );
    const send = vi.fn();
    const merger = createDeviceMerger(
      createDeviceSaveStore(() => storage),
      send,
    );
    await expect(merger.merge()).resolves.toBe("nothing");
    expect(send).not.toHaveBeenCalled();
    expect(storage.raw()).toBeNull();
  });

  it("drops the entries a transport refusal names and sends the rest again", async () => {
    const store = storeWith(3);
    const sent: (readonly DeviceSave[])[] = [];
    const merger = createDeviceMerger(store, async (batch) => {
      sent.push(batch);
      if (sent.length === 1) {
        throw new AppServerError({
          kind: "validation",
          code: "INVALID_INPUT",
          message: "Invalid input",
          retryable: false,
          fieldErrors: { "bookmarks.1.id": ["Too big"] },
        });
      }
    });
    await expect(merger.merge()).resolves.toBe("merged");
    expect(sent.map((batch) => batch.map((entry) => entry.id))).toEqual([
      ["l0", "l1", "l2"],
      ["l0", "l2"],
    ]);
    expect(store.snapshot()).toEqual([]);
  });

  it("keeps the batch when a refusal names no entry", async () => {
    const store = storeWith(2);
    const merger = createDeviceMerger(store, async () => {
      throw new AppServerError({
        kind: "validation",
        code: "INVALID_INPUT",
        message: "Invalid input",
        retryable: false,
        fieldErrors: { bookmarks: ["Too big"] },
      });
    });
    await expect(merger.merge()).resolves.toBe("failed");
    expect(store.snapshot()).toHaveLength(2);
  });

  it("keeps the saves when the account refuses for want of a login", async () => {
    const store = storeWith(3);
    const merger = createDeviceMerger(store, async () => {
      throw new UnauthorizedError("LOGIN_REQUIRED", "Login required");
    });
    await expect(merger.merge()).resolves.toBe("signedOut");
    expect(store.snapshot()).toHaveLength(3);
    expect(merger.status()).toEqual({ kind: "signedOut" });
  });

  it("fails rather than resend when the device cannot drop a merged batch", async () => {
    const storage = memoryStorage(
      JSON.stringify([{ kind: "listing", id: "l1", savedAt: 1 }]),
    );
    const readOnly: SaveStorage = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    const send = vi.fn(async () => {});
    const merger = createDeviceMerger(
      createDeviceSaveStore(() => readOnly),
      send,
    );
    await expect(merger.merge()).resolves.toBe("failed");
    expect(send).toHaveBeenCalledTimes(1);
    expect(merger.status()).toMatchObject({ kind: "failed" });
  });

  it("runs once for callers that arrive together, and reconciles once", async () => {
    const store = storeWith(2);
    let release: () => void = () => {};
    const send = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const merger = createDeviceMerger(store, send);
    const reconcile = vi.fn(async () => {});
    const first = merger.mergeAndReconcile(reconcile);
    const second = merger.mergeAndReconcile(reconcile);
    const third = merger.merge();
    release();
    await Promise.all([first, second, third]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("does not reconcile a run that merged nothing", async () => {
    const merger = createDeviceMerger(storeWith(0), async () => {});
    const reconcile = vi.fn(async () => {});
    await merger.mergeAndReconcile(reconcile);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("keeps saves made while a run is under way", async () => {
    const store = storeWith(1);
    const merger = createDeviceMerger(store, async () => {
      store.save(S1, 99);
    });
    await merger.merge();
    expect(store.snapshot()).toEqual([
      { kind: "place", id: "s1", savedAt: 99 },
    ]);
  });
});

describe("useDeviceSaves / useMergeStatus", () => {
  it("renders the unknown state on the server, whatever the device holds", () => {
    const store = storeWith(2);
    const merger = createDeviceMerger(store, async () => {});
    let seen: unknown = "unset";
    let status: unknown = "unset";
    function Probe() {
      seen = useDeviceSaves(store);
      status = useMergeStatus(merger);
      return null;
    }
    renderToString(createElement(Probe));
    expect(seen).toBeNull();
    expect(status).toEqual({ kind: "idle" });
  });
});
