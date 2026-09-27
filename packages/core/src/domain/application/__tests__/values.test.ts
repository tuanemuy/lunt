import { expectBusinessError } from "@repo/core/domain/common/__tests__/expectBusinessError";
import { AccountId, PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { Applicant } from "../applicant";
import { ApproverSeat } from "../approverSeat";
import { canonicalKey, sameData } from "../canonical";
import { StewardshipClaim } from "../stewardshipClaim";
import { RejectionReason, ReturnReply, ReturnRequest } from "../texts";

describe("free-text values", () => {
  it.each([
    [ReturnReply, "APPLICATION_INVALID_RETURN_REPLY"],
    [ReturnRequest, "APPLICATION_INVALID_RETURN_REQUEST"],
    [RejectionReason, "APPLICATION_INVALID_REJECTION_REASON"],
  ] as const)("trims and refuses empty text (%#)", (factory, code) => {
    expect(factory.create("  写真を添えました \n")).toBe("写真を添えました");
    expectBusinessError(() => factory.create(" \t\n"), code);
  });
});

describe("StewardshipClaim", () => {
  it("trims both texts and compares them", () => {
    const claim = StewardshipClaim.create({
      relationship: " 店主です ",
      evidence: " 03-0000-0000",
    });
    expect(claim).toEqual({
      relationship: "店主です",
      evidence: "03-0000-0000",
    });
    expect(
      StewardshipClaim.equals(
        claim,
        StewardshipClaim.create({
          relationship: "店主です",
          evidence: "03-0000-0000",
        }),
      ),
    ).toBe(true);
  });

  it.each([
    { relationship: "", evidence: "資料" },
    { relationship: "店主", evidence: "  " },
  ])("refuses %j", (input) => {
    expectBusinessError(
      () => StewardshipClaim.create(input),
      "APPLICATION_INVALID_STEWARDSHIP_CLAIM",
    );
  });
});

describe("Applicant / ApproverSeat", () => {
  const a = AccountId.create("ffffffff-ffff-7fff-8fff-000000000001");
  const p = PlaceId.create("ffffffff-ffff-7fff-8fff-000000000002");

  it("compares by every field", () => {
    expect(
      Applicant.equals(Applicant.individual(a), Applicant.individual(a)),
    ).toBe(true);
    expect(Applicant.equals(Applicant.individual(a), Applicant.place(p))).toBe(
      false,
    );
    expect(
      ApproverSeat.equals(ApproverSeat.operator(), { kind: "operator" }),
    ).toBe(true);
  });
});

describe("canonicalKey", () => {
  it("ignores key order and undefined members, and tells values apart", () => {
    expect(canonicalKey({ b: 1, a: [1, "x"], c: undefined })).toBe(
      canonicalKey({ a: [1, "x"], b: 1 }),
    );
    expect(sameData({ a: null }, { a: "null" })).toBe(false);
    expect(sameData([1, 2], [2, 1])).toBe(false);
  });
});
