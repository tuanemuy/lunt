import { Stewardship } from "@repo/core/domain/authority/stewardship";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { OccasionId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { Pagination } from "@repo/core/domain/common/pagination";
import type { Publication } from "@repo/core/domain/common/publication";
import { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type { HoldingStatus } from "@repo/core/domain/occasion/holdingStatus";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type { OccasionName } from "@repo/core/domain/occasion/values";
import { authorizeRole } from "../authority/access";
import type { ActorServiceArgs } from "../types";
import { occasionRef } from "./managedOccasion";

export type SearchOccasionsForOperationInput = Readonly<{
  keyword: string;
  pagination: Pagination;
}>;

export type OperationOccasionView = Readonly<{
  id: OccasionId;
  name: OccasionName | null;
  publication: Publication;
  suspended: boolean;
  holdingStatus: HoldingStatus | null;
  /** Whether it has an occasion operator — without one the operator may stand in. */
  hasSteward: boolean;
}>;

export type OperationOccasionsView = Readonly<{
  items: readonly OperationOccasionView[];
  count: number;
}>;

/**
 * An operator searches every occasion by keyword — drafts, unpublished,
 * suspended, ended and cancelled ones included — most relevant first
 * (`spec/usecases/occasion.md` 「searchOccasionsForOperation」; EVT-12,
 * EVT-13, MEM-01, MOD-07). Each hit carries its states and whether it has
 * an occasion operator.
 *
 * - `ForbiddenError` (`operate_service`), decided before the input is
 *   looked at.
 * - A blank keyword reads nothing and returns no hits;
 *   `COMMON_INVALID_SEARCH_KEYWORD` over 100 characters;
 *   `COMMON_INVALID_INPUT` for a pagination out of bounds.
 */
export async function searchOccasionsForOperation({
  container,
  actor,
  input,
}: ActorServiceArgs<SearchOccasionsForOperationInput>): Promise<OperationOccasionsView> {
  const today = LocalDate.fromInstant(container.clock.now());
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const keyword = SearchKeyword.parse(input.keyword);
    const pagination = Pagination.create(input.pagination);
    if (keyword === null) return null;
    const page = await ctx.occasionRepository.searchForOperation(
      keyword,
      pagination,
    );
    const stewardships = (
      await Promise.all(
        IdBatch.chunks(page.items.map((occasion) => occasion.id)).map((ids) =>
          ctx.stewardshipRepository.findByTargets(ids.map(occasionRef)),
        ),
      )
    ).flat();
    return { page, stewardships };
  });
  if (read === null) return { items: [], count: 0 };
  const stewarded = new Set<string>(
    read.stewardships
      .filter((stewardship) => !Stewardship.isVacant(stewardship))
      .map((stewardship) => stewardship.target.id),
  );
  return {
    items: read.page.items.map(
      (occasion): OperationOccasionView => ({
        id: occasion.id,
        name: occasion.content.name,
        publication: occasion.publication,
        suspended: occasion.suspension.suspended,
        holdingStatus: Occasion.holdingStatus(occasion, today),
        hasSteward: stewarded.has(occasion.id),
      }),
    ),
    count: read.page.count,
  };
}
