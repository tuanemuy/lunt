import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { CategoryCatalog } from "../categoryCatalog";

/**
 * The service's one category catalog (`spec/domains/listing.md`
 * 「CategoryCatalogRepository」): no id, no `insert` / `delete`.
 *
 * - `find`: the stored catalog, or — before anything is stored — the empty
 *   catalog (`CategoryCatalog.empty()`) with a token that saves only while
 *   nothing is stored. Never `null`.
 * - `save`: `ConflictError` when the stored version differs from the token
 *   (two concurrent openings: one conflicts). Names, the last category and
 *   successors are the aggregate's invariants, not the port's.
 */
export interface CategoryCatalogRepository {
  find(): Promise<Versioned<CategoryCatalog>>;
  save(
    catalog: CategoryCatalog,
    expectedVersion: ExpectedVersion<CategoryCatalog>,
  ): Promise<void>;
}
