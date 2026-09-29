import type {
  ApplicationId,
  InvitationId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import {
  notificationDestinationPath,
  notificationDestinationUrl,
} from "../notificationDestination";

const P = "p1" as PlaceId;
const L = "l1" as ListingId;
const R = "r1" as RegionId;
const C = "c1" as OccasionId;
const Ap = "ap1" as ApplicationId;
const I = "i1" as InvitationId;

describe("notificationDestinationPath", () => {
  it("maps direct destinations to the planned screens", () => {
    expect(
      notificationDestinationPath({
        kind: "ownApplication",
        applicationId: Ap,
      }),
    ).toBe("/me/applications/ap1");
    expect(
      notificationDestinationPath({
        kind: "placeManagement",
        placeId: P,
        facet: "members",
      }),
    ).toBe("/manage/places/p1/members");
    expect(
      notificationDestinationPath({
        kind: "listingManagement",
        listingId: L,
        placeId: P,
      }),
    ).toBe("/manage/places/p1/listings/l1");
    expect(
      notificationDestinationPath({
        kind: "occasionManagement",
        occasionId: C,
        facet: "regionLinks",
      }),
    ).toBe("/manage/events/c1/regions");
    expect(
      notificationDestinationPath({
        kind: "invitation",
        target: { kind: "place", id: P },
        invitationId: I,
      }),
    ).toBe("/invitations/i1?kind=place&id=p1");
    expect(
      notificationDestinationPath({
        kind: "grantedAuthority",
        granted: { kind: "role", role: "operator" },
      }),
    ).toBe("/ops");
  });

  it("opens a stand-in's screen when an operator can stand in there, the target's home otherwise", () => {
    const place = { kind: "place", id: P } as const;
    expect(
      notificationDestinationPath({
        kind: "proxyOperation",
        target: place,
        direct: { kind: "listingManagement", listingId: L, placeId: P },
      }),
    ).toBe("/manage/places/p1/listings/l1");
    expect(
      notificationDestinationPath({
        kind: "proxyOperation",
        target: place,
        direct: { kind: "ownApplication", applicationId: Ap },
      }),
    ).toBe("/manage/places/p1/info");
    expect(
      notificationDestinationPath({
        kind: "proxyOperation",
        target: place,
        direct: { kind: "placeManagement", placeId: P, facet: "members" },
      }),
    ).toBe("/manage/places/p1/info");
    expect(
      notificationDestinationPath({
        kind: "proxyOperation",
        target: { kind: "region", id: R },
        direct: { kind: "regionManagement", regionId: R, facet: "content" },
      }),
    ).toBe("/manage/regions/r1/info");
  });

  it("builds absolute URLs under the app's origin", () => {
    expect(
      notificationDestinationUrl("https://lunt.example", {
        kind: "applicationReview",
        applicationId: Ap,
      }),
    ).toBe("https://lunt.example/manage/applications/ap1");
  });
});
