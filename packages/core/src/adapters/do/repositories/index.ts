import type { UnitOfWorkRepositories } from "@repo/core/application/execution/unitOfWork";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import { DoAccountRepository } from "./accountRepository";

export type RepositoryDeps = Readonly<{
  client: LuntStateClient;
  /** The unit of work's write buffer; repositories only append to it. */
  writes: WriteCommand[];
  idGenerator: IdGenerator;
}>;

/** Every aggregate repository of one unit of work, sharing its buffer. */
export function createRepositories(
  deps: RepositoryDeps,
): UnitOfWorkRepositories {
  return {
    accountRepository: new DoAccountRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
  };
}
