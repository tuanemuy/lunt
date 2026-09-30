import { describe, expect, it } from "vitest";
import {
  mergeDeviceSavesSchema,
  SAVE_BATCH_MAX,
  savedPageSchema,
  saveTargetSchema,
  saveTargetsSchema,
} from "../bookmark";
import { classifyError } from "../errorState";
import { accountSaved, saveKey } from "../savedView";
import { validateInput } from "../validator";

const LISTING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

const rejects = (run: () => unknown): string[] => {
  try {
    run();
  } catch (error) {
    const state = classifyError(error);
    expect(state.kind).toBe("invalidInput");
    return state.kind === "invalidInput" ? Object.keys(state.fieldErrors) : [];
  }
  throw new Error("expected the input to be rejected");
};

describe("saveTargetSchema", () => {
  const validate = validateInput(saveTargetSchema);

  it("accepts a listing or a place with a trimmed id", () => {
    expect(validate({ kind: "listing", id: ` ${LISTING_ID} ` })).toEqual({
      kind: "listing",
      id: LISTING_ID,
    });
    expect(validate({ kind: "place", id: "p1" })).toEqual({
      kind: "place",
      id: "p1",
    });
  });

  it("refuses another kind, a blank id and an id over 128 characters", () => {
    expect(rejects(() => validate({ kind: "region", id: "r1" }))).toEqual([
      "kind",
    ]);
    expect(rejects(() => validate({ kind: "listing", id: "   " }))).toEqual([
      "id",
    ]);
    expect(
      rejects(() => validate({ kind: "listing", id: "x".repeat(129) })),
    ).toEqual(["id"]);
    expect(validate({ kind: "listing", id: "x".repeat(128) }).id).toHaveLength(
      128,
    );
  });
});

describe("saveTargetsSchema", () => {
  const validate = validateInput(saveTargetsSchema);
  const targets = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ kind: "place", id: `p${i}` }));

  it("takes 0 to 100 targets", () => {
    expect(validate({ targets: [] }).targets).toEqual([]);
    expect(validate({ targets: targets(SAVE_BATCH_MAX) }).targets).toHaveLength(
      100,
    );
  });

  it("refuses more than 100 targets", () => {
    expect(rejects(() => validate({ targets: targets(101) }))).toEqual([
      "targets",
    ]);
  });
});

describe("mergeDeviceSavesSchema", () => {
  const validate = validateInput(mergeDeviceSavesSchema);
  const save = (overrides: Record<string, unknown> = {}) => ({
    kind: "listing",
    id: LISTING_ID,
    savedAt: 1_760_000_000_000,
    ...overrides,
  });

  it("accepts a batch of device saves as the browser keeps them", () => {
    expect(
      validate({ bookmarks: [save(), save({ kind: "place", id: "p1" })] }),
    ).toEqual({
      bookmarks: [save(), save({ kind: "place", id: "p1" })],
    });
    expect(validate({ bookmarks: [] }).bookmarks).toEqual([]);
  });

  it("refuses a bad kind, a blank or overlong id", () => {
    expect(
      rejects(() => validate({ bookmarks: [save({ kind: "occasion" })] })),
    ).toEqual(["bookmarks.0.kind"]);
    expect(
      rejects(() => validate({ bookmarks: [save(), save({ id: "" })] })),
    ).toEqual(["bookmarks.1.id"]);
    expect(
      rejects(() => validate({ bookmarks: [save({ id: "x".repeat(129) })] })),
    ).toEqual(["bookmarks.0.id"]);
  });

  it("refuses a time that is not a number a Date can hold", () => {
    for (const savedAt of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      8.64e15 + 1,
      -8.64e15 - 1,
      "1760000000000",
      null,
    ]) {
      expect(
        rejects(() => validate({ bookmarks: [save({ savedAt })] })),
      ).toEqual(["bookmarks.0.savedAt"]);
    }
    expect(
      validate({ bookmarks: [save({ savedAt: 8.64e15 })] }).bookmarks[0]
        ?.savedAt,
    ).toBe(8.64e15);
  });

  it("refuses more than 100 saves in one call", () => {
    const batch = Array.from({ length: 101 }, (_, i) => save({ id: `l${i}` }));
    expect(rejects(() => validate({ bookmarks: batch }))).toEqual([
      "bookmarks",
    ]);
    expect(
      validate({ bookmarks: batch.slice(0, SAVE_BATCH_MAX) }).bookmarks,
    ).toHaveLength(100);
  });
});

describe("savedPageSchema", () => {
  const validate = validateInput(savedPageSchema);

  it("takes a page from 1", () => {
    expect(validate({ page: 2 })).toEqual({ page: 2 });
    expect(rejects(() => validate({ page: 0 }))).toEqual(["page"]);
    expect(rejects(() => validate({ page: 1.5 }))).toEqual(["page"]);
  });
});

describe("SaveState", () => {
  const target = { kind: "listing", id: LISTING_ID } as const;

  it("answers from the account when signed in, and leaves it to the device otherwise", () => {
    expect(saveKey(target)).toBe(`listing:${LISTING_ID}`);
    expect(accountSaved({ signedIn: false }, target)).toBeNull();
    expect(
      accountSaved({ signedIn: true, saved: [saveKey(target)] }, target),
    ).toBe(true);
    expect(
      accountSaved({ signedIn: true, saved: [`place:${LISTING_ID}`] }, target),
    ).toBe(false);
  });
});
