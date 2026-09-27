import type { StewardedTargetDirectory } from "@repo/core/domain/authority/ports/stewardedTargetDirectory";

/**
 * Authority's ports and settings that live on the container: read-only ports
 * that do not join a unit of work, external IO ports, and settings.
 */
export type AuthorityServices = Readonly<{
  /** Called outside `run` (`spec/domains/index.md` 「UnitOfWork ポート」). */
  stewardedTargetDirectory: StewardedTargetDirectory;
}>;
