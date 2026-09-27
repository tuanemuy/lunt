import type { AccountRepository } from "./accountRepository";

/**
 * Account's repositories inside a unit of work (`UnitOfWorkContext`).
 * Only reachable through `UnitOfWorkProvider.run`.
 */
export type AccountRepositories = Readonly<{
  accountRepository: AccountRepository;
}>;
