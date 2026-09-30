import type { PhotoId } from "@repo/core/domain/common/ids";
import { LineBreak } from "@repo/core/domain/common/lineBreak";
import { BusinessRuleError } from "@repo/core/domain/error";
import { ListingErrorCode } from "./errorCode";

declare const listingNameBrand: unique symbol;
declare const listingDescriptionBrand: unique symbol;
declare const categoryNameBrand: unique symbol;

/** A listing's name: trimmed, non-empty, one line. */
export type ListingName = string & { readonly [listingNameBrand]: true };

/** A listing's description: trimmed, non-empty; may span lines. */
export type ListingDescription = string & {
  readonly [listingDescriptionBrand]: true;
};

/** A category's name: trimmed, non-empty, one line. */
export type CategoryName = string & { readonly [categoryNameBrand]: true };

const oneLine = <T extends string>(
  input: string,
  code: ListingErrorCode,
  label: string,
): T => {
  const value = input.trim();
  if (value.length === 0 || LineBreak.contains(value)) {
    throw new BusinessRuleError(code, `Invalid ${label}`);
  }
  return value as T;
};

export const ListingName = {
  /** Throws `LISTING_INVALID_NAME` when blank or when it has a line break. */
  create: (input: string): ListingName =>
    oneLine<ListingName>(input, ListingErrorCode.InvalidName, "listing name"),
};

export const ListingDescription = {
  /** Throws `LISTING_INVALID_DESCRIPTION` when blank. */
  create: (input: string): ListingDescription => {
    const value = input.trim();
    if (value.length === 0) {
      throw new BusinessRuleError(
        ListingErrorCode.InvalidDescription,
        "Invalid listing description",
      );
    }
    return value as ListingDescription;
  },
};

export const CategoryName = {
  /** Throws `LISTING_INVALID_CATEGORY_NAME` when blank or when it has a line break. */
  create: (input: string): CategoryName =>
    oneLine<CategoryName>(
      input,
      ListingErrorCode.InvalidCategoryName,
      "category name",
    ),
};

/**
 * The part of a photo viewers see, as fractions (0–1) of the photo's
 * width and height; `x`, `y` is the top-left corner.
 */
export type Framing = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

// Fractions a client computes can overshoot 1 by a rounding error
// (`0.7 + 0.30000000000000004`); that is not a framing outside the photo.
const EPSILON = 1e-9;

export const Framing = {
  /** Throws `LISTING_INVALID_FRAMING` unless the rectangle lies inside the photo with a positive size. */
  create: (input: Framing): Framing => {
    const { x, y, width, height } = input;
    const finite = [x, y, width, height].every(Number.isFinite);
    if (
      !finite ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 1 + EPSILON ||
      y + height > 1 + EPSILON
    ) {
      throw new BusinessRuleError(
        ListingErrorCode.InvalidFraming,
        "Invalid framing",
      );
    }
    return { x, y, width, height };
  },
  equals: (a: Framing | null, b: Framing | null): boolean =>
    a === null || b === null
      ? a === b
      : a.x === b.x &&
        a.y === b.y &&
        a.width === b.width &&
        a.height === b.height,
};

/** One photo of a listing; `framing: null` shows the whole photo. */
export type ListingPhoto = Readonly<{
  photoId: PhotoId;
  framing: Framing | null;
}>;

export const ListingPhoto = {
  equals: (a: ListingPhoto, b: ListingPhoto): boolean =>
    a.photoId === b.photoId && Framing.equals(a.framing, b.framing),
};
