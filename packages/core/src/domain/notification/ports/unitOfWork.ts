/**
 * Notification's repositories inside a unit of work (`UnitOfWorkContext`). Only
 * reachable through `UnitOfWorkProvider.run`.
 */
export type NotificationRepositories = Readonly<Record<never, never>>;
