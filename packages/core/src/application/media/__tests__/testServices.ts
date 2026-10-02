import { InMemoryPhotoBucket } from "@repo/core/adapters/inMemory/inMemoryPhotoBucket";
import { R2PhotoStorage } from "@repo/core/adapters/r2/r2PhotoStorage";
import { StructuralPhotoInspector } from "@repo/core/adapters/shared/structuralPhotoInspector";
import { PhotoPolicy } from "@repo/core/domain/media/photoPolicy";
import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { MediaServices } from "../services";

/** The retention usecase tests run with: 7 days. */
export const TEST_UNOWNED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** The largest file usecase tests register: 64 KiB. */
export const TEST_PHOTO_MAX_BYTES = 64 * 1024;

/**
 * Media's container ports for usecase tests: the production adapters, with
 * an in-memory bucket in place of R2.
 */
export function createTestMediaServices(_deps: TestServiceDeps): MediaServices {
  return {
    photoStorage: new R2PhotoStorage(new InMemoryPhotoBucket()),
    photoInspector: new StructuralPhotoInspector(),
    photoPolicy: PhotoPolicy.create({
      unownedRetentionMs: TEST_UNOWNED_RETENTION_MS,
      maxBytes: TEST_PHOTO_MAX_BYTES,
    }),
  };
}
