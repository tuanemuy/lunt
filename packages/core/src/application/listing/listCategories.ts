import {
  type ActiveCategory,
  CategoryCatalog,
} from "@repo/core/domain/listing/categoryCatalog";
import type { RequestContainer } from "../di/types";

export type CategoryListView = readonly Readonly<{
  id: ActiveCategory["id"];
  name: string;
}>[];

export const activeCategoryList = (
  catalog: CategoryCatalog,
): CategoryListView =>
  CategoryCatalog.actives(catalog).map((category) => ({
    id: category.id,
    name: category.name,
  }));

/**
 * The active categories in creation order — one level, retired ones left
 * out (`spec/usecases/listing.md` 「listCategories」; OPE-02, LST-01,
 * LST-12, LST-13, DIS-03). Empty before the opening. No actor needed.
 */
export async function listCategories({
  container,
}: Readonly<{ container: RequestContainer }>): Promise<CategoryListView> {
  const catalog = await container.unitOfWorkProvider.run(
    ({ categoryCatalogRepository }) => categoryCatalogRepository.find(),
  );
  return activeCategoryList(catalog.entity);
}
