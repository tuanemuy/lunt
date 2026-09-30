import {
  AreaSelection,
  type AreaSelectionInput,
} from "@repo/core/domain/area/areaSelection";
import { CategoryId } from "@repo/core/domain/common/ids";
import {
  BrowseCriteria,
  type ResolvedCriteria,
} from "@repo/core/domain/discovery/browseCriteria";
import type { RequestContainer } from "../di/types";

/** The browse conditions as they arrive from the transport. */
export type BrowseCriteriaInput = Readonly<{
  areas: readonly AreaSelectionInput[];
  categoryIds: readonly string[];
}>;

/**
 * Builds the criteria (`AreaSelection.create`, `CategoryId.create`), expands
 * the areas with `AreaCatalog.expand` outside any unit of work, reads the
 * category catalog in one non-writing `run`, and resolves them with
 * `BrowseCriteria.resolve` (`spec/usecases/discovery.md` 「共通の組み立て」).
 * Retired and unknown categories drop out without an error.
 *
 * @throws BusinessRuleError for a malformed area or category code (the
 *   value objects' codes).
 */
export async function resolveBrowseCriteria(
  container: Pick<RequestContainer, "areaCatalog" | "unitOfWorkProvider">,
  input: BrowseCriteriaInput,
): Promise<ResolvedCriteria> {
  const criteria: BrowseCriteria = {
    areas: input.areas.map(AreaSelection.create),
    categoryIds: input.categoryIds.map(CategoryId.create),
  };
  const areas = AreaSelection.dedupe(criteria.areas);
  const expanded =
    areas.length === 0
      ? new Set<never>()
      : await container.areaCatalog.expand(areas);
  const catalog = await container.unitOfWorkProvider.run(
    ({ categoryCatalogRepository }) => categoryCatalogRepository.find(),
  );
  return BrowseCriteria.resolve(criteria, expanded, catalog.entity);
}
