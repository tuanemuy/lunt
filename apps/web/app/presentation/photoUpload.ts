import { CodedError, type FieldErrors } from "@repo/core/lib/error";
import { createServerFn } from "@tanstack/react-start";
import {
  AppServerError,
  type SerializedValidationError,
} from "./errorResponse";
import { errorResponseMiddleware } from "./errorResponseMiddleware";

/**
 * The default largest photo file (CF-01), which the browser checks before
 * sending. The server refuses by the configured `container.photoPolicy`.
 */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

const MIB = 1024 * 1024;

/** `10MB`, or `64KB` below a megabyte. */
const sizeText = (bytes: number): string =>
  bytes >= MIB
    ? `${Math.floor(bytes / MIB)}MB`
    : `${Math.floor(bytes / 1024)}KB`;

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
 * data: the caller-minted id, the consent box and one file. Its size is
 * checked against the configured limit in the handler, which has the
 * container; whether the file is a photo is Media's to decide.
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
      { getPhotoDisplayRef },
      { parseGeneratedId },
      { PhotoId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/media/registerPhoto"),
      import("@repo/core/application/media/getPhotoDisplayRef"),
      import("./validator"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const { maxBytes } = container.photoPolicy;
    if (data.file.size > maxBytes) {
      reject(
        "file",
        `写真は${sizeText(maxBytes)}までのファイルを選んでください`,
      );
    }
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
    const { url } = await getPhotoDisplayRef({
      container,
      input: { photoId: id },
    });
    return { photoId: id, url };
  });
