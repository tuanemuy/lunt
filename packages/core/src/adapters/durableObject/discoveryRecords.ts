import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { PublishedArticle } from "@repo/core/domain/article/article";
import { ListingId, PhotoId } from "@repo/core/domain/common/ids";
import type {
  ListingEntry,
  ParticipantEntry,
  PlaceEntry,
  Scored,
  SubstituteCover,
} from "@repo/core/domain/discovery/entry";
import { ViewProjection } from "@repo/core/domain/discovery/viewProjection";
import { VisibilityPolicy } from "@repo/core/domain/discovery/visibilityPolicy";
import { isBusinessRuleError } from "@repo/core/domain/error";
import {
  Listing,
  type PublishedListing,
} from "@repo/core/domain/listing/listing";
import { Framing } from "@repo/core/domain/listing/values";
import type { PublishedOccasion } from "@repo/core/domain/occasion/occasion";
import type { PublishedRegion } from "@repo/core/domain/region/region";
import type { ArticleRecord } from "./protocol/article";
import type {
  ListingEntryRecord,
  ParticipantEntryRecord,
  PlaceEntryRecord,
  ScoredRecord,
  SubstituteCoverRecord,
} from "./protocol/discovery";
import type { ListingRecord } from "./protocol/listing";
import type { OccasionRecord } from "./protocol/occasion";
import type { RegionRecord } from "./protocol/region";
import { DoArticleRepository } from "./repositories/articleRepository";
import { listingFromRecord } from "./repositories/listingRepository";
import { occasionFromRecord } from "./repositories/occasionRepository";
import { participationFromRecord } from "./repositories/participationRepository";
import { DoPlaceAffiliationsRepository } from "./repositories/placeAffiliationsRepository";
import { DoPlaceRepository } from "./repositories/placeRepository";
import { DoRegionRepository } from "./repositories/regionRepository";

/*
 * Rehydration of Discovery's records on the request side. The object
 * returns viewable targets only, so a target that is not viewable here is
 * a data-integrity failure.
 */

const integrity = (message: string, cause?: unknown): SystemError =>
  new SystemError(SystemErrorCode.DataIntegrityError, message, cause);

function substituteCoverFrom(
  record: SubstituteCoverRecord,
  idGenerator: IdGenerator,
): SubstituteCover {
  const malformed = [record.listingId, record.photo.photoId].find(
    (id) => idGenerator.parse(id) === null,
  );
  if (malformed !== undefined) {
    throw integrity(`Stored substitute cover has malformed id: ${malformed}`);
  }
  try {
    return {
      listingId: ListingId.create(record.listingId),
      photo: {
        photoId: PhotoId.create(record.photo.photoId),
        framing:
          record.photo.framing === null
            ? null
            : Framing.create(record.photo.framing),
      },
    };
  } catch (error) {
    if (isBusinessRuleError(error)) {
      throw integrity("Stored substitute cover violates invariants", error);
    }
    throw error;
  }
}

/** A viewable region; `DATA_INTEGRITY_ERROR` when the record is not one. */
export function publishedRegionFrom(
  record: RegionRecord,
  idGenerator: IdGenerator,
): PublishedRegion {
  const region = DoRegionRepository.toRegion(record, idGenerator);
  if (!VisibilityPolicy.viewableRegion(region)) {
    throw integrity(`Viewable region ${region.id} is not viewable`);
  }
  return region;
}

/** A viewable occasion; `DATA_INTEGRITY_ERROR` when the record is not one. */
export function publishedOccasionFrom(
  record: OccasionRecord,
  idGenerator: IdGenerator,
): PublishedOccasion {
  const occasion = occasionFromRecord(record, idGenerator);
  if (!VisibilityPolicy.viewableOccasion(occasion)) {
    throw integrity(`Viewable occasion ${occasion.id} is not viewable`);
  }
  return occasion;
}

/** A viewable article; `DATA_INTEGRITY_ERROR` when the record is not one. */
export function publishedArticleFrom(
  record: ArticleRecord,
  idGenerator: IdGenerator,
): PublishedArticle {
  const article = DoArticleRepository.toArticle(record, idGenerator);
  if (!VisibilityPolicy.viewableArticle(article)) {
    throw integrity(`Viewable article ${article.id} is not viewable`);
  }
  return article;
}

/**
 * A stored place entry; its regions ordered by `ViewProjection.regionsOf`
 * from the stored affiliations. `DATA_INTEGRITY_ERROR` when it is not one.
 */
export function placeEntryFrom(
  record: PlaceEntryRecord,
  idGenerator: IdGenerator,
): PlaceEntry {
  return {
    place: DoPlaceRepository.toPlace(record.place, idGenerator),
    regions: ViewProjection.regionsOf(
      record.affiliations === null
        ? null
        : DoPlaceAffiliationsRepository.toAggregate(
            record.affiliations,
            idGenerator,
          ),
      record.regions.map((region) => publishedRegionFrom(region, idGenerator)),
    ),
    substituteCover:
      record.substituteCover === null
        ? null
        : substituteCoverFrom(record.substituteCover, idGenerator),
  };
}

function publishedListingFrom(
  record: ListingRecord,
  idGenerator: IdGenerator,
): PublishedListing {
  const listing = listingFromRecord(record, idGenerator);
  if (!Listing.isPublished(listing)) {
    throw integrity(`Viewable listing ${listing.id} is not published`);
  }
  return listing;
}

/** A stored listing entry; `DATA_INTEGRITY_ERROR` when it is not one. */
export function listingEntryFrom(
  record: ListingEntryRecord,
  idGenerator: IdGenerator,
): ListingEntry {
  return {
    listing: publishedListingFrom(record.listing, idGenerator),
    place: placeEntryFrom(record.place, idGenerator),
  };
}

/** A stored participant entry; `DATA_INTEGRITY_ERROR` when it is not one. */
export function participantEntryFrom(
  record: ParticipantEntryRecord,
  idGenerator: IdGenerator,
): ParticipantEntry {
  return {
    place: placeEntryFrom(record.place, idGenerator),
    participation: participationFromRecord(record.participation, idGenerator),
    listings: record.listings.map((listing) =>
      publishedListingFrom(listing, idGenerator),
    ),
  };
}

export const scoredFrom =
  <R, T>(convert: (record: R, idGenerator: IdGenerator) => T) =>
  (record: ScoredRecord<R>, idGenerator: IdGenerator): Scored<T> => ({
    entry: convert(record.entry, idGenerator),
    relevance: record.relevance,
  });
