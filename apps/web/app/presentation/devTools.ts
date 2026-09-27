import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "./errorResponseMiddleware";

/**
 * Whether the development tools (`/__dev/*`, design.md D-07) are on.
 * Decided by the server's `DEV_TOOLS` setting, never by the build mode:
 * a production build run locally for manual tests keeps them.
 */
export const loadDevToolsEnabled = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getContainer } = await import(
      "@repo/core/application/di/containerStore"
    );
    const container = await getContainer();
    return container.runtime.devTools;
  });

/**
 * `beforeLoad` guard of every `/__dev/*` route: behaves as if the route
 * did not exist while the development tools are off.
 */
export async function requireDevTools(): Promise<void> {
  if (!(await loadDevToolsEnabled())) {
    throw notFound();
  }
}
