import { CategoryId } from "@repo/core/domain/common/ids";
import {
  CategoryCatalog,
  INITIAL_CATEGORY_NAMES,
} from "@repo/core/domain/listing/categoryCatalog";
import { CategoryName } from "@repo/core/domain/listing/values";
import type { RequestContainer } from "../di/types";

/**
 * Opening procedure (F-11; `spec/usecases/listing.md`
 * 「provisionInitialCategories」; OPE-02): puts 「食べる」「買う」「体験」「見る」
 * into the empty catalog as active categories, in that order. Not called
 * from a screen — the opening runs it next to `establishFirstOperator`
 * (`POST /__ops/categories/provision`). Returns whether it wrote.
 *
 * Idempotent: a catalog that is not empty is left as it is. Two concurrent
 * runs race on the catalog's lock; the loser's `ConflictError` leaves the
 * winner's four categories.
 */
export async function provisionInitialCategories({
  container,
}: Readonly<{ container: RequestContainer }>): Promise<
  Readonly<{ provisioned: boolean }>
> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(
    async ({ categoryCatalogRepository }) => {
      const read = await categoryCatalogRepository.find();
      if (!CategoryCatalog.isEmpty(read.entity)) return { provisioned: false };
      const [first, ...rest] = INITIAL_CATEGORY_NAMES.map((name) => ({
        id: CategoryId.create(container.idGenerator.next()),
        name: CategoryName.create(name),
      }));
      if (first === undefined) return { provisioned: false };
      const { entity } = CategoryCatalog.establish(
        read.entity,
        [first, ...rest],
        now,
      );
      await categoryCatalogRepository.save(entity, read.expectedVersion);
      return { provisioned: true };
    },
  );
}
