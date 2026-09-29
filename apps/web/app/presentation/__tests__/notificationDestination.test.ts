import type {
  ApplicationId,
  InvitationId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { NotificationDestination } from "@repo/core/domain/notification/destination";
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
    ).toBe("/manage/places/p1/listings/l1?from=notifications");
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

  it("maps region, occasion and participation destinations to RM, EM, CM-04, SM-05 and SM-06", () => {
    const cases = [
      [
        { kind: "regionManagement", regionId: R, facet: "content" },
        "/manage/regions/r1/info",
      ],
      [
        { kind: "regionManagement", regionId: R, facet: "occasionLinks" },
        "/manage/regions/r1/events",
      ],
      [
        { kind: "occasionManagement", occasionId: C, facet: "content" },
        "/manage/events/c1/info",
      ],
      [
        { kind: "occasionParticipant", occasionId: C, placeId: P },
        "/manage/events/c1?participant=p1",
      ],
      [
        { kind: "participationEditing", placeId: P, occasionId: C },
        "/manage/places/p1/events/c1",
      ],
      [
        { kind: "placeManagement", placeId: P, facet: "affiliations" },
        "/manage/places/p1/regions",
      ],
      [
        { kind: "placeManagement", placeId: P, facet: "participations" },
        "/manage/places/p1/events",
      ],
      [
        {
          kind: "grantedAuthority",
          granted: { kind: "stewardship", target: { kind: "occasion", id: C } },
        },
        "/manage/events/c1",
      ],
    ] as const satisfies readonly (readonly [
      NotificationDestination,
      string,
    ])[];
    for (const [destination, path] of cases) {
      expect(notificationDestinationPath(destination)).toBe(path);
    }
  });

  it("stands in on a vacant region's or occasion's own screens, and on a vacant place's SM-02 for its affiliations, participations and CM-04", () => {
    const region = { kind: "region", id: R } as const;
    const occasion = { kind: "occasion", id: C } as const;
    const place = { kind: "place", id: P } as const;
    expect(
      notificationDestinationPath({
        kind: "proxyOperation",
        target: region,
        direct: {
          kind: "regionManagement",
          regionId: R,
          facet: "occasionLinks",
        },
      }),
    ).toBe("/manage/regions/r1/events");
    expect(
      notificationDestinationPath({
        kind: "proxyOperation",
        target: occasion,
        direct: { kind: "occasionParticipant", occasionId: C, placeId: P },
      }),
    ).toBe("/manage/events/c1?participant=p1");
    expect(
      notificationDestinationPath({
        kind: "proxyOperation",
        target: occasion,
        direct: {
          kind: "occasionManagement",
          occasionId: C,
          facet: "regionLinks",
        },
      }),
    ).toBe("/manage/events/c1/regions");
    for (const direct of [
      { kind: "placeManagement", placeId: P, facet: "affiliations" },
      { kind: "placeManagement", placeId: P, facet: "participations" },
      { kind: "participationEditing", placeId: P, occasionId: C },
    ] as const) {
      expect(
        notificationDestinationPath({
          kind: "proxyOperation",
          target: place,
          direct,
        }),
      ).toBe("/manage/places/p1/info");
    }
  });

  it("opens a stand-in's screen when an operator can stand in there, the target's home otherwise", () => {
    const place = { kind: "place", id: P } as const;
    expect(
      notificationDestinationPath({
        kind: "proxyOperation",
        target: place,
        direct: { kind: "listingManagement", listingId: L, placeId: P },
      }),
    ).toBe("/manage/places/p1/listings/l1?from=notifications");
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
