import { CodedError, type FieldErrors } from "@repo/core/lib/error";
import { createServerFn } from "@tanstack/react-start";
import {
  AppServerError,
  type SerializedValidationError,
} from "./errorResponse";
import { errorResponseMiddleware } from "./errorResponseMiddleware";

/** The largest photo file the transport accepts (CF-01). */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** A registered photo, ready to be placed in a form's photo list. */
export type UploadedPhoto = Readonly<{ photoId: string; url: string }>;

export type PhotoUpload = Readonly<{
  photoId: string;
  agreed: boolean;
  file: File;
}>;

class UploadValidationError extends CodedError {
  override readonly name = "UploadValidationError";

  constructor(public readonly fieldErrors: FieldErrors) {
    super("INVALID_INPUT", "Invalid photo upload");
  }

  override toSerialized(): SerializedValidationError {
    return {
      kind: "validation",
      code: this.code,
      message: this.message,
      retryable: false,
      fieldErrors: this.fieldErrors,
    };
  }
}

const reject = (field: string, message: string): never => {
  throw new AppServerError(
    new UploadValidationError({ [field]: [message] }).toSerialized(),
  );
};

/**
 * The transport check of a photo registration posted as multipart form
 * data: the caller-minted id, the consent box and one file of at most
 * `PHOTO_MAX_BYTES`. Whether the file is a photo is Media's to decide.
 */
export function parsePhotoUpload(input: FormData): PhotoUpload {
  if (!(input instanceof FormData))
    return reject("file", "写真を選んでください");
  const photoId = input.get("photoId");
  if (
    typeof photoId !== "string" ||
    photoId.length === 0 ||
    photoId.length > 64
  ) {
    return reject("photoId", "Invalid id");
  }
  const file = input.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return reject("file", "写真を選んでください");
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return reject("file", "写真は10MBまでのファイルを選んでください");
  }
  return { photoId, agreed: input.get("agreed") === "true", file };
}

/**
 * CF-01: registers one photo with consent (`registerPhoto`). The id is
 * minted by the client once per chosen file and resent on a retry, so a
 * lost answer does not register the file twice. Answers the photo's id
 * and the URL its content is served from.
 */
export const uploadPhotoFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(parsePhotoUpload)
  .handler(async ({ data }): Promise<UploadedPhoto> => {
    const [
      { getContainer },
      { requireActor },
      { registerPhoto },
      { parseGeneratedId },
      { PhotoId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/media/registerPhoto"),
      import("./validator"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const photoId = parseGeneratedId(
      container.idGenerator,
      "photoId",
      data.photoId,
    );
    await registerPhoto({
      container,
      actor,
      input: {
        photoId,
        bytes: new Uint8Array(await data.file.arrayBuffer()),
        agreed: data.agreed,
      },
    });
    const id = PhotoId.create(photoId);
    const refs = await container.photoStorage.displayRefs([id]);
    const ref = refs.get(id);
    if (ref === undefined) throw new Error(`No display ref for photo ${id}`);
    return { photoId: id, url: ref.url };
  });
