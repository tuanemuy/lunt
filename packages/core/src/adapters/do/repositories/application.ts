import { applicationModel } from "@repo/core/domain/application/application";
import type { ApplicationKindMap } from "@repo/core/domain/application/kinds";
import type { ApplicationRepositories } from "@repo/core/domain/application/ports/unitOfWork";
import { DoApplicationRepository } from "./applicationRepository";
import type { RepositoryDeps } from "./deps";
import { DoOverdueNoticeLedger } from "./overdueNoticeLedger";

/** Application's aggregate repositories of one unit of work. */
export function createApplicationRepositories(
  deps: RepositoryDeps,
): ApplicationRepositories {
  return {
    applicationRepository: new DoApplicationRepository<ApplicationKindMap>(
      deps.client,
      deps.writes,
      deps.idGenerator,
      applicationModel,
    ),
    overdueNoticeLedger: new DoOverdueNoticeLedger(deps.client, deps.writes),
  };
}
