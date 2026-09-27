import type { ApplicationRepository } from "./applicationRepository";
import type { OverdueNoticeLedger } from "./overdueNoticeLedger";

/**
 * Application's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type ApplicationRepositories = Readonly<{
  applicationRepository: ApplicationRepository;
  overdueNoticeLedger: OverdueNoticeLedger;
}>;
