import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEFAULT_MAP_STYLE_URL } from "@/components/map/mapStyle";
import { errorResponseMiddleware } from "./errorResponseMiddleware";

/** The setting the map reads (brief A-04, A-06). */
export type MapEnv = Readonly<{
  /**
   * A MapLibre style URL (vector tiles). Default: OpenFreeMap's Positron,
   * which needs no API key. A replacement must name its attribution in
   * its sources; the map shows it.
   */
  MAP_STYLE_URL?: string | undefined;
}>;

const mapStyleUrlSchema = z
  .url({ protocol: /^https?$/ })
  .default(DEFAULT_MAP_STYLE_URL);

/** `MAP_STYLE_URL`, or the default; an empty value counts as unset. */
export function readMapStyleUrl(env: MapEnv): string {
  const value = env.MAP_STYLE_URL?.trim();
  return mapStyleUrlSchema.parse(value === "" ? undefined : value);
}

/**
 * The map's style URL for a route's loader (VW-04, VW-08): the server's
 * `MAP_STYLE_URL` setting, so an operator swaps the tiles without a build.
 */
export const loadMapStyleFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { env } = await import("cloudflare:workers");
    return { styleUrl: readMapStyleUrl(env) };
  });
