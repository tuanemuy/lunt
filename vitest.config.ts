import { defineConfig } from "vitest/config";

// Node-pool config: domain, usecases, and the port conformance suites on
// the Durable Object's store code over `node:sqlite`. Anything that needs
// the real Durable Object or the Workers runtime lives in
// `*.integration.test.ts` and runs through `vitest.config.integration.ts`
// (the `vitest-pool-workers` Workers pool).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.direnv/**",
      "**/*.integration.test.ts",
      "spec/**",
    ],
  },
});
