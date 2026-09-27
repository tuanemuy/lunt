import type { UnitOfWorkRepositories } from "@repo/core/application/execution/unitOfWork";
import { createAccountRepositories } from "./account";
import { createApplicationRepositories } from "./application";
import { createAreaRepositories } from "./area";
import { createAuthorityRepositories } from "./authority";
import type { RepositoryDeps } from "./deps";
import { createDiscoveryRepositories } from "./discovery";
import { createListingRepositories } from "./listing";
import { createMediaRepositories } from "./media";
import { createNotificationRepositories } from "./notification";
import { createPlaceRepositories } from "./place";

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
    ...createAreaRepositories(deps),
    ...createMediaRepositories(deps),
    ...createPlaceRepositories(deps),
    ...createListingRepositories(deps),
    ...createDiscoveryRepositories(deps),
  };
}
