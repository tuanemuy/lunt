import { Tagline } from "@repo/core/domain/common/tagline";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

const CODE = "COMMON_INVALID_TAGLINE";

describe("Tagline.create (trimmed, 1–60 characters)", () => {
  it("trims surrounding whitespace, full-width included", () => {
    expect(Tagline.create("　 港町の朝市 \n")).toBe("港町の朝市");
  });

  it("accepts exactly 1 and exactly 60 characters", () => {
    expect(Tagline.create("a")).toBe("a");
    expect(Tagline.create("あ".repeat(60))).toBe("あ".repeat(60));
  });

  it("rejects empty and whitespace-only input", () => {
    expectBusinessError(() => Tagline.create(""), CODE);
    expectBusinessError(() => Tagline.create(" 　\t"), CODE);
  });

  it("rejects 61 characters", () => {
    expectBusinessError(() => Tagline.create("あ".repeat(61)), CODE);
  });

  it("counts characters, not UTF-16 units (60 emoji are fine)", () => {
    expect(Tagline.create("😀".repeat(60))).toHaveLength(120);
  });

  it("length boundary holds for arbitrary padded text", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 80 }),
        fc.constantFrom("", " ", "　"),
        (n, pad) => {
          const input = `${pad}${"x".repeat(n)}${pad}`;
          if (n <= 60) {
            expect(Tagline.create(input)).toBe("x".repeat(n));
          } else {
            expectBusinessError(() => Tagline.create(input), CODE);
          }
        },
      ),
    );
  });
});
