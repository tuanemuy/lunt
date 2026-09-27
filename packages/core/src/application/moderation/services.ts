import type { ContentDirectory } from "@repo/core/domain/moderation/ports/contentDirectory";

/**
 * Moderation's ports and settings that live on the container: read-only ports
 * that do not join a unit of work, external IO ports, and settings.
 */
export type ModerationServices = Readonly<{
  /** Called outside `run` (`spec/domains/index.md` 「UnitOfWork ポート」). */
  contentDirectory: ContentDirectory;
}>;
