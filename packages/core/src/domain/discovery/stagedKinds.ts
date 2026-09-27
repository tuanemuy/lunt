/**
 * Aggregates and projections Discovery names but whose domains land in a
 * later stage (`spec/domains/index.md` 「開発の順序との対応」): Region and
 * Occasion in stage 3. Until then nothing of these kinds exists, so a value
 * of them cannot be built and every list of them is empty — a place's
 * affiliated regions and the occasions tied to a place or listing read as
 * empty in stage 2. Each alias is replaced by the owning domain's type when
 * it lands; signatures that take or return them stay as they are.
 */
export type Region = never;

/** Published region (`PublishedRegion`, Region, stage 3). */
export type PublishedRegion = never;

/** A place's region affiliations (`PlaceAffiliations`, Region, stage 3). */
export type PlaceAffiliations = never;

/** Published occasion (`PublishedOccasion`, Occasion, stage 3). */
export type PublishedOccasion = never;

/**
 * The region name a place or listing summary shows (the region's id and
 * name, stage 3; `ViewProjection.regionLabel`).
 */
export type RegionLabel = never;

/** `ViewProjection.regionSummary` of a published region (stage 3). */
export type RegionSummary = never;

/** `ViewProjection.occasionSummary` of a published occasion (stage 3). */
export type OccasionSummary = never;
