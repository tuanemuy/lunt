/**
 * Listing's `BusinessRuleError` codes (`LISTING_…`,
 * `spec/domains/index.md` 「共有カーネル」). Each code needs an entry in
 * `apps/web/app/presentation/errorCatalog/listing.ts`.
 */
export const ListingErrorCode = {} as const;

export type ListingErrorCode =
  (typeof ListingErrorCode)[keyof typeof ListingErrorCode];
