import { LocalDate } from "@repo/core/domain/common/localDate";
import { Listing } from "@repo/core/domain/listing/listing";
import { OfferingWatch } from "@repo/core/domain/listing/offeringWatch";
import type { DriftedListing } from "@repo/core/domain/listing/ports/offeringPhaseLedger";
import type { RequestContainer } from "../di/types";
import {
  type DailyJob,
  type DrainReport,
  drainPages,
} from "../workers/dailyJobs";

const PAGE_SIZE = 100;

/**
 * Daily job (F-14; `spec/usecases/listing.md` 「detectEndedOfferings」;
 * LST-03, LST-08). For each published listing whose offering phase record
 * is missing, stale (another version) or due (`nextChangeOn` reached):
 * re-reads the listing and the record in its own unit of work, records
 * `OfferingWatch.detect`'s phase and emits `listing.offering_ended` when
 * the phase became `ended`. Listings are never written. A listing no
 * longer published when re-read is skipped. Idempotent: a recorded
 * listing drops out until its version changes or its next change day
 * comes, so one end yields one event however often it runs.
 */
export function detectEndedOfferings(
  container: RequestContainer,
  now: Date,
): Promise<DrainReport> {
  const today = LocalDate.fromInstant(now);
  return drainPages<DriftedListing>({
    job: "detectEndedOfferings",
    logger: container.logger,
    keyOf: (target) => target.listing.id,
    readPage: (page) =>
      container.unitOfWorkProvider
        .run(({ offeringPhaseLedger }) =>
          offeringPhaseLedger.findPageDrifted(today, {
            page,
            limit: PAGE_SIZE,
          }),
        )
        .then((result) => result.items),
    process: (target) =>
      container.unitOfWorkProvider.run(
        async ({ listingRepository, offeringPhaseLedger, collectEvents }) => {
          const [found, record] = await Promise.all([
            listingRepository.findById(target.listing.id),
            offeringPhaseLedger.find(target.listing.id),
          ]);
          if (found === null || !Listing.isPublished(found.entity)) return;
          const detected = OfferingWatch.detect(
            found.entity,
            record?.phase ?? null,
            today,
            now,
          );
          await offeringPhaseLedger.record(detected.record);
          collectEvents(detected.eventDrafts);
        },
      ),
  });
}

export const detectEndedOfferingsJob: DailyJob = {
  name: "detectEndedOfferings",
  run: detectEndedOfferings,
};
