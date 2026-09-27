import type { WithEventDrafts } from "@repo/core/domain/common/event";
import { CategoryId } from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { ListingErrorCode } from "./errorCode";
import { type CategoryRetiredEvent, ListingEvents } from "./events";
import { CategoryName } from "./values";

export type ActiveCategory = Readonly<{
  id: CategoryId;
  name: CategoryName;
  status: "active";
}>;

/** `successorId` was an active category when this one was retired. */
export type RetiredCategory = Readonly<{
  id: CategoryId;
  name: CategoryName;
  status: "retired";
  successorId: CategoryId;
}>;

export type Category = ActiveCategory | RetiredCategory;

/**
 * The service's one catalog of categories (retired ones included), in
 * creation order. Unique active names, the last active category and valid
 * successors are its invariants, guarded by its optimistic lock. Before
 * the opening it is empty; afterwards it always holds an active category.
 */
export type CategoryCatalog = Readonly<{
  categories: readonly Category[];
  version: Version;
  updatedAt: Date;
}>;

/** The categories provisioned at the opening, in this order (B-45). */
export const INITIAL_CATEGORY_NAMES = [
  "食べる",
  "買う",
  "体験",
  "見る",
] as const;

export type CategorySnapshot = Readonly<{
  id: string;
  name: string;
  status: string;
  successorId: string | null;
}>;

export type CategoryCatalogSnapshot = Readonly<{
  categories: readonly CategorySnapshot[];
  version: number;
  updatedAt: Date;
}>;

type Result = WithEventDrafts<CategoryCatalog, CategoryRetiredEvent>;

const rule = (code: ListingErrorCode, message: string) =>
  new BusinessRuleError(code, message);

// The empty catalog has never been written; the epoch keeps it a plain,
// deterministic value.
const EMPTY: CategoryCatalog = {
  categories: [],
  version: Version.initial(),
  updatedAt: new Date(0),
};

const find = (catalog: CategoryCatalog, id: CategoryId): Category | undefined =>
  catalog.categories.find((category) => category.id === id);

const actives = (catalog: CategoryCatalog): readonly ActiveCategory[] =>
  catalog.categories.filter(
    (category): category is ActiveCategory => category.status === "active",
  );

const nameTakenByActive = (
  catalog: CategoryCatalog,
  name: CategoryName,
  except: CategoryId | null,
): boolean =>
  actives(catalog).some(
    (category) => category.name === name && category.id !== except,
  );

const next = (
  catalog: CategoryCatalog,
  categories: readonly Category[],
  now: Date,
): CategoryCatalog => ({
  categories,
  version: Version.next(catalog.version),
  updatedAt: now,
});

function establish(
  catalog: CategoryCatalog,
  initial: readonly [
    Readonly<{ id: CategoryId; name: CategoryName }>,
    ...Readonly<{ id: CategoryId; name: CategoryName }>[],
  ],
  now: Date,
): Result {
  if (catalog.categories.length > 0) {
    throw rule(
      ListingErrorCode.CategoryCatalogEstablished,
      "The category catalog is already established",
    );
  }
  if (
    new Set(initial.map((category) => category.name)).size !== initial.length
  ) {
    throw rule(ListingErrorCode.CategoryNameTaken, "Duplicate category name");
  }
  if (new Set(initial.map((category) => category.id)).size !== initial.length) {
    throw rule(ListingErrorCode.CategoryIdTaken, "Duplicate category id");
  }
  return {
    entity: next(
      catalog,
      initial.map(
        (category): ActiveCategory => ({
          id: category.id,
          name: category.name,
          status: "active",
        }),
      ),
      now,
    ),
    eventDrafts: [],
  };
}

function add(
  catalog: CategoryCatalog,
  params: Readonly<{ id: CategoryId; name: CategoryName }>,
  now: Date,
): Result {
  if (nameTakenByActive(catalog, params.name, null)) {
    throw rule(ListingErrorCode.CategoryNameTaken, "Duplicate category name");
  }
  if (find(catalog, params.id) !== undefined) {
    throw rule(ListingErrorCode.CategoryIdTaken, "Duplicate category id");
  }
  const added: ActiveCategory = {
    id: params.id,
    name: params.name,
    status: "active",
  };
  return {
    entity: next(catalog, [...catalog.categories, added], now),
    eventDrafts: [],
  };
}

const requireListed = (catalog: CategoryCatalog, id: CategoryId): Category => {
  const category = find(catalog, id);
  if (category === undefined) {
    throw rule(ListingErrorCode.CategoryNotFound, "Category not found");
  }
  return category;
};

function rename(
  catalog: CategoryCatalog,
  id: CategoryId,
  name: CategoryName,
  now: Date,
): Result {
  const category = requireListed(catalog, id);
  if (category.status === "retired") {
    throw rule(ListingErrorCode.CategoryRetired, "Category is retired");
  }
  if (category.name === name) return { entity: catalog, eventDrafts: [] };
  if (nameTakenByActive(catalog, name, id)) {
    throw rule(ListingErrorCode.CategoryNameTaken, "Duplicate category name");
  }
  return {
    entity: next(
      catalog,
      catalog.categories.map((c) => (c.id === id ? { ...category, name } : c)),
      now,
    ),
    eventDrafts: [],
  };
}

