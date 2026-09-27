import { PhotoId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { RevisedPhotos } from "@repo/core/domain/common/revisedPhotos";
import { describe, expect, it } from "vitest";

const id = PhotoId.create;
type Framed = { photoId: PhotoId; framing: "square" | null };
const framed = (raw: string, framing: Framed["framing"] = null): Framed => ({
  photoId: id(raw),
  framing,
});
const set = (raws: readonly string[]) =>
  PhotoSet.of(
    raws.map((raw) => framed(raw)),
    "LISTING",
  );

describe("RevisedPhotos.between", () => {
  it("keeps desired order; photos already on the target are current, the rest added", () => {
    expect(
      RevisedPhotos.between(set(["a", "b", "c"]), set(["c", "x", "a"])),
    ).toEqual([
      { photoId: "c", framing: null, origin: "current" },
      { photoId: "x", framing: null, origin: "added" },
      { photoId: "a", framing: null, origin: "current" },
    ]);
  });

  it("carries per-photo data from desired", () => {
    const desired = PhotoSet.of([framed("a", "square")], "LISTING");
    expect(RevisedPhotos.between(set(["a"]), desired)).toEqual([
      { photoId: "a", framing: "square", origin: "current" },
    ]);
  });
});

describe("RevisedPhotos.overlay", () => {
  it("applies the revised order and strips origin", () => {
    const current = set(["a", "b"]);
    const revised = RevisedPhotos.between(current, set(["b", "x", "a"]));
    const result = RevisedPhotos.overlay(current, revised);
    expect(result.items).toEqual([framed("b"), framed("x"), framed("a")]);
  });

  it("photos removed from the target after submission do not come back", () => {
    const atSubmission = set(["a", "b", "c"]);
    const revised = RevisedPhotos.between(atSubmission, set(["c", "x", "a"]));
    const now = PhotoSet.takeDown(atSubmission, [id("a")], "LISTING");
    expect(PhotoSet.photoIds(RevisedPhotos.overlay(now, revised))).toEqual([
      "c",
      "x",
    ]);
  });

  it("added photos stay even if the target never had them", () => {
    const revised = RevisedPhotos.between(set([]), set(["x", "y"]));
    expect(PhotoSet.photoIds(RevisedPhotos.overlay(set([]), revised))).toEqual([
      "x",
      "y",
    ]);
  });

  it("goes through PhotoSet.replace: unchanged sequence keeps takenDown, changed clears it", () => {
    const takenDown = PhotoSet.takeDown(set(["a", "b"]), [id("b")], "LISTING");
    const same = RevisedPhotos.between(set(["a", "b"]), set(["a", "b"]));
    expect(RevisedPhotos.overlay(takenDown, same).takenDown).toBe(true);
    const changed = RevisedPhotos.between(set(["a"]), set(["a", "x"]));
    expect(RevisedPhotos.overlay(takenDown, changed).takenDown).toBe(false);
  });
});

describe("RevisedPhotos.addedPhotoIds", () => {
  it("is only the added photos, in revised order", () => {
    const revised = RevisedPhotos.between(set(["a"]), set(["y", "a", "x"]));
    expect(RevisedPhotos.addedPhotoIds(revised)).toEqual(["y", "x"]);
  });

  it("is empty when nothing was added", () => {
    expect(
      RevisedPhotos.addedPhotoIds(RevisedPhotos.between(set(["a"]), set([]))),
    ).toEqual([]);
  });
});
