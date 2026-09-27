import { describe, expect, it } from "vitest";
import type { DeliveredOccurrence } from "../delivery";
import { NotificationDestination } from "../destination";
import { notificationIds } from "./samples";

const ids = notificationIds();
const P = ids.place();
const L = ids.listing();
const R = ids.region();
const C = ids.occasion();
const A = ids.article();
const Ap = ids.application();
const Rp = ids.report();

const of = (d: DeliveredOccurrence) => NotificationDestination.of(d);

describe("NotificationDestination.of", () => {
  it("sends a proxied approver to the review, other proxies to proxy operation", () => {
    expect(
      of({
        occurrence: {
          to: "approver",
          approver: { kind: "steward", target: { kind: "region", id: R } },
          applicationId: Ap,
          matter: "submitted",
        },
        delivery: "proxy",
      }),
    ).toEqual({ kind: "applicationReview", applicationId: Ap });
    expect(
      of({
        occurrence: {
          to: "applicant",
          applicant: { kind: "place", placeId: P },
          applicationId: Ap,
          matter: "lapsed",
        },
        delivery: "proxy",
      }),
    ).toEqual({
      kind: "proxyOperation",
      target: { kind: "place", id: P },
      direct: { kind: "ownApplication", applicationId: Ap },
    });
  });

  it("maps content occurrences by their kind and matter", () => {
    const content = (
      c: Extract<DeliveredOccurrence["occurrence"], { to: "contentManagers" }>,
    ) => of({ occurrence: c, delivery: "direct" } as DeliveredOccurrence);
    expect(
      content({
        to: "contentManagers",
        content: { kind: "place", id: P },
        matter: { kind: "suspended" },
      }),
    ).toEqual({ kind: "placeManagement", placeId: P, facet: "overview" });
    expect(
      content({
        to: "contentManagers",
        content: { kind: "place", id: P },
        matter: { kind: "photos_taken_down" },
      }),
    ).toEqual({ kind: "placeManagement", placeId: P, facet: "profile" });
    expect(
      content({
        to: "contentManagers",
        content: { kind: "listing", id: L },
        placeId: P,
        matter: { kind: "suspended" },
      }),
    ).toEqual({ kind: "listingManagement", listingId: L });
    expect(
      content({
        to: "contentManagers",
        content: { kind: "article", id: A },
        matter: { kind: "photos_taken_down" },
      }),
    ).toEqual({ kind: "articleEditing", articleId: A });
  });

  it("maps place stewards' matters to their facet", () => {
    const place = (
      matter: Extract<
        DeliveredOccurrence["occurrence"],
        { to: "placeStewards" }
      >["subject"],
    ) =>
      of({
        occurrence: { to: "placeStewards", placeId: P, subject: matter },
        delivery: "direct",
      });
    expect(
      place({
        kind: "place",
        matter: { kind: "excluded_from_region", regionId: R },
      }),
    ).toEqual({ kind: "placeManagement", placeId: P, facet: "affiliations" });
    expect(
      place({
        kind: "place",
        matter: { kind: "occasion_period_changed", occasionId: C },
      }),
    ).toEqual({ kind: "participationEditing", placeId: P, occasionId: C });
    expect(
      place({
        kind: "listing",
        listingId: L,
        matter: { kind: "confirmation_requested", reportId: Rp },
      }),
    ).toEqual({ kind: "confirmationRequest", reportId: Rp });
  });

  it("opens nothing for a revocation", () => {
    expect(
      of({
        occurrence: { to: "self", revoked: { kind: "role", role: "editor" } },
        delivery: "direct",
      }),
    ).toBeNull();
  });
});
