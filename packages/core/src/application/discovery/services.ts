import type { DetailQueries } from "@repo/core/domain/discovery/ports/detailQueries";
import type { ExplorationQueries } from "@repo/core/domain/discovery/ports/explorationQueries";
import type { FeedCandidateQueries } from "@repo/core/domain/discovery/ports/feedCandidateQueries";
import type { KeywordSearchQueries } from "@repo/core/domain/discovery/ports/keywordSearchQueries";
import type { ReferenceQueries } from "@repo/core/domain/discovery/ports/referenceQueries";

/** Discovery's settings (brief A-06): environment-driven, with development defaults. */
export type DiscoverySettings = Readonly<{
  /**
   * The radius of the viewer's vicinity, shared by the first map range and
   * the region list (`spec/scenario/index.md` 「表示範囲」).
   */
  vicinityRadiusMeters: number;
}>;

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
  discoverySettings: DiscoverySettings;
  feedCandidateQueries: FeedCandidateQueries;
}>;
