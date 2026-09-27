import { IdBatch } from "@repo/core/domain/common/idBatch";
import { Pagination } from "@repo/core/domain/common/pagination";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

describe("Pagination.create (page from 1, limit 1–100)", () => {
  it("accepts page 1 and limits 1 and 100, and a page past the end", () => {
    expect(Pagination.create({ page: 1, limit: 1 })).toEqual({
      page: 1,
      limit: 1,
    });
    expect(Pagination.create({ page: 1, limit: 100 })).toEqual({
      page: 1,
      limit: 100,
    });
    expect(Pagination.create({ page: 9999, limit: 20 }).page).toBe(9999);
  });

  it.each([
    { page: 0, limit: 20 },
    { page: -1, limit: 20 },
    { page: 1.5, limit: 20 },
    { page: Number.NaN, limit: 20 },
    { page: 1, limit: 0 },
    { page: 1, limit: 101 },
    { page: 1, limit: 2.5 },
    { page: 1, limit: Number.POSITIVE_INFINITY },
  ])("refuses %o with COMMON_INVALID_INPUT", (input) => {
    expectBusinessError(() => Pagination.create(input), "COMMON_INVALID_INPUT");
  });
});

describe("IdBatch.chunks", () => {
  it("splits in order into runs of at most 100", () => {
    const items = Array.from({ length: 201 }, (_, i) => i);
    const chunks = IdBatch.chunks(items);
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 1]);
    expect(chunks.flat()).toEqual(items);
    expect(IdBatch.chunks([])).toEqual([]);
  });
});
