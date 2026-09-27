import type { CategoryId } from "@repo/core/domain/common/ids";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import { CategoryName } from "@repo/core/domain/listing/values";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { activeCategoryList, type CategoryListView } from "./listCategories";

export type RenameCategoryInput = Readonly<{
  categoryId: CategoryId;
  name: string;
}>;

/**
 * An operator renames an active category (`spec/usecases/listing.md`
 * 「renameCategory」; OPE-02). Listings are not written: they read the new
 * name through the catalog. The same name writes nothing. No domain event.
 *
 * - `ForbiddenError` (`operate_service`).
 * - `BusinessRuleError`: `LISTING_INVALID_CATEGORY_NAME`,
 *   `LISTING_CATEGORY_NOT_FOUND`, `LISTING_CATEGORY_RETIRED`,
 *   `LISTING_CATEGORY_NAME_TAKEN`.
 * - `ConflictError` on a concurrent save of the catalog.
 */
export async function renameCategory({
  container,
  actor,
  input,
}: ActorServiceArgs<RenameCategoryInput>): Promise<CategoryListView> {
  const name = CategoryName.create(input.name);
  const now = container.clock.now();
  const catalog = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const read = await ctx.categoryCatalogRepository.find();
    const { entity } = CategoryCatalog.rename(
      read.entity,
      input.categoryId,
      name,
      now,
    );
    if (entity !== read.entity) {
      await ctx.categoryCatalogRepository.save(entity, read.expectedVersion);
    }
    return entity;
  });
  return activeCategoryList(catalog);
}
