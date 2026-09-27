import type { CategoryId } from "@repo/core/domain/common/ids";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { activeCategoryList, type CategoryListView } from "./listCategories";

export type RetireCategoryInput = Readonly<{
  categoryId: CategoryId;
  /** Required even when no listing or application uses the category. */
  successorId: CategoryId;
}>;

/**
 * An operator retires an active category, naming the active category its
 * listings and applications move to (`spec/usecases/listing.md`
 * 「retireCategory」; OPE-03). Only the catalog is written: stored category
 * ids stay and resolve to the successor from the commit on, without moving
 * any listing's version. Emits `category.retired`; managers are told by
 * its consumer.
 *
 * - `ForbiddenError` (`operate_service`).
 * - `BusinessRuleError`, in this order: `LISTING_CATEGORY_NOT_FOUND`,
 *   `LISTING_CATEGORY_RETIRED`, `LISTING_CATEGORY_LAST_ONE`,
 *   `LISTING_CATEGORY_SUCCESSOR_INVALID`.
 * - `ConflictError` on a concurrent save of the catalog.
 */
export async function retireCategory({
  container,
  actor,
  input,
}: ActorServiceArgs<RetireCategoryInput>): Promise<CategoryListView> {
  const now = container.clock.now();
  const catalog = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const read = await ctx.categoryCatalogRepository.find();
    const { entity, eventDrafts } = CategoryCatalog.retire(
      read.entity,
      input.categoryId,
      input.successorId,
      now,
    );
    await ctx.categoryCatalogRepository.save(entity, read.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return entity;
  });
  return activeCategoryList(catalog);
}
