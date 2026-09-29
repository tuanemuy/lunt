/**
 * Discovery's `BusinessRuleError` codes (`DISCOVERY_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/discovery.ts`.
 */
export const DiscoveryErrorCode = {
  /** `MapGrid.create`: columns and rows must be positive integers. */
  InvalidMapGrid: "DISCOVERY_INVALID_MAP_GRID",
} as const;

export type DiscoveryErrorCode =
  (typeof DiscoveryErrorCode)[keyof typeof DiscoveryErrorCode];
