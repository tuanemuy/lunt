import {
  type Application,
  OverdueReviewWatch,
} from "@repo/core/domain/application/application";
import { ReviewPolicy } from "@repo/core/domain/application/reviewPolicy";
import type { RequestContainer } from "../di/types";
import {
  type DailyJob,
  type DrainReport,
  drainPages,
} from "../workers/dailyJobs";

const PAGE_SIZE = 100;

/**
 * Daily job (F-10; APP-08, OPE-01): for each application under review
 * whose region or occasion has stewards and whose review period elapsed
 * by the run's `now` (`ApplicationReviewDesk` `asOverdueProxy`, cutoff
 * `ReviewPolicy.overdueCutoff`), re-reads the application and its notice
 * record in its own unit of work and, when `OverdueReviewWatch.detect`
 * says this under-review spell was not notified yet, records the notice
 * and stores `application.review_period_elapsed`. Applications are never
 * written. Idempotent: one event per spell however often it runs; a
 * resubmission starts a new spell. One application failing leaves no
 * record and the next run picks it up.
 */
export function notifyOverdueReviews(
  container: RequestContainer,
  now: Date,
): Promise<DrainReport> {
  const policy = container.reviewPolicy;
  const pendingSinceBefore = ReviewPolicy.overdueCutoff(policy, now);
  return drainPages<Application>({
    job: "notifyOverdueReviews",
    logger: container.logger,
    keyOf: (app) => app.id,
    readPage: (page) =>
      container.applicationReviewDesk
        .findPageAwaiting(
          { section: "asOverdueProxy", pendingSinceBefore },
          { page, limit: PAGE_SIZE },
        )
        .then((result) => result.items),
    process: (target) =>
      container.unitOfWorkProvider.run(
        async ({
          applicationRepository,
          overdueNoticeLedger,
          collectEvents,
        }) => {
          const [found, [recorded]] = await Promise.all([
            applicationRepository.findById(target.id),
            overdueNoticeLedger.findByApplicationIds([target.id]),
          ]);
          if (found === null) return;
          const detected = OverdueReviewWatch.detect(
            found.entity,
            recorded ?? null,
            policy,
            now,
          );
          if (detected === null) return;
          await overdueNoticeLedger.record(detected.notice);
          collectEvents(detected.eventDrafts);
        },
      ),
  });
}

export const notifyOverdueReviewsJob: DailyJob = {
  name: "notifyOverdueReviews",
  run: notifyOverdueReviews,
};
