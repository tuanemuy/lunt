import type { AreaCode } from "@repo/core/domain/common/areaCode";
import type { GeoPoint } from "@repo/core/domain/common/geo";
import type { RegionId } from "@repo/core/domain/common/ids";
import { Vicinity } from "./vicinity";

/**
 * Where the first map range and the region list gather their targets: the
 * chosen areas, the viewer's vicinity, or everywhere.
 */
export type ExplorationFocus =
  | Readonly<{ kind: "areas"; areaCodes: ReadonlySet<AreaCode> }>
  | Readonly<{ kind: "vicinity"; vicinity: Vicinity }>
  | Readonly<{ kind: "everywhere" }>;

export const ExplorationFocus = {
  /**
   * Chosen areas win over the viewer's position; with neither, everywhere.
   * The only place that decides this precedence.
   */
  of: (
    areaCodes: ReadonlySet<AreaCode> | null,
    origin: GeoPoint | null,
    radiusMeters: number,
  ): ExplorationFocus => {
    if (areaCodes !== null) return { kind: "areas", areaCodes };
    if (origin !== null) {
      return {
        kind: "vicinity",
        vicinity: Vicinity.create(origin, radiusMeters),
      };
    }
    return { kind: "everywhere" };
  },
};

/**
 * What a map extent gathers: the discoverable places of the chosen areas
 * (`null`: every area), or one region's footprint.
 */
export type MapScope =
  | Readonly<{ kind: "places"; areaCodes: ReadonlySet<AreaCode> | null }>
  | Readonly<{ kind: "region"; regionId: RegionId }>;
