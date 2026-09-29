import { Address } from "@repo/core/domain/common/address";
import { GeoPoint } from "@repo/core/domain/common/geo";
import { TextNormalization } from "@repo/core/domain/common/textNormalization";
import { BusinessRuleError } from "@repo/core/domain/error";
import { OccasionErrorCode } from "./errorCode";

declare const occasionNameBrand: unique symbol;
declare const occasionDescriptionBrand: unique symbol;

/** An occasion's name: trimmed, 1–100 characters, one line. */
export type OccasionName = string & { readonly [occasionNameBrand]: true };

/** An occasion's description: trimmed, 1–2000 characters; may span lines. */
export type OccasionDescription = string & {
  readonly [occasionDescriptionBrand]: true;
};

const LINE_BREAK = /[\r\n\u2028\u2029]/u;

const lengthWithin = (value: string, max: number): boolean => {
  const length = TextNormalization.characterCount(value);
  return length >= 1 && length <= max;
};

export const OccasionName = {
  maxLength: 100,
  /** Throws `OCCASION_INVALID_NAME` when blank, over 100 characters or with a line break. */
  create: (input: string): OccasionName => {
    const value = input.trim();
    if (
      !lengthWithin(value, OccasionName.maxLength) ||
      LINE_BREAK.test(value)
    ) {
      throw new BusinessRuleError(
        OccasionErrorCode.InvalidName,
        "Invalid occasion name",
      );
    }
    return value as OccasionName;
  },
};

export const OccasionDescription = {
  maxLength: 2000,
  /** Throws `OCCASION_INVALID_DESCRIPTION` when blank or over 2000 characters. */
  create: (input: string): OccasionDescription => {
    const value = input.trim();
    if (!lengthWithin(value, OccasionDescription.maxLength)) {
      throw new BusinessRuleError(
        OccasionErrorCode.InvalidDescription,
        "Invalid occasion description",
      );
    }
    return value as OccasionDescription;
  },
};

/**
 * Where an occasion is held: an address and one point, each optional
 * until publication. The occasion's area is `address.areaCode`.
 */
export type Venue = Readonly<{
  address: Address | null;
  location: GeoPoint | null;
}>;

/** A venue with both parts — the publish requirement 「開催場所」. */
export type CompleteVenue = Readonly<{ address: Address; location: GeoPoint }>;

const nullableEquals = <T>(
  a: T | null,
  b: T | null,
  equals: (x: T, y: T) => boolean,
): boolean => (a === null || b === null ? a === b : equals(a, b));

export const Venue = {
  empty: (): Venue => ({ address: null, location: null }),
  isComplete: (venue: Venue): venue is CompleteVenue =>
    venue.address !== null && venue.location !== null,
  equals: (a: Venue, b: Venue): boolean =>
    nullableEquals(a.address, b.address, Address.equals) &&
    nullableEquals(a.location, b.location, GeoPoint.equals),
};
