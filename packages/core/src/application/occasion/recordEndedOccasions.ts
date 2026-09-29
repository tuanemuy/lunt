import { LocalDate } from "@repo/core/domain/common/localDate";
import { HoldingStatusObserver } from "@repo/core/domain/occasion/holdingStatusObserver";
import type { OccasionToObserve } from "@repo/core/domain/occasion/ports/holdingStatusLedger";
import type { RequestContainer } from "../di/types";
import {
  type DailyJob,
  type DrainReport,
  drainPages,
} from "../workers/dailyJobs";

const PAGE_SIZE = 100;

/**
 * Daily job (F-20; `spec/usecases/occasion.md` 「recordEndedOccasions」;
 * EVT-01, EVT-04, EVT-08). For each occasion whose holding status record
 * is missing, stale (another version) or due (`nextChangeOn` reached),
 * whatever its publication or suspension: re-reads the occasion and the
 * record in its own unit of work, puts `HoldingStatusObserver.observe`'s
 * record and emits `occasion.ended` when the status became `ended`.
 * Occasions are never written. Idempotent: a recorded occasion drops out
 * until its version changes or its next change day comes. A failure
 * leaves the record as it was, so the next run looks again.
 */
export function recordEndedOccasions(
  container: RequestContainer,
  now: Date,
): Promise<DrainReport> {
  const today = LocalDate.fromInstant(now);
  return drainPages<OccasionToObserve>({
    job: "recordEndedOccasions",
    logger: container.logger,
    keyOf: (target) => target.occasion.id,
    readPage: (page) =>
      container.unitOfWorkProvider
        .run(({ holdingStatusLedger }) =>
          holdingStatusLedger.findToObserve(today, { page, limit: PAGE_SIZE }),
        )
        .then((result) => result.items),
    process: (target) =>
      container.unitOfWorkProvider.run(
        async ({ occasionRepository, holdingStatusLedger, collectEvents }) => {
          const [found, record] = await Promise.all([
            occasionRepository.findById(target.occasion.id),
            holdingStatusLedger.find(target.occasion.id),
          ]);
          if (found === null) return;
          const observed = HoldingStatusObserver.observe(
            record,
            found.entity,
            today,
            now,
          );
          await holdingStatusLedger.put(observed.record);
          collectEvents(observed.eventDrafts);
        },
      ),
  });
}

export const recordEndedOccasionsJob: DailyJob = {
  name: "recordEndedOccasions",
  run: recordEndedOccasions,
};
