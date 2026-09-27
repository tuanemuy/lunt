import type { UnitOfWorkRepositories } from "@repo/core/application/execution/unitOfWork";
import { createAccountRepositories } from "./account";
import { createApplicationRepositories } from "./application";
import { createAuthorityRepositories } from "./authority";
import type { RepositoryDeps } from "./deps";
import { createNotificationRepositories } from "./notification";

export type { RepositoryDeps } from "./deps";

/** Every aggregate repository of one unit of work, sharing its buffer. */
export function createRepositories(
  deps: RepositoryDeps,
): UnitOfWorkRepositories {
  return {
    ...createAccountRepositories(deps),
    ...createAuthorityRepositories(deps),
    ...createApplicationRepositories(deps),
    ...createNotificationRepositories(deps),
  };
}
