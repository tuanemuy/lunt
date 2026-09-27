import type { AccountRepositories } from "@repo/core/domain/account/ports/unitOfWork";
import { DoAccountRepository } from "./accountRepository";
import type { RepositoryDeps } from "./deps";

/** Account's aggregate repositories of one unit of work. */
export function createAccountRepositories(
  deps: RepositoryDeps,
): AccountRepositories {
  return {
    accountRepository: new DoAccountRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
  };
}
