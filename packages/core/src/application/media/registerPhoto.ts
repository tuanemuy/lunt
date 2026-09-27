import { PhotoId } from "@repo/core/domain/common/ids";
import { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import { PhotoConsent } from "@repo/core/domain/media/photoConsent";
import { PhotoIntake } from "@repo/core/domain/media/photoIntake";
import { ConflictError } from "../errors";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";

export type RegisterPhotoInput = Readonly<{
  /** Minted by the caller and resent unchanged on failure. */
  photoId: GeneratedId;
  /** The file's content as received; its declared type is not used. */
  bytes: Uint8Array;
  /** Whether the user agreed to the photo's rights and use on Lunt. */
  agreed: boolean;
}>;

/** A registration's id is already used by another photo, or a discarded one. */
export const PHOTO_ID_CONFLICT = "PHOTO_ID_CONFLICT";

/**
 * A signed-in user registers one photo with consent (`spec/usecases/media.md`
 * 「registerPhoto」; LST-02, SHP-03, EDT-01, APP-02 and others). The photo
 * ends `stored` without an owner; saving or submitting what shows it sets
 * the owner. No access check: any signed-in user may register.
 *
 * Idempotent create over two units of work with the content upload
 * between them. A resend (`PhotoAsset.isResendOf`: same registrant, same
 * file) of an `accepted` photo continues from the upload; of a `stored`
 * one succeeds without writing.
 *
 * - `BusinessRuleError` `MEDIA_INVALID_CONSENT` / `MEDIA_NOT_A_PHOTO`,
 *   checked before any write.
 * - `ConflictError` when the id belongs to another registrant or file, to a
 *   `discarded` photo, or to a deleted one; and when the sweep discarded
 *   the photo during the upload — the uploaded content is then deleted.
 * - No domain event.
 */
export async function registerPhoto({
  container,
  actor,
  input,
}: ActorServiceArgs<RegisterPhotoInput>): Promise<void> {
  const now = container.clock.now();
  const consent = PhotoConsent.agree({ agreed: input.agreed }, now);
  const inspection = await container.photoInspector.inspect(input.bytes);
  const file = PhotoIntake.accept(input.bytes, inspection);
  const id = PhotoId.create(input.photoId);

  const next = await container.unitOfWorkProvider.run(
    async ({ photoAssetRepository }): Promise<"upload" | "done"> => {
      const found = await photoAssetRepository.findById(id);
      if (found === null) {
        await photoAssetRepository.insert(
          PhotoAsset.register({ id, registrant: actor, consent, file }, now),
        );
        return "upload";
      }
      const photo = found.entity;
      if (
        photo.stage === "discarded" ||
        !PhotoAsset.isResendOf(photo, { registrant: actor, file })
      ) {
        throw new ConflictError(
          PHOTO_ID_CONFLICT,
          `Photo id ${id} is already used`,
        );
      }
      return photo.stage === "accepted" ? "upload" : "done";
    },
  );
  if (next === "done") return;

  await container.photoStorage.put(id, file);

  const settled = await container.unitOfWorkProvider.run(
    async ({ photoAssetRepository }): Promise<"stored" | "swept"> => {
      const found = await photoAssetRepository.findById(id);
      if (found === null || found.entity.stage === "discarded") return "swept";
      if (found.entity.stage === "accepted") {
        await photoAssetRepository.save(
          PhotoAsset.markStored(found.entity),
          found.expectedVersion,
        );
      }
      return "stored";
    },
  );
  if (settled === "swept") {
    // The sweep may already have deleted the content; what the upload put
    // back must not outlive the record.
    await container.photoStorage.delete(id);
    throw new ConflictError(
      PHOTO_ID_CONFLICT,
      `Photo ${id} was discarded while its content was uploaded`,
    );
  }
}
