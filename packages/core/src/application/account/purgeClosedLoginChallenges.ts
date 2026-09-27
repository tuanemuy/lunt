import type { RequestContainer } from "../di/types";
import type { DailyJob } from "../workers/dailyJobs";

/**
 * Daily job (F-01): deletes every redeemed or exhausted login challenge
 * and every one past its `expiresAt` at `now`. One bulk delete in one unit
 * of work — the targets need no per-row judgement — so it does not page.
 * Idempotent: a usable challenge (pending, unexpired) is never touched,
 * and a failed run leaves the same targets to the next one.
 */
export async function purgeClosedLoginChallenges({
  container,
  now,
}: Readonly<{ container: RequestContainer; now: Date }>): Promise<void> {
  await container.unitOfWorkProvider.run(({ loginChallengeRepository }) =>
    loginChallengeRepository.deleteClosedBefore(now),
  );
}

export const purgeClosedLoginChallengesJob: DailyJob = {
  name: "purgeClosedLoginChallenges",
  run: async (container, now) => {
    await purgeClosedLoginChallenges({ container, now });
    return { processed: 1, failed: 0, skipped: 0, abandoned: false };
  },
};
