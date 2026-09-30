import type { DiscoveryErrorCode } from "@repo/core/domain/discovery/errorCode";
import { type BusinessErrorPresentation, invalid } from "./presentation";

/** How each Discovery business error is shown (CS-08 / CS-10). */
export const discoveryErrorCatalog = {
  DISCOVERY_INVALID_MAP_GRID: invalid("地図の表示範囲を指定し直してください"),
  DISCOVERY_INVALID_VICINITY: invalid(
    "現在地の周辺の範囲を指定し直してください",
  ),
} satisfies Record<DiscoveryErrorCode, BusinessErrorPresentation>;
