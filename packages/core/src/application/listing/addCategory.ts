import { CategoryId } from "@repo/core/domain/common/ids";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import { CategoryName } from "@repo/core/domain/listing/values";
import { authorizeRole } from "../authority/access";
import { ConflictError } from "../errors";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import { activeCategoryList, type CategoryListView } from "./listCategories";

export type AddCategoryInput = Readonly<{
  /** Minted by the caller and resent unchanged on failure. */
  categoryId: GeneratedId;
  name: string;
}>;

/** The id is taken by another category or by a retired one. */
export const CATEGORY_ID_CONFLICT = "CATEGORY_ID_CONFLICT";

/**
 * An operator adds an active category at the end of the catalog
 * (`spec/usecases/listing.md` 「addCategory」; OPE-02). A retired
 * category's name may be reused. No domain event.
 *
 * Idempotent create: when the id is in the catalog as an active category
 * of the same name, succeeds without writing; any other category of that
 * id is a `ConflictError`.
 *
 * - `ForbiddenError` (`operate_service`, also when revoked before the commit).
 * - `BusinessRuleError`: `LISTING_INVALID_CATEGORY_NAME`,
 *   `LISTING_CATEGORY_NAME_TAKEN`.
 * - `ConflictError` on a concurrent save of the catalog.
 */
export async function addCategory({
  container,
  actor,
  input,
}: ActorServiceArgs<AddCategoryInput>): Promise<CategoryListView> {
  const name = CategoryName.create(input.name);
  const id = CategoryId.create(input.categoryId);
  const now = container.clock.now();
  const catalog = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const read = await ctx.categoryCatalogRepository.find();
    const existing = CategoryCatalog.find(read.entity, id);
    if (existing !== undefined) {
      if (existing.status !== "active" || existing.name !== name) {
        throw new ConflictError(
          CATEGORY_ID_CONFLICT,
          "The category id is already used for another category",
        );
      }
      return read.entity;
    }
    const { entity } = CategoryCatalog.add(read.entity, { id, name }, now);
    await ctx.categoryCatalogRepository.save(entity, read.expectedVersion);
    return entity;
  });
  return activeCategoryList(catalog);
}
