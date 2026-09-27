import type { ApplicationReviewDesk } from "@repo/core/domain/application/ports/applicationReviewDesk";
import type { ReviewPolicy } from "@repo/core/domain/application/reviewPolicy";

/**
 * Application's ports and settings that live on the container: read-only ports
 * that do not join a unit of work, external IO ports, and settings.
 */
export type ApplicationServices = Readonly<{
  /** Called outside `run` (`spec/domains/index.md` 「UnitOfWork ポート」). */
  applicationReviewDesk: ApplicationReviewDesk;
  /** The review period (X-04), from settings through `ReviewPolicy.create`. */
  reviewPolicy: ReviewPolicy;
}>;
