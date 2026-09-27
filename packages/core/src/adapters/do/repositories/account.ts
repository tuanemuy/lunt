import type { AccountRepositories } from "@repo/core/domain/account/ports/unitOfWork";
import { DoAccountRepository } from "./accountRepository";
import type { RepositoryDeps } from "./deps";
import { DoLoginChallengeRepository } from "./loginChallengeRepository";

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
    loginChallengeRepository: new DoLoginChallengeRepository(
      deps.client,
      deps.writes,
      deps.idGenerator,
    ),
  };
}
