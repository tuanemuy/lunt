// Server-only: import from server-function handlers (dynamically) or
// server-only loaders, never from components.
import {
  InfoReportId,
  ListingId,
  PhotoId,
  PlaceId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import type { ReportTargetKind } from "./moderation";

/** The `ContentRef` of a place or listing named by a request (shape checked at the transport). */
export const contentRefOf = (kind: ReportTargetKind, id: string): ContentRef =>
  kind === "place"
    ? { kind: "place", id: PlaceId.create(id) }
    : { kind: "listing", id: ListingId.create(id) };

export const photoIdOf = (raw: string): PhotoId => PhotoId.create(raw);

export const claimIdOf = (raw: string): TakedownClaimId =>
  TakedownClaimId.create(raw);

export const reportIdOf = (raw: string): InfoReportId =>
  InfoReportId.create(raw);
