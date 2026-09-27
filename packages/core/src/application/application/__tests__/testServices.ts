import { DoApplicationReviewDesk } from "@repo/core/adapters/do/applicationReviewDesk";
import { applicationModel } from "@repo/core/domain/application/application";
import type { ApplicationKindMap } from "@repo/core/domain/application/kinds";
import { ReviewPolicy } from "@repo/core/domain/application/reviewPolicy";
import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { ApplicationServices } from "../services";

/** The review period usecase tests run with: 72 hours. */
export const TEST_REVIEW_POLICY = ReviewPolicy.create({
  proxyAfterMs: 72 * 60 * 60 * 1000,
});

/**
 * Application's container ports for usecase tests: fakes for external IO,
 * the real adapters (over the in-process state object) for everything
 * else.
 */
export function createTestApplicationServices(
  deps: TestServiceDeps,
): ApplicationServices {
  return {
    applicationReviewDesk: new DoApplicationReviewDesk<ApplicationKindMap>(
      deps.client,
      applicationModel,
    ),
    reviewPolicy: TEST_REVIEW_POLICY,
  };
}
