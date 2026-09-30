/**
 * Article's ports and settings that live on the container: read-only ports
 * that do not join a unit of work, external IO ports, and settings.
 */
export type ArticleServices = Readonly<Record<never, never>>;
