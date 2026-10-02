import type { PhotoBucket } from "@repo/core/adapters/r2/photoBucket";
import { R2PhotoStorage } from "@repo/core/adapters/r2/r2PhotoStorage";
import { StructuralPhotoInspector } from "@repo/core/adapters/shared/structuralPhotoInspector";
import { PhotoPolicy } from "@repo/core/domain/media/photoPolicy";
import type { PhotoStorage } from "@repo/core/domain/media/ports/photoStorage";
import { z } from "zod";
import { SystemError, SystemErrorCode } from "../errors";
import type { MediaServices } from "../media/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment Media's wiring reads. */
export type MediaEnv = Readonly<{
  /** The R2 bucket binding holding photo content (design.md D-09). */
  PHOTOS?: PhotoBucket | undefined;
  /** How long an unowned photo is kept, in ms (default 7 days). */
  PHOTO_UNOWNED_RETENTION_MS?: string | undefined;
  /** The largest photo file registration accepts, in bytes (default 10 MiB). */
  PHOTO_MAX_BYTES?: string | undefined;
}>;

export const DEFAULT_PHOTO_UNOWNED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

const policySchema = z.object({
  unownedRetentionMs: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_PHOTO_UNOWNED_RETENTION_MS),
  maxBytes: z.coerce.number().int().positive().default(DEFAULT_PHOTO_MAX_BYTES),
});

export function readPhotoPolicy(env: MediaEnv): PhotoPolicy {
  return PhotoPolicy.create(
    policySchema.parse({
      unownedRetentionMs: env.PHOTO_UNOWNED_RETENTION_MS,
      maxBytes: env.PHOTO_MAX_BYTES,
    }),
  );
}

const unconfigured = (): Promise<never> =>
  Promise.reject(
    new SystemError(
      SystemErrorCode.ExternalApiError,
      "Photo storage is not configured: the PHOTOS bucket binding is missing",
    ),
  );

/**
 * Stands in when the Worker has no `PHOTOS` binding. Fails on use rather
 * than at wiring, so a container built where photos are never touched (the
 * test worker's queue, for one) still builds.
 */
const unconfiguredPhotoStorage: PhotoStorage = {
  put: unconfigured,
  copy: unconfigured,
  delete: unconfigured,
  displayRefs: unconfigured,
};

export function createMediaServices(
  env: MediaEnv,
  _deps: ServiceDeps,
): MediaServices {
  return {
    photoStorage:
      env.PHOTOS === undefined
        ? unconfiguredPhotoStorage
        : new R2PhotoStorage(env.PHOTOS),
    photoInspector: new StructuralPhotoInspector(),
    photoPolicy: readPhotoPolicy(env),
  };
}
