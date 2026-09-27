/**
 * Notification's `BusinessRuleError` codes (`NOTIFICATION_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/notification.ts`.
 */
export const NotificationErrorCode = {} as const;

export type NotificationErrorCode =
  (typeof NotificationErrorCode)[keyof typeof NotificationErrorCode];
