import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import { PhotoPolicy } from "@repo/core/domain/media/photoPolicy";
import type { RequestContainer } from "../di/types";
import { isConflictError } from "../errors";
import {
  type DailyJob,
  type DrainReport,
  drainPages,
} from "../workers/dailyJobs";
import { discardAndDeletePhoto } from "./photoDeletion";

const PAGE_SIZE = 100;

/**
 * Daily job (`spec/usecases/media.md` 「sweepUnownedPhotos」; LST-01,
 * LST-02, LST-12): deletes photos still unowned `PhotoPolicy`'s retention
 * after registration — registrations and duplications that failed midway,
 * photos no save or submission used — and finishes deleting `discarded`
 * ones left behind.
 *
 * `sweepBefore` is taken once from the run's `now`. Each photo is re-read
 * and re-judged in its own units of work (`discardAndDeletePhoto`), so a
 * photo claimed after the page was read is kept, and a claim committed
 * between the re-read and the discard wins the optimistic lock — that
 * photo is skipped, its content untouched. Owned and deleted photos drop
 * out of the query, so rerunning never deletes a photo in use.
 */
export async function sweepUnownedPhotos({
  container,
  now,
}: Readonly<{ container: RequestContainer; now: Date }>): Promise<DrainReport> {
  const sweepBefore = PhotoPolicy.sweepBefore(container.photoPolicy, now);
  return drainPages<Versioned<PhotoAsset>>({
    job: "sweepUnownedPhotos",
    logger: container.logger,
    keyOf: ({ entity }) => entity.id,
    readPage: (page) =>
      container.unitOfWorkProvider.run(async ({ photoAssetRepository }) => {
        const result = await photoAssetRepository.findPageSweepable(
          sweepBefore,
          { page, limit: PAGE_SIZE },
        );
        return result.items;
      }),
    process: async ({ entity }) => {
      try {
        await discardAndDeletePhoto(container, entity.id, (photo) =>
          PhotoAsset.isAbandoned(photo, sweepBefore),
        );
      } catch (error) {
        if (!isConflictError(error)) throw error;
        container.logger.info(
          `[daily] sweepUnownedPhotos: photo ${entity.id} changed; skipped`,
          { photoId: entity.id },
        );
      }
    },
  });
}

export const sweepUnownedPhotosJob: DailyJob = {
  name: "sweepUnownedPhotos",
  run: (container, now) => sweepUnownedPhotos({ container, now }),
};
