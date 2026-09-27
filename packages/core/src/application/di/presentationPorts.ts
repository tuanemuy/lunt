/**
 * Ports the presentation layer (`apps/web`) implements and hands to the
 * container — e.g. Notification's `NotificationMailRenderer`, which turns
 * a destination into a screen URL. The Worker entry passes them to
 * `createRequestContainer`.
 */
export type PresentationPorts = Readonly<Record<never, never>>;
