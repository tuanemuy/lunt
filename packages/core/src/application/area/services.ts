import type { AreaCatalog } from "@repo/core/domain/area/ports/areaCatalog";

/**
 * Area's ports and settings that live on the container: read-only ports
 * that do not join a unit of work, external IO ports, and settings.
 */
export type AreaServices = Readonly<{
  /** The read-only area master (`AssetAreaCatalog` over static assets). */
  areaCatalog: AreaCatalog;
}>;
