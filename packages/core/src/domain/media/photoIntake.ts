import { BusinessRuleError } from "@repo/core/domain/error";
import { MediaErrorCode } from "./errorCode";
import { mintPhotoFile, type PhotoFile } from "./photoFile";
import type { PhotoInspection } from "./photoInspection";

/**
 * Refuses files that cannot be handled as photos (`spec/domains/media.md`
 * 「PhotoIntake」). Pure: the inspection is done beforehand by the
 * `PhotoInspector` port.
 */
export const PhotoIntake = {
  /**
   * `MEDIA_NOT_A_PHOTO` for a `not_a_photo` inspection. The file's format
   * is the inspected one, never a declared one; its digest is
   * `PhotoDigest.of(bytes)`.
   */
  accept: (bytes: Uint8Array, inspection: PhotoInspection): PhotoFile => {
    if (inspection.kind === "not_a_photo") {
      throw new BusinessRuleError(
        MediaErrorCode.NotAPhoto,
        "The file cannot be read as a still image",
      );
    }
    return mintPhotoFile(bytes, inspection.format);
  },
};
