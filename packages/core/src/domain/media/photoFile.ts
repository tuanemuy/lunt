import { BusinessRuleError } from "@repo/core/domain/error";
import { MediaErrorCode } from "./errorCode";
import { sha256Hex } from "./sha256";

declare const photoFormatBrand: unique symbol;
declare const photoDigestBrand: unique symbol;
declare const photoFileBrand: unique symbol;

/** The media type of a still image, e.g. `image/jpeg`. */
export type PhotoFormat = string & { readonly [photoFormatBrand]: true };

const MEDIA_TYPE = /^image\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

export const PhotoFormat = {
  /** `MEDIA_INVALID_FORMAT` unless `input` is an `image/…` media type. */
  create: (input: string): PhotoFormat => {
    if (!MEDIA_TYPE.test(input)) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidFormat,
        `Not an image media type: ${input}`,
      );
    }
    return input as PhotoFormat;
  },
  equals: (a: PhotoFormat, b: PhotoFormat): boolean => a === b,
};

/**
 * The SHA-256 of a photo file's bytes in lowercase hexadecimal. Decides
 * whether a resent registration carries the same file.
 */
export type PhotoDigest = string & { readonly [photoDigestBrand]: true };

const DIGEST = /^[0-9a-f]{64}$/;

export const PhotoDigest = {
  /** The only place a digest is computed. */
  of: (bytes: Uint8Array): PhotoDigest => sha256Hex(bytes) as PhotoDigest,

  /**
   * Accepts a digest read back from storage. Throws a plain `Error` (the
   * caller's `reconstruct` turns it into `RehydrationError`): a malformed
   * stored digest is corrupt data, never user input.
   */
  restore: (raw: string): PhotoDigest => {
    if (!DIGEST.test(raw)) throw new Error(`Malformed photo digest: ${raw}`);
    return raw as PhotoDigest;
  },

  equals: (a: PhotoDigest, b: PhotoDigest): boolean => a === b,
};

/**
 * A file accepted for registration: its bytes, the format read from its
 * content (never the one the user declared), and its digest. Only
 * `PhotoIntake.accept` makes one. Files are not compared; `digest` decides
 * sameness.
 */
export type PhotoFile = Readonly<{
  bytes: Uint8Array;
  format: PhotoFormat;
  digest: PhotoDigest;
  readonly [photoFileBrand]: true;
}>;

/** Internal to the domain: `PhotoIntake.accept` is the public way in. */
export const mintPhotoFile = (
  bytes: Uint8Array,
  format: PhotoFormat,
): PhotoFile => ({ bytes, format, digest: PhotoDigest.of(bytes) }) as PhotoFile;
