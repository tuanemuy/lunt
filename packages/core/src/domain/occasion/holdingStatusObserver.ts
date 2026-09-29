import type { EventDraft } from "@repo/core/domain/common/event";
import type { OccasionId } from "@repo/core/domain/common/ids";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import type { Version } from "@repo/core/domain/common/version";
import { type OccasionEndedEvent, OccasionEvents } from "./events";
import { HoldingStatus } from "./holdingStatus";
import { Occasion } from "./occasion";

/**
 * The holding status the daily job last saw, kept outside the aggregate:
 * the occasion's version then, and the next day the status would change
 * (`HoldingStatus.nextChangeOn`, `null` when dates alone never change it).
 */
export type HoldingStatusRecord = Readonly<{
  occasionId: OccasionId;
  lastObserved: HoldingStatus | null;
  observedVersion: Version;
  nextChangeOn: LocalDate | null;
}>;

/**
 * Compares today's holding status with `record` and returns the new
 * record. The only producer of `occasion.ended`: a status that became
 * `ended` (no record, or a record not `ended`) yields one; nothing else
 * does — a record replaced only for a new version included. A postponed
 * or cancelled occasion is seen again through its new version, so ending
 * again yields another event.
 */
function observe(
  record: HoldingStatusRecord | null,
  occasion: Occasion,
  today: LocalDate,
  now: Date,
): Readonly<{
  record: HoldingStatusRecord;
  eventDrafts: readonly EventDraft<OccasionEndedEvent>[];
}> {
  const status = Occasion.holdingStatus(occasion, today);
  return {
    record: {
      occasionId: occasion.id,
      lastObserved: status,
      observedVersion: occasion.version,
      nextChangeOn: HoldingStatus.nextChangeOn(
        occasion.content.period,
        occasion.cancellation,
        today,
      ),
    },
    eventDrafts:
      status === "ended" && record?.lastObserved !== "ended"
        ? [OccasionEvents.ended(occasion.id, today, now)]
        : [],
  };
}

export const HoldingStatusObserver = { observe };
