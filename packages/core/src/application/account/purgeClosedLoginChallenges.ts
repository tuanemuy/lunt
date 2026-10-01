import type { RequestContainer } from "../di/types";
import type { DailyJob } from "../workers/dailyJobs";

type PurgeArgs = Readonly<{ container: RequestContainer; now: Date }>;

/**
 * The purge, answering how many challenges it found closed: the count is
 * read in the delete's unit of work, so it is what the delete removes but
 * for a challenge closing while the run is under way (deleted, uncounted).
 */
async function purgeCounting({ container, now }: PurgeArgs): Promise<number> {
  return container.unitOfWorkProvider.run(
    async ({ loginChallengeRepository }) => {
      const closed = await loginChallengeRepository.countClosedBefore(now);
      await loginChallengeRepository.deleteClosedBefore(now);
      return closed;
    },
  );
}

/**
 * Daily job (F-01): deletes every redeemed or exhausted login challenge
 * and every one past its `expiresAt` at `now`. One bulk delete in one unit
 * of work — the targets need no per-row judgement — so it does not page.
 * Idempotent: a usable challenge (pending, unexpired) is never touched,
 * and a failed run leaves the same targets to the next one.
 */
export async function purgeClosedLoginChallenges(
  args: PurgeArgs,
): Promise<void> {
  await purgeCounting(args);
}

/**
 * Reports the challenges removed as `processed`. The one unit of work
 * either commits or fails as a whole: a failure is a crash of the job
 * (`runDailyJobs`), never a `failed` count.
 */
export const purgeClosedLoginChallengesJob: DailyJob = {
  name: "purgeClosedLoginChallenges",
  run: async (container, now) => ({
    processed: await purgeCounting({ container, now }),
    failed: 0,
    skipped: 0,
    abandoned: false,
  }),
};
