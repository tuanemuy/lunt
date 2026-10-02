import { samplePng } from "@repo/core/adapters/shared/testing/photoSamples";
import type { Actor } from "@repo/core/domain/common/actor";
import { PhotoId } from "@repo/core/domain/common/ids";
import type { RequestContainer } from "../../di/types";
import { registerPhoto } from "../registerPhoto";

let seed = 0;

/**
 * Registers a distinct photo for `actor` through `registerPhoto` and
 * returns its id: `stored`, without an owner, ready to be claimed by the
 * save or submission that shows it. For any domain's usecase tests.
 */
export async function registerTestPhoto(
  container: RequestContainer,
  actor: Actor,
): Promise<PhotoId> {
  const photoId = container.idGenerator.next();
  seed += 1;
  await registerPhoto({
    container,
    actor,
    input: { photoId, bytes: samplePng(seed), agreed: true },
  });
  return PhotoId.create(photoId);
}

/** `registerTestPhoto` `count` times. */
export async function registerTestPhotos(
  container: RequestContainer,
  actor: Actor,
  count: number,
): Promise<readonly PhotoId[]> {
  const ids: PhotoId[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(await registerTestPhoto(container, actor));
  }
  return ids;
}
