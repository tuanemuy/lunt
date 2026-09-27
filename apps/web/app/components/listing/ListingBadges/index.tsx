import { Badge } from "@/components/ui/Badge";
import {
  type OfferingStatus,
  offeringPhaseLabel,
  type PublicationView,
  publicationLabel,
} from "@/presentation/listingView";

/**
 * A listing's states as the management lists show them
 * (「管理する対象の状態」): 運営による非公開 over the publication state,
 * then the offering state — manual and automatic ends told apart.
 */
export function ListingBadges({
  publication,
  suspended,
  offeringStatus,
}: {
  publication: PublicationView;
  suspended: boolean;
  offeringStatus: OfferingStatus;
}) {
  return (
    <>
      {suspended ? <Badge tone="alert">運営による非公開</Badge> : null}
      <Badge
        tone={
          publication.status === "published"
            ? "accent"
            : publication.status === "unpublished"
              ? "muted"
              : "neutral"
        }
      >
        {publicationLabel(publication)}
      </Badge>
      <Badge tone={offeringStatus.phase === "ended" ? "muted" : "neutral"}>
        {offeringPhaseLabel(offeringStatus)}
      </Badge>
    </>
  );
}
