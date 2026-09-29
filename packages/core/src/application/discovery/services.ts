import type { DetailQueries } from "@repo/core/domain/discovery/ports/detailQueries";
import type { ExplorationQueries } from "@repo/core/domain/discovery/ports/explorationQueries";
import type { KeywordSearchQueries } from "@repo/core/domain/discovery/ports/keywordSearchQueries";
import type { ReferenceQueries } from "@repo/core/domain/discovery/ports/referenceQueries";

/**
 * Discovery's ports and settings that live on the container: read-only ports
 * that do not join a unit of work, external IO ports, and settings. Every
 * port here is called outside `run` (`spec/domains/index.md`
 * 「UnitOfWork ポート」).
 */
export type DiscoveryServices = Readonly<{
  detailQueries: DetailQueries;
  referenceQueries: ReferenceQueries;
  explorationQueries: ExplorationQueries;
  keywordSearchQueries: KeywordSearchQueries;
}>;
