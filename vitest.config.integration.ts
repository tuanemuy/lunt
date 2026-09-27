import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Integration tests run inside a Workers isolate (Miniflare) against the
// real Lunt state Durable Object. Everything matching
// `*.integration.test.ts` runs here; the Node-pool `vitest.config.ts`
// runs the rest (domain, usecases over `node:sqlite`, and the same port
// conformance suites on the Node backend).
//
// Storage is isolated per test file; inside a file each test takes a
// fresh object via `idFromName(randomUUID())`.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    cloudflareTest({
      // Durable Object classes bound below must be exported from `main`;
      // the test worker also consumes the events queue.
      main: "./apps/web/app/durable-objects/__tests__/testWorker.ts",
      miniflare: {
        compatibilityDate: "2026-05-01",
        compatibilityFlags: ["nodejs_compat"],
        durableObjects: {
          LUNT_STATE: { className: "LuntStateObject", useSQLite: true },
          RELAY_PROBE_STATE: {
            className: "RelayProbeStateObject",
            useSQLite: true,
          },
        },
        queueProducers: {
          EVENTS_QUEUE: "lunt-events",
        },
        queueConsumers: {
          "lunt-events": {
            maxBatchSize: 25,
            maxBatchTimeout: 0.05,
            maxRetries: 2,
            deadLetterQueue: "lunt-events-dlq",
          },
          "lunt-events-dlq": {
            maxBatchSize: 25,
            maxBatchTimeout: 0.05,
            maxRetries: 3,
          },
        },
        bindings: {
          APP_URL: "http://localhost:3000",
          DEV_TOOLS: "1",
          SESSION_SECRET: "lunt-local-development-session-secret",
          OUTBOX_BATCH_SIZE: "100",
          OUTBOX_LEASE_MS: "300000",
          OUTBOX_ALERT_AFTER_ATTEMPTS: "5",
          OUTBOX_RETENTION_MS: "604800000",
        },
      },
    }),
  ],
  test: {
    include: [
      "apps/**/*.integration.test.ts",
      "packages/**/*.integration.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.direnv/**"],
  },
});
