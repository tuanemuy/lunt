import type { UnitOfWorkRepositories } from "@repo/core/application/execution/unitOfWork";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";

export type RepositoryDeps = Readonly<{
  client: LuntStateClient;
  /** The unit of work's write buffer; repositories only append to it. */
  writes: WriteCommand[];
  idGenerator: IdGenerator;
}>;

export function createRepositories(
  _deps: RepositoryDeps,
): UnitOfWorkRepositories {
  return {};
}
