import type { PhotoInspection } from "../photoInspection";

/**
 * Reads a file's content to decide whether it is a still image and in
 * which format (`spec/domains/media.md` 「PhotoInspector」). Judges by the
 * bytes alone — never a file name or a declared type — gives the same
 * answer for the same bytes, and reports an unreadable file as
 * `not_a_photo` instead of failing.
 */
export interface PhotoInspector {
  inspect(bytes: Uint8Array): Promise<PhotoInspection>;
}
