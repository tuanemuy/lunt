import type { StewardedRef } from "@repo/core/domain/common/refs";
import type {
  DirectDestination,
  NotificationDestination,
  PlaceFacet,
} from "@repo/core/domain/notification/destination";

/**
 * Where a `NotificationDestination` opens: the one destination → screen
 * mapping, shared by the notification mail renderer (`notificationMail.ts`)
 * and the notification list (MY-03). Screens follow `spec/pages/index.md`
 * 「通知から開く画面」 and the URL plan of `.spec-implement/phases/P0.md`
 * (付録: 画面と URL の対応): RM `/manage/regions/$regionId(/info|/events)`,
 * EM `/manage/events/$occasionId(/info|/regions)`, CM-04
 * `/manage/places/$placeId/events/$occasionId`, SM-05 / SM-06
 * `/manage/places/$placeId/(regions|events)`.
 *
 * Paths the plan does not give directly:
 * - `confirmationRequest` (SM-07) sits under its place
 *   (`/manage/places/$placeId/…`), which the destination does not carry. It
 *   opens `/manage/checks/$reportId`, which resolves the place and redirects
 *   to the planned screen. `listingManagement` carries its place, so SM-04
 *   opens directly — for a deleted listing too, as CS-17 in the store's frame
 *   leading to its listings (SM-03).
 * - `invitation` (MY-06): an invitation is found by its target and id, so
 *   the target travels as `?kind=&id=` next to `/invitations/$invitationId`.
 * - `occasionParticipant` opens EM-01 with `?participant=$placeId`, which
 *   shows that place's current participation.
 */

const PLACE_FACET_PATH: Readonly<Record<PlaceFacet, string>> = {
  overview: "", // SM-01
  profile: "/info", // SM-02
  listings: "/listings", // SM-03
  affiliations: "/regions", // SM-05
  participations: "/events", // SM-06
  members: "/members", // CM-02
};

const segment = (id: string): string => encodeURIComponent(id);

const placePath = (placeId: string, facet: PlaceFacet): string =>
  `/manage/places/${segment(placeId)}${PLACE_FACET_PATH[facet]}`;

function stewardedHome(target: StewardedRef): string {
  switch (target.kind) {
    case "place":
      return placePath(target.id, "overview");
    case "region":
      return `/manage/regions/${segment(target.id)}`;
    case "occasion":
      return `/manage/events/${segment(target.id)}`;
  }
}

function directPath(d: DirectDestination): string {
  switch (d.kind) {
    case "ownApplication":
      return `/me/applications/${segment(d.applicationId)}`;
    case "applicationReview":
      return `/manage/applications/${segment(d.applicationId)}`;
    case "placeManagement":
      return placePath(d.placeId, d.facet);
    case "participationEditing":
      return `/manage/places/${segment(d.placeId)}/events/${segment(d.occasionId)}`;
    case "listingManagement":
      // A listing may be deleted before the notification is opened: SM-04's
      // CS-17 then leads back to MY-03 as well as to the store's listings.
      return `${placePath(d.placeId, "listings")}/${segment(d.listingId)}?from=notifications`;
    case "confirmationRequest":
      return `/manage/checks/${segment(d.reportId)}`;
    case "regionManagement":
      return `/manage/regions/${segment(d.regionId)}/${d.facet === "content" ? "info" : "events"}`;
    case "occasionManagement":
      return `/manage/events/${segment(d.occasionId)}/${d.facet === "content" ? "info" : "regions"}`;
    case "occasionParticipant":
      return `/manage/events/${segment(d.occasionId)}?participant=${segment(d.placeId)}`;
    case "articleEditing":
      return `/editorial/articles/${segment(d.articleId)}`;
    case "takedownClaimHandling":
      return `/ops/takedowns/${segment(d.claimId)}`;
    case "infoReportHandling":
      return `/ops/reports/${segment(d.reportId)}`;
    case "invitation":
      return `/invitations/${segment(d.invitationId)}?kind=${d.target.kind}&id=${segment(d.target.id)}`;
    case "grantedAuthority":
      if (d.granted.kind === "stewardship") {
        return stewardedHome(d.granted.target);
      }
      return d.granted.role === "editor" ? "/editorial" : "/ops";
  }
}

/**
 * Whether an operator can open `direct` as a stand-in for `target`'s
 * missing stewards (`spec/pages/index.md` 「サービス運営者の不在の代行」):
 * a place's SM-02 / SM-03 / SM-04 / CM-03, a region's RM-01–RM-03, an
 * occasion's EM-01–EM-03 / CM-04.
 */
function openableAsProxy(target: StewardedRef, direct: DirectDestination) {
  switch (direct.kind) {
    case "placeManagement":
      return (
        target.kind === "place" &&
        (direct.facet === "profile" || direct.facet === "listings")
      );
    case "listingManagement":
      return target.kind === "place";
    case "regionManagement":
      return target.kind === "region";
    case "occasionManagement":
    case "occasionParticipant":
      return target.kind === "occasion";
    default:
      return false;
  }
}

/**
 * The path (with query) a destination opens, relative to the app's origin.
 * A stand-in destination opens the steward's screen when an operator can
 * open it as a stand-in, and otherwise the vacant target's home — SM-02
 * for a place (MY-05 of a place's application included), RM-01 / EM-01
 * for a region / occasion.
 */
export function notificationDestinationPath(
  destination: NotificationDestination,
): string {
  if (destination.kind !== "proxyOperation") return directPath(destination);
  const { target, direct } = destination;
  if (openableAsProxy(target, direct)) return directPath(direct);
  return target.kind === "place"
    ? placePath(target.id, "profile")
    : stewardedHome(target);
}

/** The absolute URL of a destination under `appUrl` (mails). */
export function notificationDestinationUrl(
  appUrl: string,
  destination: NotificationDestination,
): string {
  return new URL(notificationDestinationPath(destination), appUrl).toString();
}
