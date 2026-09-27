import type {
  ListingPhotoItem,
  OfferingStatus,
  PublicationView,
} from "./listingView";
import type { OperatingStatus, PhotoItem } from "./placeView";

/** OM-03's subject kinds in this stage; regions and events join with theirs. */
export const OPS_SUBJECT_KINDS = ["place", "listing"] as const;
export type OpsSubjectKind = (typeof OPS_SUBJECT_KINDS)[number];

export type PlaceSubjectData = Readonly<{
  kind: "place";
  placeId: string;
  name: string;
  cover: PhotoItem | null;
  address: string;
  operatingStatus: OperatingStatus;
  suspended: boolean;
  stewardCount: number;
  /** Pending invitations, oldest first (ISO dates). */
  invitations: readonly Readonly<{ email: string; invitedAt: string }>[];
}>;

export type ListingSubjectData = Readonly<{
  kind: "listing";
  listingId: string;
  name: string | null;
  cover: ListingPhotoItem | null;
  publication: PublicationView;
  suspended: boolean;
  offeringStatus: OfferingStatus;
  place: Readonly<{
    id: string;
    name: string;
    suspended: boolean;
    hasSteward: boolean;
  }>;
}>;

export type OpsSubjectData = PlaceSubjectData | ListingSubjectData;
