/// <reference types="@cloudflare/vitest-pool-workers/types" />

// The photo bucket `vitest.config.integration.ts` declares for the Workers
// pool (`r2Buckets: ["PHOTOS"]`).
declare global {
  namespace Cloudflare {
    interface Env {
      PHOTOS: R2Bucket;
    }
  }
}

export {};
