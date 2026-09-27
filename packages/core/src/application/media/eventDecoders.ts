import type { EventDecoder } from "@repo/core/domain/common/event";
import { PhotoId } from "@repo/core/domain/common/ids";
import type { PhotosReleasedEvent } from "@repo/core/domain/common/photoEvents";
import { z } from "zod";
import { SystemError, SystemErrorCode } from "../errors";
import { buildEventDecoder } from "../events/buildDecoder";

type PhotoEventDecoders = {
  readonly "photos.released": EventDecoder<PhotosReleasedEvent>;
};

/**
 * Decoder of the shared kernel's `photos.released` as stored in the outbox.
 * Media consumes it; the photo-owning domains emit it.
 */
export const photoEventDecoders: PhotoEventDecoders = {
  "photos.released": buildEventDecoder(
    "photos.released",
    z.object({ photoIds: z.array(z.string()) }).strict(),
    (p) => {
      try {
        return { photoIds: p.photoIds.map((id) => PhotoId.create(id)) };
      } catch (error) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored photos.released event holds an invalid photo id",
          error,
        );
      }
    },
  ),
};
