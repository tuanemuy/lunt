import { Stewardship } from "@repo/core/domain/authority/stewardship";
import { Pagination } from "@repo/core/domain/common/pagination";
import { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type { Region } from "@repo/core/domain/region/region";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";

export type SearchRegionsForOperationInput = Readonly<{
  keyword: string;
  pagination: Pagination;
}>;

export type OperationRegionView = Readonly<{
  /** Name, publication and suspension are read off the region. */
  region: Region;
  /** Whether the region has a steward — without one the operator may stand in. */
  hasSteward: boolean;
}>;

export type OperationRegionsView = Readonly<{
  items: readonly OperationRegionView[];
  /** Every matching region, not just this page. */
  count: number;
}>;

/**
 * An operator searches every region by keyword — drafts, unpublished and
 * suspended ones included — most relevant first (REG-12, REG-13, MEM-01,
 * MOD-07). The text matched is `Region.searchableText`, ranked by
 * `KeywordRelevance`. Each hit says whether the region has a steward.
 *
 * - `ForbiddenError` (`operate_service`), decided before the input is
 *   looked at.
 * - A blank keyword reads nothing and returns no hits;
 *   `COMMON_INVALID_SEARCH_KEYWORD` over 100 characters;
 *   `COMMON_INVALID_INPUT` for a pagination out of bounds.
 */
export async function searchRegionsForOperation({
  container,
  actor,
  input,
}: ActorServiceArgs<SearchRegionsForOperationInput>): Promise<OperationRegionsView> {
  return container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const keyword = SearchKeyword.parse(input.keyword);
    const pagination = Pagination.create(input.pagination);
    if (keyword === null) return { items: [], count: 0 };
    const page = await ctx.regionRepository.searchForOperation(
      keyword,
      pagination,
    );
    const stewardships =
      page.items.length === 0
        ? []
        : await ctx.stewardshipRepository.findByTargets(
            page.items.map((region) => ({ kind: "region", id: region.id })),
          );
    const stewarded = new Set(
      stewardships
        .filter((stewardship) => !Stewardship.isVacant(stewardship))
        .map((stewardship) => stewardship.target.id),
    );
    return {
      items: page.items.map((region) => ({
        region,
        hasSteward: stewarded.has(region.id),
      })),
      count: page.count,
    };
  });
}
