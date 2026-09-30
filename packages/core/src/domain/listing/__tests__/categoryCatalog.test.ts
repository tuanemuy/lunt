import { CategoryId } from "@repo/core/domain/common/ids";
import { isRehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import {
  catchError,
  expectBusinessError,
} from "../../common/__tests__/expectBusinessError";
import { LINE_BREAK_CASES } from "../../common/__tests__/lineBreakCases";
import { CategoryCatalog, INITIAL_CATEGORY_NAMES } from "../categoryCatalog";
import { CategoryName } from "../values";

const now = new Date("2026-07-10T00:00:00.000Z");
const EAT = CategoryId.create("c1");
const BUY = CategoryId.create("c2");
const EXPERIENCE = CategoryId.create("c3");
const SEE = CategoryId.create("c4");

const opening = (): CategoryCatalog =>
  CategoryCatalog.establish(
    CategoryCatalog.empty(),
    [
      { id: EAT, name: CategoryName.create(INITIAL_CATEGORY_NAMES[0]) },
      { id: BUY, name: CategoryName.create(INITIAL_CATEGORY_NAMES[1]) },
      { id: EXPERIENCE, name: CategoryName.create(INITIAL_CATEGORY_NAMES[2]) },
      { id: SEE, name: CategoryName.create(INITIAL_CATEGORY_NAMES[3]) },
    ],
    now,
  ).entity;

const retire = (c: CategoryCatalog, id: CategoryId, successor: CategoryId) =>
  CategoryCatalog.retire(c, id, successor, now).entity;

describe("CategoryCatalog", () => {
  it("establishes the empty catalog once, in the given order", () => {
    const catalog = opening();
    expect(CategoryCatalog.actives(catalog).map((c) => c.name)).toEqual([
      "食べる",
      "買う",
      "体験",
      "見る",
    ]);
    expect(catalog.version).toBe(1);
    expectBusinessError(
      () =>
        CategoryCatalog.establish(
          catalog,
          [{ id: CategoryId.create("c9"), name: CategoryName.create("x") }],
          now,
        ),
      "LISTING_CATEGORY_CATALOG_ESTABLISHED",
    );
  });

  it("adds at the end; a retired name may be reused, an active one or a taken id may not", () => {
    const retired = retire(opening(), EXPERIENCE, SEE);
    const added = CategoryCatalog.add(
      retired,
      { id: CategoryId.create("c5"), name: CategoryName.create("体験") },
      now,
    ).entity;
    expect(added.categories.at(-1)).toEqual({
      id: "c5",
      name: "体験",
      status: "active",
    });
    expectBusinessError(
      () =>
        CategoryCatalog.add(
          added,
          { id: CategoryId.create("c6"), name: CategoryName.create("買う") },
          now,
        ),
      "LISTING_CATEGORY_NAME_TAKEN",
    );
    expectBusinessError(
      () =>
        CategoryCatalog.add(
          added,
          { id: EXPERIENCE, name: CategoryName.create("泊まる") },
          now,
        ),
      "LISTING_CATEGORY_ID_TAKEN",
    );
  });

  it("renames an active category; the same name changes nothing", () => {
    const catalog = opening();
    expect(
      CategoryCatalog.rename(catalog, BUY, CategoryName.create("買う"), now)
        .entity,
    ).toBe(catalog);
    const renamed = CategoryCatalog.rename(
      catalog,
      BUY,
      CategoryName.create("買いもの"),
      now,
    ).entity;
    expect(renamed.categories[1]?.name).toBe("買いもの");
    expect(renamed.version).toBe(catalog.version + 1);
  });

  it("retire checks, in order: not found, retired, last one, successor", () => {
    const catalog = opening();
    expectBusinessError(
      () => retire(catalog, CategoryId.create("zz"), SEE),
      "LISTING_CATEGORY_NOT_FOUND",
    );
    const once = retire(catalog, EXPERIENCE, SEE);
    expectBusinessError(
      () => retire(once, EXPERIENCE, EAT),
      "LISTING_CATEGORY_RETIRED",
    );
    const lastOne = retire(retire(once, EAT, SEE), BUY, SEE);
    expectBusinessError(
      () => retire(lastOne, SEE, EXPERIENCE),
      "LISTING_CATEGORY_LAST_ONE",
    );
    expectBusinessError(
      () => retire(catalog, EAT, EAT),
      "LISTING_CATEGORY_SUCCESSOR_INVALID",
    );
    expectBusinessError(
      () => retire(once, EAT, EXPERIENCE),
      "LISTING_CATEGORY_SUCCESSOR_INVALID",
    );
  });

  it("retire emits category.retired", () => {
    const { eventDrafts } = CategoryCatalog.retire(
      opening(),
      EXPERIENCE,
      SEE,
      now,
    );
    expect(eventDrafts).toEqual([
      {
        type: "category.retired",
        payload: { categoryId: EXPERIENCE },
        occurredAt: now,
        aggregateId: EXPERIENCE,
      },
    ]);
  });

  it("resolve follows successors to an active category; predecessorsOf is its inverse", () => {
    const chained = retire(retire(opening(), EXPERIENCE, SEE), SEE, BUY);
    expect(CategoryCatalog.resolve(chained, EXPERIENCE).id).toBe(BUY);
    expect(CategoryCatalog.resolve(chained, SEE).id).toBe(BUY);
    expect([...CategoryCatalog.predecessorsOf(chained, BUY)].sort()).toEqual(
      [BUY, EXPERIENCE, SEE].sort(),
    );
    expect(CategoryCatalog.predecessorsOf(chained, SEE)).toEqual([
      SEE,
      EXPERIENCE,
    ]);
    expectBusinessError(
      () => CategoryCatalog.resolve(chained, CategoryId.create("zz")),
      "LISTING_CATEGORY_NOT_FOUND",
    );
    expectBusinessError(
      () => CategoryCatalog.requireActive(chained, SEE),
      "LISTING_CATEGORY_NOT_AVAILABLE",
    );
  });

  it("round-trips through snapshot / reconstruct and refuses broken invariants", () => {
    const catalog = retire(opening(), EXPERIENCE, SEE);
    expect(
      CategoryCatalog.reconstruct(CategoryCatalog.snapshot(catalog)),
    ).toEqual(catalog);
    const snapshot = CategoryCatalog.snapshot(catalog);
    const broken = [
      {
        ...snapshot,
        categories: snapshot.categories.map((c) =>
          c.id === SEE ? { ...c, name: "食べる" } : c,
        ),
      },
      {
        ...snapshot,
        categories: snapshot.categories.map((c) =>
          c.id === EXPERIENCE ? { ...c, successorId: "missing" } : c,
        ),
      },
      {
        ...snapshot,
        categories: snapshot.categories.map((c) =>
          c.id === EXPERIENCE ? { ...c, successorId: EXPERIENCE } : c,
        ),
      },
      {
        ...snapshot,
        categories: snapshot.categories.map((c) => ({
          ...c,
          status: "retired",
          successorId: EAT,
        })),
      },
    ];
    for (const value of broken) {
      expect(
        isRehydrationError(
          catchError(() => CategoryCatalog.reconstruct(value)),
        ),
      ).toBe(true);
    }
  });

  it.each(LINE_BREAK_CASES)("refuses a stored name with %s", (_label, c) => {
    const snapshot = CategoryCatalog.snapshot(opening());
    const broken = {
      ...snapshot,
      categories: snapshot.categories.map((category) =>
        category.id === SEE ? { ...category, name: `見${c}る` } : category,
      ),
    };
    expect(
      isRehydrationError(catchError(() => CategoryCatalog.reconstruct(broken))),
    ).toBe(true);
  });
});
