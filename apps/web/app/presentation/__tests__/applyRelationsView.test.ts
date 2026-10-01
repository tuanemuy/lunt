import { describe, expect, it } from "vitest";
import {
  membershipApplyHref,
  membershipHeading,
  participationApplyHref,
  participationHeading,
  refusalLinkOf,
  submittedApprover,
} from "../applyRelationsView";

describe("RQ-05 / RQ-06 entries", () => {
  it("builds /apply/affiliation with only the parameters the entry gives", () => {
    expect(membershipApplyHref({ placeId: "p1", mode: "join" })).toBe(
      "/apply/affiliation?placeId=p1&mode=join",
    );
    expect(
      membershipApplyHref({ placeId: "p1", regionId: "r1", mode: "leave" }),
    ).toBe("/apply/affiliation?placeId=p1&regionId=r1&mode=leave");
    expect(membershipApplyHref({ regionId: "r1", mode: "join" })).toBe(
      "/apply/affiliation?regionId=r1&mode=join",
    );
  });

  it("builds /apply/participation from SM-06 and DT-04", () => {
    expect(participationApplyHref({ placeId: "p1" })).toBe(
      "/apply/participation?placeId=p1",
    );
    expect(participationApplyHref({ occasionId: "o1" })).toBe(
      "/apply/participation?occasionId=o1",
    );
  });

  it("leads a refused candidate to MY-05, SM-05 or CM-04", () => {
    expect(
      refusalLinkOf({ kind: "application", applicationId: "a1" }).href,
    ).toBe("/me/applications/a1");
    expect(
      refusalLinkOf({ kind: "affiliationStatus", placeId: "p1" }).href,
    ).toBe("/manage/places/p1/regions");
    expect(
      refusalLinkOf({ kind: "participation", placeId: "p1", occasionId: "o1" })
        .href,
    ).toBe("/manage/places/p1/events/o1");
  });

  it("names the screen by how it was opened", () => {
    const none = { placeId: null, regionId: null, mode: null, reapply: null };
    expect(membershipHeading({ ...none, resubmit: "a1" })).toBe(
      "所属・離脱の申請を再提出",
    );
    expect(membershipHeading({ ...none, regionId: "r1", resubmit: null })).toBe(
      "所属を申請",
    );
    expect(membershipHeading({ ...none, placeId: "p1", resubmit: null })).toBe(
      "所属・離脱を申請",
    );
    expect(
      participationHeading({
        placeId: "p1",
        occasionId: null,
        resubmit: null,
        reapply: null,
      }),
    ).toBe("イベントに参加");
  });
});

describe("RQ-05 / RQ-06 completion", () => {
  it("names the region's or event's stewards while it has them", () => {
    expect(submittedApprover("steward", "こもれび商店街の地域運営者")).toBe(
      "こもれび商店街の地域運営者",
    );
  });

  it("names the service operators for a region or event without a steward, as MY-05 does", () => {
    expect(submittedApprover("operator", "白波横丁の地域運営者")).toBe(
      "サービス運営者",
    );
  });
});
