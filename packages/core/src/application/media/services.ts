import type { PhotoPolicy } from "@repo/core/domain/media/photoPolicy";
import type { PhotoInspector } from "@repo/core/domain/media/ports/photoInspector";
import type { PhotoStorage } from "@repo/core/domain/media/ports/photoStorage";

/**
 * Media's ports and settings that live on the container: read-only ports
 * that do not join a unit of work, external IO ports, and settings.
 */
export type MediaServices = Readonly<{
  /**
   * Photo content, outside every unit of work. Other domains' reads call
   * `displayRefs` to show photos; nothing else outside Media writes it.
   */
  photoStorage: PhotoStorage;
  photoInspector: PhotoInspector;
  /**
   * How long an unowned photo is kept (`PHOTO_UNOWNED_RETENTION_MS`) and
   * the largest file registered (`PHOTO_MAX_BYTES`).
   */
  photoPolicy: PhotoPolicy;
}>;
