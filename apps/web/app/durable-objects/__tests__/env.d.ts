/// <reference types="@cloudflare/vitest-pool-workers/types" />

// Bindings `vitest.config.integration.ts` declares for the Workers pool.
// `RELAY_PROBE_STATE` exists only there, so it never appears in the
// `wrangler types` output that populates `Cloudflare.Env` for the app.
import type { LuntStateObject } from "../luntState";
import type { RelayProbeStateObject } from "./testWorker";

declare global {
  namespace Cloudflare {
    interface Env {
      LUNT_STATE: DurableObjectNamespace<LuntStateObject>;
      RELAY_PROBE_STATE: DurableObjectNamespace<RelayProbeStateObject>;
    }
  }
}
