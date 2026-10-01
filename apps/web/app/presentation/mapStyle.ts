import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEFAULT_MAP_STYLE_URL } from "./defaultMapStyle";
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

const mapStyleUrlSchema = z.url({ protocol: /^https?$/ });

/**
 * `MAP_STYLE_URL`, or the default; an empty value counts as unset. A value
 * that is not an http(s) URL is reported to `onInvalid` and the default
 * is used: a bad setting must not take the screens with a map down.
 */
export function readMapStyleUrl(
  env: MapEnv,
  onInvalid: (value: string) => void = () => {},
): string {
  const value = env.MAP_STYLE_URL?.trim();
  if (value === undefined || value === "") return DEFAULT_MAP_STYLE_URL;
  const parsed = mapStyleUrlSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  onInvalid(value);
  return DEFAULT_MAP_STYLE_URL;
}

/**
 * The map's style URL for a route's loader (VW-04, VW-08, DT-02): the
 * server's `MAP_STYLE_URL` setting, so an operator swaps the tiles without
 * a build.
 */
export const loadMapStyleFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const [{ env }, { getContainer }] = await Promise.all([
      import("cloudflare:workers"),
      import("@repo/core/application/di/containerStore"),
    ]);
    const styleUrl = readMapStyleUrl(env, (value) => {
      void getContainer().then(({ logger }) =>
        logger.warn("MAP_STYLE_URL is not an http(s) URL; using the default", {
          value,
        }),
      );
    });
    return { styleUrl };
  });

/**
 * `loadMapStyleFn` for a screen whose map is not its point (DT-02's
 * access): the default style when the setting cannot be read, rather than
 * failing the screen.
 */
export function loadMapStyleOrDefault(): Promise<{ styleUrl: string }> {
  return loadMapStyleFn().catch((reason: unknown) => {
    console.warn("[map] style setting unavailable", reason);
    return { styleUrl: DEFAULT_MAP_STYLE_URL };
  });
}
