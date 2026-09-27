import type { AreaCode } from "@repo/core/domain/common/areaCode";

declare const addressBrand: unique symbol;

/**
 * The town part of an address — the tuple a single Area `Town` fixes. One
 * `AreaCode` can map to several towns, so these four values always travel
 * together and are never assembled from independent user input.
 */
export type AddressLocality = Readonly<{
  areaCode: AreaCode;
  prefecture: string;
  municipality: string;
  town: string;
}>;

/** A location: the town the user picked plus the free-text `rest` after it. */
export type Address = AddressLocality &
  Readonly<{ rest: string }> & { readonly [addressBrand]: true };

export const Address = {
  /**
   * Builds an address from a town's locality and the part after the town
   * (trimmed; may be empty). The locality must come from a `Town` the
   * `AreaCatalog` resolved — Area's `Town.toAddress` is the path for fresh
   * input, adapters use this directly only to rehydrate a stored address.
   */
  of: (locality: AddressLocality, rest: string): Address =>
    ({
      areaCode: locality.areaCode,
      prefecture: locality.prefecture,
      municipality: locality.municipality,
      town: locality.town,
      rest: rest.trim(),
    }) as Address,

  /** `prefecture`, `municipality`, `town`, `rest` joined with no separator. */
  text: (address: Address): string =>
    `${address.prefecture}${address.municipality}${address.town}${address.rest}`,

  equals: (a: Address, b: Address): boolean =>
    a.areaCode === b.areaCode &&
    a.prefecture === b.prefecture &&
    a.municipality === b.municipality &&
    a.town === b.town &&
    a.rest === b.rest,
};
