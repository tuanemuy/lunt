import type { DetailQueries } from "@repo/core/domain/discovery/ports/detailQueries";
import type { ReferenceQueries } from "@repo/core/domain/discovery/ports/referenceQueries";

/**
 * Discovery's ports and settings that live on the container: read-only ports
 * that do not join a unit of work, external IO ports, and settings.
 */
export type DiscoveryServices = Readonly<{
  /** Called outside `run` (`spec/domains/index.md` 「UnitOfWork ポート」). */
  detailQueries: DetailQueries;
  /** Called outside `run` (`spec/domains/index.md` 「UnitOfWork ポート」). */
  referenceQueries: ReferenceQueries;
}>;
