import type { AccountRepository } from "./accountRepository";
import type { LoginChallengeRepository } from "./loginChallengeRepository";

/**
 * Account's repositories inside a unit of work (`UnitOfWorkContext`).
 * Only reachable through `UnitOfWorkProvider.run`.
 */
export type AccountRepositories = Readonly<{
  accountRepository: AccountRepository;
  loginChallengeRepository: LoginChallengeRepository;
}>;
