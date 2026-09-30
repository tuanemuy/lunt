import type { PhotoId } from "@repo/core/domain/common/ids";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import type { ServiceArgs } from "../types";

export type GetPhotoDisplayRefInput = Readonly<{ photoId: PhotoId }>;

/**
 * Where a photo the caller has just registered is shown, for the preview
 * of the form it was added to. Not a spec usecase: `registerPhoto` has no
 * output, and `spec/usecases/media.md` leaves display refs to the reads
 * that return photos — this is that read for the one photo. No access
 * check, as for `registerPhoto`; a ref does not check the content exists.
 */
export async function getPhotoDisplayRef({
  container,
  input,
}: ServiceArgs<GetPhotoDisplayRefInput>): Promise<PhotoDisplayRef> {
  const refs = await container.photoStorage.displayRefs([input.photoId]);
  const ref = refs.get(input.photoId);
  if (ref === undefined) {
    throw new Error(`No display ref for photo ${input.photoId}`);
  }
  return ref;
}
