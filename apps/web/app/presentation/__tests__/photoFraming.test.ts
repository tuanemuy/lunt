import { describe, expect, it } from "vitest";
import { photoPlacement } from "../photoFraming";

describe("photoPlacement", () => {
  it("needs no placement for a whole photo before its size is known", () => {
    expect(photoPlacement(null, null, 1)).toBeNull();
  });

  it("maps the framing onto the box before the size is known", () => {
    expect(
      photoPlacement({ x: 0.25, y: 0, width: 0.5, height: 1 }, null, 1),
    ).toEqual({ left: -50, top: -0, width: 200, height: 100 });
  });

  it("shows exactly a framing that already has the box's shape", () => {
    // 800×600 photo, a 600×600 framing starting 100px in, in a square box.
    const placement = photoPlacement(
      { x: 0.125, y: 0, width: 0.75, height: 1 },
      { width: 800, height: 600 },
      1,
    );
    expect(placement?.width).toBeCloseTo((800 / 600) * 100);
    expect(placement?.height).toBeCloseTo(100);
    expect(placement?.left).toBeCloseTo((-100 / 600) * 100);
    expect(placement?.top).toBeCloseTo(0);
  });

  it("crops a whole photo to cover the box around its centre", () => {
    const placement = photoPlacement(null, { width: 800, height: 600 }, 1);
    // The centred 600×600 square: 100px cut from each side.
    expect(placement?.width).toBeCloseTo((800 / 600) * 100);
    expect(placement?.left).toBeCloseTo((-100 / 600) * 100);
  });

  it("widens a framing to the box's shape and keeps it inside the photo", () => {
    // A square framing at the right edge of a 1000×500 photo, in a 2:1 box.
    const placement = photoPlacement(
      { x: 0.5, y: 0, width: 0.5, height: 1 },
      { width: 1000, height: 500 },
      2,
    );
    // The widened rectangle is the whole photo.
    expect(placement?.width).toBeCloseTo(100);
    expect(placement?.height).toBeCloseTo(100);
    expect(placement?.left).toBeCloseTo(0);
    expect(placement?.top).toBeCloseTo(0);
  });
});
