import { BookmarkRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import { DeviceSaves } from "../deviceSaves";
import { bookmarkKit } from "./kit";

describe("DeviceSaves", () => {
  const L = { kind: "listing", id: "l-1" } as const;
  const P = { kind: "place", id: "l-1" } as const;
  const M = { kind: "listing", id: "m-1" } as const;
  const asRef = (e: typeof L | typeof P | typeof M) =>
    BookmarkRef.create(e.kind, e.id);

  it("keeps a saved target's time, and a removed one comes back as a new save", () => {
    let list = DeviceSaves.save([], asRef(L), 1);
    list = DeviceSaves.save(list, asRef(L), 5);
    expect(list).toEqual([{ ...L, savedAt: 1 }]);
    list = DeviceSaves.remove(list, asRef(L));
    expect(DeviceSaves.has(list, asRef(L))).toBe(false);
    expect(DeviceSaves.save(list, asRef(L), 9)).toEqual([{ ...L, savedAt: 9 }]);
  });

  it("orders newest first, listing before place, then id", () => {
    const list = [
      { ...M, savedAt: 1 },
      { ...P, savedAt: 2 },
      { ...L, savedAt: 2 },
    ];
    expect(DeviceSaves.ordered(list)).toEqual([
      { ...L, savedAt: 2 },
      { ...P, savedAt: 2 },
      { ...M, savedAt: 1 },
    ]);
  });

  it("parses a stored list, dropping malformed entries and duplicates", () => {
    expect(
      DeviceSaves.parse([
        { ...L, savedAt: 1 },
        { ...L, savedAt: 2 },
        { kind: "region", id: "r", savedAt: 1 },
        { kind: "place", id: " ", savedAt: 1 },
        { kind: "place", id: "p", savedAt: "x" },
        null,
      ]),
    ).toEqual([{ ...L, savedAt: 1 }]);
    expect(DeviceSaves.parse("nope")).toEqual([]);
  });

  it("splits into merge batches of 100 that merge into the account", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const now = k.clock.now().getTime();
    const list = Array.from({ length: 150 }, (_, i) => ({
      ...(i % 2 === 0 ? k.nowhereListing() : k.nowherePlace()),
      savedAt: now - i,
    }));
    const batches = DeviceSaves.batches(list);
    expect(batches.map((b) => b.length)).toEqual([100, 50]);
    for (const batch of batches) {
      await k.merge(A.actor, DeviceSaves.toDeviceBookmarks(batch));
    }
    const page = await k.list(A.actor);
    expect(page.count).toBe(150);
    expect(page.items.map((item) => item.target)).toEqual(
      DeviceSaves.refs(list).slice(0, 100),
    );
  });
});
