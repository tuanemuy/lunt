import { ExposureSubject } from "@repo/core/domain/common/exposureSubject";
import { PhotoId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

const id = PhotoId.create;
const photo = (raw: string) => ({ photoId: id(raw) });
type Framed = { photoId: PhotoId; framing: "square" | null };
const framed = (raw: string, framing: Framed["framing"] = null): Framed => ({
  photoId: id(raw),
  framing,
});
const ids = (set: PhotoSet<{ photoId: PhotoId }>) => PhotoSet.photoIds(set);

describe("PhotoSet.of", () => {
  it("keeps order (first is the cover) and starts with takenDown false", () => {
    const set = PhotoSet.of([photo("b"), photo("a"), photo("c")], "PLACE");
    expect(ids(set)).toEqual(["b", "a", "c"]);
    expect(set.takenDown).toBe(false);
  });

  it("accepts an empty list", () => {
    expect(PhotoSet.of([], "REGION").items).toEqual([]);
  });

  it("carries extra per-photo data (listing framing)", () => {
    const set = PhotoSet.of([framed("a", "square"), framed("b")], "LISTING");
    expect(set.items).toEqual([
      { photoId: "a", framing: "square" },
      { photoId: "b", framing: null },
    ]);
  });

  it.each(ExposureSubject.all)(
    "a repeated PhotoId is %s_DUPLICATE_PHOTO",
    (subject) => {
      expectBusinessError(
        () => PhotoSet.of([photo("a"), photo("b"), photo("a")], subject),
        `${subject}_DUPLICATE_PHOTO`,
      );
    },
  );

  it("duplicates are detected by PhotoId even when other data differs", () => {
    expectBusinessError(
      () => PhotoSet.of([framed("a", "square"), framed("a")], "LISTING"),
      "LISTING_DUPLICATE_PHOTO",
    );
  });
});

describe("PhotoSet.replace", () => {
  const takenDown = PhotoSet.takeDown(
    PhotoSet.of([photo("a"), photo("b"), photo("c")], "PLACE"),
    [id("c")],
    "PLACE",
  );

  it("same PhotoId sequence keeps takenDown", () => {
    const next = PhotoSet.replace(takenDown, [photo("a"), photo("b")]);
    expect(next.takenDown).toBe(true);
    expect(ids(next)).toEqual(["a", "b"]);
  });

  it("same sequence with other per-photo data changed still keeps takenDown", () => {
    const base = PhotoSet.takeDown(
      PhotoSet.of([framed("a"), framed("b")], "LISTING"),
      [id("b")],
      "LISTING",
    );
    const next = PhotoSet.replace(base, [framed("a", "square")]);
    expect(next.takenDown).toBe(true);
    expect(next.items).toEqual([{ photoId: "a", framing: "square" }]);
  });

  it.each([
    ["reordered", ["b", "a"]],
    ["one removed", ["a"]],
    ["one added", ["a", "b", "d"]],
    ["emptied", []],
  ])("a different sequence (%s) clears takenDown", (_label, next) => {
    const result = PhotoSet.replace(takenDown, next.map(photo));
    expect(result.takenDown).toBe(false);
    expect(ids(result)).toEqual(next);
  });

  it("keeps takenDown false when it was false", () => {
    const base = PhotoSet.of([photo("a")], "REGION");
    expect(PhotoSet.replace(base, [photo("a")]).takenDown).toBe(false);
  });

  it("rejects a repeated PhotoId as COMMON_INVALID_INPUT", () => {
    expectBusinessError(
      () => PhotoSet.replace(takenDown, [photo("a"), photo("a")]),
      "COMMON_INVALID_INPUT",
    );
  });
});

describe("PhotoSet.takeDown", () => {
  const base = PhotoSet.of(
    [photo("a"), photo("b"), photo("c"), photo("d")],
    "ARTICLE",
  );

  it("removes every listed photo, keeps the rest in order, sets takenDown", () => {
    const result = PhotoSet.takeDown(base, [id("c"), id("a")], "ARTICLE");
    expect(ids(result)).toEqual(["b", "d"]);
    expect(result.takenDown).toBe(true);
  });

  it("removing the cover promotes the next photo", () => {
    expect(ids(PhotoSet.takeDown(base, [id("a")], "ARTICLE"))[0]).toBe("b");
  });

  it("removing every photo leaves an empty, takenDown set", () => {
    const result = PhotoSet.takeDown(
      base,
      [id("a"), id("b"), id("c"), id("d")],
      "ARTICLE",
    );
    expect(result.items).toEqual([]);
    expect(result.takenDown).toBe(true);
  });

  it.each(ExposureSubject.all)(
    "an id not in the set is %s_PHOTO_NOT_FOUND and nothing is removed",
    (subject) => {
      expectBusinessError(
        () => PhotoSet.takeDown(base, [id("a"), id("zzz")], subject),
        `${subject}_PHOTO_NOT_FOUND`,
      );
      expect(ids(base)).toEqual(["a", "b", "c", "d"]);
      expect(base.takenDown).toBe(false);
    },
  );

  it("order of the remaining photos is preserved for any removal subset", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z0-9]{1,8}$/), {
          minLength: 1,
          maxLength: 10,
        }),
        fc.nat(),
        (raws, seed) => {
          const set = PhotoSet.of(raws.map(photo), "PLACE");
          const pick = raws.filter((_, i) => (seed >> i) & 1 || i === 0);
          const result = PhotoSet.takeDown(
            set,
            pick.map(id) as [PhotoId, ...PhotoId[]],
            "PLACE",
          );
          expect(ids(result)).toEqual(raws.filter((r) => !pick.includes(r)));
        },
      ),
    );
  });
});

describe("PhotoSet helpers", () => {
  it("reconstruct restores takenDown and still rejects duplicates", () => {
    const set = PhotoSet.reconstruct([photo("a")], true, "OCCASION");
    expect(set.takenDown).toBe(true);
    expectBusinessError(
      () => PhotoSet.reconstruct([photo("a"), photo("a")], false, "OCCASION"),
      "OCCASION_DUPLICATE_PHOTO",
    );
  });

  it("removedPhotoIds lists what a save releases, in the old order", () => {
    const before = PhotoSet.of([photo("a"), photo("b"), photo("c")], "REGION");
    const after = PhotoSet.replace(before, [photo("c"), photo("d")]);
    expect(PhotoSet.removedPhotoIds(before, after)).toEqual(["a", "b"]);
    expect(PhotoSet.removedPhotoIds(after, before)).toEqual(["d"]);
  });

  it("isEmpty", () => {
    expect(PhotoSet.isEmpty(PhotoSet.of([], "PLACE"))).toBe(true);
    expect(PhotoSet.isEmpty(PhotoSet.of([photo("a")], "PLACE"))).toBe(false);
  });
});
