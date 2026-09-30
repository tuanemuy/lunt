// Server-only: import from server-function handlers (dynamically) or
// server-only loaders, never from components.
import {
  ArticleId,
  InfoReportId,
  ListingId,
  OccasionId,
  PhotoId,
  PlaceId,
  RegionId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import type { TakedownTargetKind } from "./moderation";

/** The `ContentRef` of a target named by a request (shape checked at the transport). */
export function contentRefOf(kind: TakedownTargetKind, id: string): ContentRef {
  switch (kind) {
    case "place":
      return { kind: "place", id: PlaceId.create(id) };
    case "listing":
      return { kind: "listing", id: ListingId.create(id) };
    case "region":
      return { kind: "region", id: RegionId.create(id) };
    case "occasion":
      return { kind: "occasion", id: OccasionId.create(id) };
    case "article":
      return { kind: "article", id: ArticleId.create(id) };
  }
}

export const photoIdOf = (raw: string): PhotoId => PhotoId.create(raw);

export const claimIdOf = (raw: string): TakedownClaimId =>
  TakedownClaimId.create(raw);

export const reportIdOf = (raw: string): InfoReportId =>
  InfoReportId.create(raw);
