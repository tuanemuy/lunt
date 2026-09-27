import { purgeClosedLoginChallengesJob } from "../account/purgeClosedLoginChallenges";
import { detectEndedOfferingsJob } from "../listing/detectEndedOfferings";
import { sweepUnownedPhotosJob } from "../media/sweepUnownedPhotos";
import type { DailyJob } from "./dailyJobs";

/**
 * Jobs the scheduled handler runs once a day (Cron Trigger, 00:05 JST).
 * Each domain adds its job here as it lands (`spec/flows/index.md`
 * 「日次のジョブ」).
 */
export const dailyJobs: readonly DailyJob[] = [
  purgeClosedLoginChallengesJob,
  sweepUnownedPhotosJob,
  detectEndedOfferingsJob,
];
