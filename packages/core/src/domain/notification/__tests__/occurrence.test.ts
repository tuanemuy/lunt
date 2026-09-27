import { describe, expect, it } from "vitest";
import { DeliveredOccurrence } from "../delivery";
import { NotificationDestination } from "../destination";
import { Occurrence } from "../occurrence";
import { AUDIENCES, notificationIds, sampleOccurrences } from "./samples";

describe("Occurrence", () => {
  const { samples, place, listing, region, occasion, article } =
    sampleOccurrences();
  const byName = (name: string) => {
    const found = samples.find((sample) => sample.name === name);
    if (found === undefined) throw new Error(`no sample ${name}`);
    return found.delivered;
  };

  it("samples cover every audience", () => {
    expect(
      new Set(samples.map((sample) => sample.delivered.occurrence.to)),
    ).toEqual(new Set(AUDIENCES));
  });

  it("points at the content of each audience's table row", () => {
    const pointed = (name: string) =>
      Occurrence.pointedContent(byName(name).occurrence);
    expect(pointed("contentManagers / listing")).toEqual({
      kind: "listing",
      id: listing,
    });
    expect(pointed("placeStewards / place steward_added")).toEqual({
      kind: "place",
      id: place,
    });
    expect(pointed("placeStewards / listing confirmation_requested")).toEqual({
      kind: "listing",
      id: listing,
    });
    expect(pointed("regionStewards")).toEqual({ kind: "region", id: region });
    expect(pointed("occasionStewards / region_link_detached")).toEqual({
      kind: "occasion",
      id: occasion,
    });
    expect(pointed("editors")).toEqual({ kind: "article", id: article });
    expect(pointed("invitee")).toEqual({ kind: "place", id: place });
    expect(pointed("grantee / stewardship")).toEqual({
      kind: "occasion",
      id: occasion,
    });
    expect(pointed("grantee / role")).toBeNull();
    expect(pointed("self / stewardship")).toEqual({ kind: "place", id: place });
    expect(pointed("self / role")).toBeNull();
    expect(pointed("applicant (place)")).toBeNull();
    expect(pointed("approver (operator)")).toBeNull();
    expect(pointed("operators / takedown_claim_received")).toBeNull();
  });

  it("lists every reference once, in field order, without the invitation id", () => {
    const ids = notificationIds();
    const a = ids.account();
    const o = {
      to: "placeStewards" as const,
      placeId: place,
      subject: {
        kind: "place" as const,
        matter: { kind: "steward_added" as const, appointee: a },
      },
    };
    expect(Occurrence.refsOf(o)).toEqual([
      { kind: "place", id: place },
      { kind: "account", id: a },
    ]);
    expect(Occurrence.refsOf(byName("invitee").occurrence)).toEqual([
      { kind: "place", id: place },
    ]);
    expect(
      Occurrence.refsOf(byName("contentManagers / listing").occurrence),
    ).toEqual([
      { kind: "listing", id: listing },
      { kind: "place", id: place },
    ]);
    expect(Occurrence.refsOf(byName("editors").occurrence)).toEqual([
      { kind: "article", id: article },
      { kind: "listing", id: listing },
    ]);
    const approver = byName("approver (steward, proxy)").occurrence;
    expect(Occurrence.refsOf(approver).map((ref) => ref.kind)).toEqual([
      "region",
      "application",
    ]);
    expect(Occurrence.refsOf(byName("self / role").occurrence)).toEqual([]);
  });

  it("tells steward audiences from direct ones", () => {
    const steward = samples.filter((sample) =>
      Occurrence.isStewardAudience(sample.delivered.occurrence),
    );
    expect(steward.map((sample) => sample.name)).not.toContain(
      "contentManagers / article",
    );
    expect(steward.map((sample) => sample.name)).toContain("applicant (place)");
    expect(
      Occurrence.isStewardAudience(byName("applicant (individual)").occurrence),
    ).toBe(false);
  });

  it("names the vacant target of a proxy delivery only", () => {
    expect(
      DeliveredOccurrence.vacantTarget(byName("approver (steward, proxy)")),
    ).toEqual({ kind: "region", id: region });
    expect(
      DeliveredOccurrence.vacantTarget(byName("contentManagers / listing")),
    ).toBeNull();
    const proxied = {
      ...byName("contentManagers / listing"),
      delivery: "proxy" as const,
    };
    expect(
      DeliveredOccurrence.vacantTarget(
        proxied as Parameters<typeof DeliveredOccurrence.vacantTarget>[0],
      ),
    ).toEqual({ kind: "place", id: place });
  });

  it("opens every sample somewhere but a revocation", () => {
    for (const { name, delivered } of samples) {
      const destination = NotificationDestination.of(delivered);
      if (delivered.occurrence.to === "self") expect(destination).toBeNull();
      else expect(destination, name).not.toBeNull();
    }
  });
});
