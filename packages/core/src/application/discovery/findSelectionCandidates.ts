import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { PlaceId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type { PlaceEntry, Scored } from "@repo/core/domain/discovery/entry";
import type { SelectionScope } from "@repo/core/domain/discovery/selectionScope";
import {
  type ListingSummary,
  type OccasionSummary,
  type PlaceSummary,
  type RegionSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import type { RequestContainer } from "../di/types";
import type { ServiceArgs } from "../types";
import {
  listingSummaryPhotoIds,
  occasionSummaryPhotoIds,
  type PhotoRefs,
  photoRefsOf,
  placeSummaryPhotoIds,
  regionSummaryPhotoIds,
  todayOf,
} from "./views";

export type FindSelectionCandidatesInput = Readonly<{
  /** The range the calling screen's operation sets (`SelectionScope`). */
  scope: SelectionScope;
  /** Raw text; blank finds nothing (`SearchKeyword.parse`). */
  keyword: string;
  pagination: Pagination;
}>;

/** A place candidate and whether it has no steward. */
export type PlaceCandidate = Readonly<{
  summary: PlaceSummary;
  placeIsVacant: boolean;
}>;

/**
 * The candidates of the scope's kind, by relevance, each with its standing
 * (reference scene), and the total inside the scope.
 */
export type SelectionCandidates =
  | Readonly<{ kind: "place"; items: readonly PlaceCandidate[]; count: number }>
  | Readonly<{
      kind: "listing";
      items: readonly ListingSummary[];
      count: number;
    }>
  | Readonly<{ kind: "region"; items: readonly RegionSummary[]; count: number }>
  | Readonly<{
      kind: "occasion";
      items: readonly OccasionSummary[];
      count: number;
    }>;

export type FindSelectionCandidatesOutput = Readonly<{
  candidates: SelectionCandidates;
  photos: PhotoRefs;
}>;

const displayed = { kind: "displayed" } as const;

async function vacancies(
  container: Pick<RequestContainer, "unitOfWorkProvider">,
  entries: readonly Scored<PlaceEntry>[],
): Promise<ReadonlySet<PlaceId>> {
  const targets = entries.map(
    ({ entry }) => ({ kind: "place", id: entry.place.id }) as const,
  );
  if (targets.length === 0) return new Set();
  const stored = await container.unitOfWorkProvider.run(
    ({ stewardshipRepository }) => stewardshipRepository.findByTargets(targets),
  );
  const stewarded = new Set(
    stored
      .filter((stewardship) => !Stewardship.isVacant(stewardship))
      .map((stewardship) => stewardship.target.id),
  );
  return new Set(
    targets.map((target) => target.id).filter((id) => !stewarded.has(id)),
  );
}

async function candidatesOf(
  container: RequestContainer,
  scope: SelectionScope,
  keyword: SearchKeyword,
  pagination: Pagination,
): Promise<SelectionCandidates> {
  const today = todayOf(container);
  switch (scope.kind) {
    case "place": {
      const page = await container.keywordSearchQueries.searchPlaces(
        { keyword, vacantOnly: scope.vacantOnly },
        pagination,
      );
      const vacant = await vacancies(container, page.items);
      return {
        kind: "place",
        items: page.items.map(({ entry }) => ({
          summary: ViewProjection.placeSummary(entry, displayed),
          placeIsVacant: vacant.has(entry.place.id),
        })),
        count: page.count,
      };
    }
    case "listing": {
      const page = await container.keywordSearchQueries.searchListings(
        keyword,
        pagination,
      );
      return {
        kind: "listing",
        items: page.items.map(({ entry }) =>
          ViewProjection.listingSummary(entry, displayed, today),
        ),
        count: page.count,
      };
    }
    case "region": {
      const page = await container.keywordSearchQueries.searchRegions(
        keyword,
        pagination,
      );
      return {
        kind: "region",
        items: page.items.map(({ entry }) =>
          ViewProjection.regionSummary(entry),
        ),
        count: page.count,
      };
    }
    case "occasion": {
      const page = await container.keywordSearchQueries.searchOccasions(
        { keyword, openOnly: scope.openOnly, today },
        pagination,
      );
      return {
        kind: "occasion",
        items: page.items.map(({ entry }) =>
          ViewProjection.occasionSummary(entry, today),
        ),
        count: page.count,
      };
    }
  }
}

function photoIdsOf(candidates: SelectionCandidates) {
  switch (candidates.kind) {
    case "place":
      return candidates.items.flatMap((item) =>
        placeSummaryPhotoIds(item.summary),
      );
    case "listing":
      return candidates.items.flatMap(listingSummaryPhotoIds);
    case "region":
      return candidates.items.flatMap(regionSummaryPhotoIds);
    case "occasion":
      return candidates.items.flatMap(occasionSummaryPhotoIds);
  }
}

/**
 * CF-02 (REG-01, REG-03, EVT-01, EVT-05, EVT-10, EDT-02): candidates for an
 * in-form selection within the caller's `SelectionScope`, matched like the
 * keyword search and returned with their standing (reference scene). Place
 * candidates carry whether the place has no steward. Whether a candidate
 * can be chosen is the calling operation's to decide. A blank keyword
 * finds nothing, without an error. Needs no login.
 *
 * @throws BusinessRuleError `COMMON_INVALID_SEARCH_KEYWORD` for a keyword
 *   over 100 characters; `COMMON_INVALID_INPUT` for a pagination out of
 *   bounds.
 */
export async function findSelectionCandidates({
  container,
  input,
}: ServiceArgs<FindSelectionCandidatesInput>): Promise<FindSelectionCandidatesOutput> {
  const pagination = Pagination.create(input.pagination);
  const keyword = SearchKeyword.parse(input.keyword);
  if (keyword === null) {
    return {
      candidates: { kind: input.scope.kind, items: [], count: 0 },
      photos: {},
    };
  }
  const candidates = await candidatesOf(
    container,
    input.scope,
    keyword,
    pagination,
  );
  return {
    candidates,
    photos: await photoRefsOf(container, photoIdsOf(candidates)),
  };
}
