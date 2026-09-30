import { purgeClosedLoginChallengesJob } from "../account/purgeClosedLoginChallenges";
import { notifyOverdueReviewsJob } from "../application/notifyOverdueReviews";
import { detectEndedOfferingsJob } from "../listing/detectEndedOfferings";
import { sweepUnownedPhotosJob } from "../media/sweepUnownedPhotos";
import { recordEndedOccasionsJob } from "../occasion/recordEndedOccasions";
import type { DailyJob } from "./dailyJobs";

/**
 * Jobs the scheduled handler runs once a day (Cron Trigger, 00:05 JST):
 * the five of `spec/flows/index.md` 「日次のジョブ」.
 */
export const dailyJobs: readonly DailyJob[] = [
  purgeClosedLoginChallengesJob,
  sweepUnownedPhotosJob,
  detectEndedOfferingsJob,
  notifyOverdueReviewsJob,
  recordEndedOccasionsJob,
];
