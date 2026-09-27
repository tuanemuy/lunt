import { DoApplicationReviewDesk } from "@repo/core/adapters/do/applicationReviewDesk";
import { applicationModel } from "@repo/core/domain/application/application";
import type { ApplicationKindMap } from "@repo/core/domain/application/kinds";
import { ReviewPolicy } from "@repo/core/domain/application/reviewPolicy";
import { z } from "zod";
import type { ApplicationServices } from "../application/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Application's wiring reads. */
export type ApplicationEnv = Readonly<{
  /**
   * How long after an application became under review an operator may
   * decide it in place of the region's or occasion's stewards, in ms
   * (X-04; default 7 days).
   */
  APPLICATION_PROXY_AFTER_MS?: string | undefined;
}>;

export const DEFAULT_APPLICATION_PROXY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const reviewSettingsSchema = z.object({
  proxyAfterMs: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_APPLICATION_PROXY_AFTER_MS),
});

export function readReviewPolicy(env: ApplicationEnv): ReviewPolicy {
  return ReviewPolicy.create(
    reviewSettingsSchema.parse({
      proxyAfterMs: env.APPLICATION_PROXY_AFTER_MS,
    }),
  );
}

export function createApplicationServices(
  env: ApplicationEnv,
  deps: ServiceDeps,
): ApplicationServices {
  return {
    applicationReviewDesk: new DoApplicationReviewDesk<ApplicationKindMap>(
      deps.client,
      applicationModel,
    ),
    reviewPolicy: readReviewPolicy(env),
  };
}