/** Checks, in order: not listed, already retired, the last active one, an invalid successor. */
function retire(
  catalog: CategoryCatalog,
  id: CategoryId,
  successorId: CategoryId,
  now: Date,
): Result {
  const category = requireListed(catalog, id);
  if (category.status === "retired") {
    throw rule(ListingErrorCode.CategoryRetired, "Category is retired");
  }
  if (actives(catalog).length === 1) {
    throw rule(
      ListingErrorCode.CategoryLastOne,
      "The last active category cannot be retired",
    );
  }
  const successor = find(catalog, successorId);
  if (
    successorId === id ||
    successor === undefined ||
    successor.status !== "active"
  ) {
    throw rule(
      ListingErrorCode.CategorySuccessorInvalid,
      "The successor must be another active category",
    );
  }
  const retired: RetiredCategory = {
    id,
    name: category.name,
    status: "retired",
    successorId,
  };
  return {
    entity: next(
      catalog,
      catalog.categories.map((c) => (c.id === id ? retired : c)),
      now,
    ),
    eventDrafts: [ListingEvents.categoryRetired(id, now)],
  };
}

/** Throws `LISTING_CATEGORY_NOT_AVAILABLE` unless `id` is an active category. */
function requireActive(
  catalog: CategoryCatalog,
  id: CategoryId,
): ActiveCategory {
  const category = find(catalog, id);
  if (category === undefined || category.status !== "active") {
    throw rule(
      ListingErrorCode.CategoryNotAvailable,
      "The category is not available",
    );
  }
  return category;
}

/**
 * The active category `id` stands for: itself, or the end of its
 * successor chain (O-06). Throws `LISTING_CATEGORY_NOT_FOUND` for an id the
 * catalog never had.
 */
function resolve(catalog: CategoryCatalog, id: CategoryId): ActiveCategory {
  let category = requireListed(catalog, id);
  const seen = new Set<CategoryId>();
  while (category.status === "retired") {
    if (seen.has(category.id)) {
      throw new RehydrationError(`Successor chain of ${id} loops`);
    }
    seen.add(category.id);
    category = requireListed(catalog, category.successorId);
  }
  return category;
}

/** `resolve`, but `null` for a `null` or unlisted id. */
function resolveOrNull(
  catalog: CategoryCatalog,
  id: CategoryId | null,
): ActiveCategory | null {
  if (id === null || find(catalog, id) === undefined) return null;
  return resolve(catalog, id);
}

/**
 * Every id whose successor chain reaches `id`, `id` included — what a
 * filter by `id` must match among stored category ids.
 */
function predecessorsOf(
  catalog: CategoryCatalog,
  id: CategoryId,
): readonly CategoryId[] {
  const result: CategoryId[] = [id];
  const reached = new Set<CategoryId>([id]);
  let grown = true;
  while (grown) {
    grown = false;
    for (const category of catalog.categories) {
      if (
        category.status === "retired" &&
        !reached.has(category.id) &&
        reached.has(category.successorId)
      ) {
        reached.add(category.id);
        result.push(category.id);
        grown = true;
      }
    }
  }
  return result;
}

function reconstruct(snapshot: CategoryCatalogSnapshot): CategoryCatalog {
  try {
    const categories = snapshot.categories.map((raw): Category => {
      const id = CategoryId.create(raw.id);
      const name = CategoryName.create(raw.name);
      if (name !== raw.name) throw new Error(`Unnormalised name of ${raw.id}`);
      if (raw.status === "active" && raw.successorId === null) {
        return { id, name, status: "active" };
      }
      if (raw.status === "retired" && raw.successorId !== null) {
        return {
          id,
          name,
          status: "retired",
          successorId: CategoryId.create(raw.successorId),
        };
      }
      throw new Error(`Category ${raw.id} has status ${raw.status}`);
    });
    const catalog: CategoryCatalog = {
      categories,
      version: Version.create(snapshot.version),
      updatedAt: snapshot.updatedAt,
    };
    if (new Set(categories.map((c) => c.id)).size !== categories.length) {
      throw new Error("Duplicate category id");
    }
    const activeNames = actives(catalog).map((c) => c.name);
    if (new Set(activeNames).size !== activeNames.length) {
      throw new Error("Duplicate active category name");
    }
    if (categories.length > 0 && activeNames.length === 0) {
      throw new Error("An established catalog has no active category");
    }
    for (const category of categories) {
      if (category.status !== "retired") continue;
      if (category.successorId === category.id) {
        throw new Error(`Category ${category.id} succeeds itself`);
      }
      resolve(catalog, category.id);
    }
    return catalog;
  } catch (error) {
    throw new RehydrationError(
      "Stored category catalog violates invariants",
      error,
    );
  }
}

const snapshot = (catalog: CategoryCatalog): CategoryCatalogSnapshot => ({
  categories: catalog.categories.map((category) => ({
    id: category.id,
    name: category.name,
    status: category.status,
    successorId: category.status === "retired" ? category.successorId : null,
  })),
  version: catalog.version,
  updatedAt: catalog.updatedAt,
});

export const CategoryCatalog = {
  empty: (): CategoryCatalog => EMPTY,
  isEmpty: (catalog: CategoryCatalog): boolean =>
    catalog.categories.length === 0,
  find,
  establish,
  add,
  rename,
  retire,
  actives,
  requireActive,
  resolve,
  resolveOrNull,
  predecessorsOf,
  reconstruct,
  snapshot,
};
