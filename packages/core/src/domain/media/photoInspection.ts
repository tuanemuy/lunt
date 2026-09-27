import type { PhotoFormat } from "./photoFile";

/**
 * What `PhotoInspector` read from a file's content. `not_a_photo` is any
 * file that cannot be read as a still image: a video, a broken file, a
 * file that is not an image.
 */
export type PhotoInspection =
  | Readonly<{ kind: "photo"; format: PhotoFormat }>
  | Readonly<{ kind: "not_a_photo" }>;
