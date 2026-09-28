import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";
import { serverFnDiscovery } from "./vite/serverFnDiscovery.ts";

// Several local servers can run side by side, each with its own Durable
// Object, queue and R2 state (manual tests in parallel browsers):
// `LUNT_STATE_DIR=.wrangler/state-b pnpm dev --port 3102`.
const stateDir = process.env.LUNT_STATE_DIR;
const persistState =
  stateDir === undefined || stateDir === ""
    ? true
    : { path: fileURLToPath(new URL(stateDir, import.meta.url)) };

// The Lunt Worker runs in workerd during `vite dev` through the
// Cloudflare plugin, with the bindings declared in wrangler.jsonc.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    cloudflare({
      configPath: "./wrangler.jsonc",
      persistState,
      ...(persistState === true ? {} : { inspectorPort: false }),
      // Declare `rsc` as a child of the workerd-backed `ssr` env so the
      // RSC plugin's module runner is initialised inside the worker.
      viteEnvironment: { name: "ssr", childEnvironments: ["rsc"] },
    }),
    tanstackStart({
      srcDirectory: "app",
      // Path is resolved relative to `srcDirectory`; an `app/` prefix
      // makes the plugin silently fall back to the default CF entry.
      server: { entry: "server.ts" },
      rsc: { enabled: true },
      router: {
        codeSplittingOptions: {
          // Only each route's component (and its not-found view) stays a
          // lazy chunk. The error and pending views ship with the route
          // itself: they are what a navigation shows when the network is
          // gone (CS-02) or slow, and a lazy chunk fetched at that moment
          // fails too — the failure then escapes to the root. The cost is a
          // little more code in the initial bundle per route that defines
          // its own error or pending view.
          defaultBehavior: [["component"], ["notFoundComponent"]],
        },
      },
    }),
    rsc(),
    serverFnDiscovery({ srcDirectory: "app" }),
    viteReact(),
  ],
  server: {
    port: 3000,
    host: true,
    watch: {
      ignored: ["**/.direnv/**"],
    },
  },
});
