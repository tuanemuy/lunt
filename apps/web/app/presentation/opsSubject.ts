import type {
  ListingPhotoItem,
  OfferingStatus,
  PublicationView,
} from "./listingView";
import type { OperatingStatus, PhotoItem } from "./placeView";
import type { HoldingStatus } from "./regionView";

/** OM-03's subject kinds (`/ops/subjects/$kind/$id`). */
export const OPS_SUBJECT_KINDS = [
  "place",
  "listing",
  "region",
  "occasion",
] as const;
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

/** Pending invitations of a stewarded subject, oldest first (ISO dates). */
type PendingInvitations = readonly Readonly<{
  email: string;
  invitedAt: string;
}>[];

export type RegionSubjectData = Readonly<{
  kind: "region";
  regionId: string;
  name: string | null;
  cover: PhotoItem | null;
  publication: PublicationView;
  suspended: boolean;
  viewable: boolean;
  stewardCount: number;
  invitations: PendingInvitations;
}>;

export type OccasionSubjectData = Readonly<{
  kind: "occasion";
  occasionId: string;
  name: string | null;
  cover: PhotoItem | null;
  publication: PublicationView;
  suspended: boolean;
  holdingStatus: HoldingStatus | null;
  /** Days as `YYYY-MM-DD`. */
  period: Readonly<{ start: string; end: string }> | null;
  viewable: boolean;
  stewardCount: number;
  invitations: PendingInvitations;
}>;

export type OpsSubjectData =
  | PlaceSubjectData
  | ListingSubjectData
  | RegionSubjectData
  | OccasionSubjectData;

/** The subjects OM-03 suspends through `changeSuspensionFn`. */
export const SUSPENDABLE_KINDS = ["region", "occasion"] as const;
export type SuspendableKind = (typeof SUSPENDABLE_KINDS)[number];
