import { PlaceId } from "@repo/core/domain/common/ids";
import { RehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import {
  catchError,
  expectBusinessError,
} from "../../common/__tests__/expectBusinessError";
import {
  TakedownClaim,
  type TakedownClaimInput,
  TakedownPhotosNotInTargetError,
} from "../takedownClaim";
import { moderationSamples } from "../testing/samples";

const NOW = new Date("2026-09-10T00:00:00.000Z");

function setup() {
  const s = moderationSamples();
  const [a, b] = [s.ids.photo(), s.ids.photo()];
  const listing = { kind: "listing", id: s.ids.listing() } as const;
  const input = (
    over: Partial<TakedownClaimInput> = {},
  ): TakedownClaimInput => ({
    id: s.ids.claim(),
    standing: "photoRightsHolder",
    target: listing,
    photoIds: [a],
    reason: " 私が撮った写真です ",
    email: " Owner@Example.com ",
    ...over,
  });
  return { s, a, b, listing, input };
}

describe("TakedownClaim.submit", () => {
  it("receives an open claim at `now` with normalized values and one event", () => {
    const { a, b, listing, input } = setup();
    const given = input();
    const { entity, eventDrafts } = TakedownClaim.submit(
      given,
      { viewable: true, photoIds: [a, b] },
      NOW,
    );
    expect(entity).toEqual({
      id: given.id,
      ground: { standing: "photoRightsHolder", target: listing, photoIds: [a] },
      reason: "私が撮った写真です",
      email: "owner@example.com",
      receivedAt: NOW,
      version: 0,
      status: "open",
    });
    expect(eventDrafts).toEqual([
      {
        type: "takedown_claim.submitted",
        payload: { claimId: given.id },
        occurredAt: NOW,
        aggregateId: given.id,
      },
    ]);
  });

  it("checks ground, reason, email, viewability, then photos", () => {
    const { a, input } = setup();
    const unviewable = { viewable: false } as const;
    expectBusinessError(
      () =>
        TakedownClaim.submit(
          input({ photoIds: [], reason: "", email: "x" }),
          unviewable,
          NOW,
        ),
      "MODERATION_INVALID_TAKEDOWN_GROUND",
    );
    expectBusinessError(
      () =>
        TakedownClaim.submit(
          input({ reason: "", email: "x" }),
          unviewable,
          NOW,
        ),
      "MODERATION_INVALID_TAKEDOWN_REASON",
    );
    expectBusinessError(
      () => TakedownClaim.submit(input({ email: "x" }), unviewable, NOW),
      "COMMON_INVALID_EMAIL_ADDRESS",
    );
    expectBusinessError(
      () => TakedownClaim.submit(input(), unviewable, NOW),
      "MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE",
    );
    const error = catchError(() =>
      TakedownClaim.submit(input(), { viewable: true, photoIds: [] }, NOW),
    );
    expect(error).toBeInstanceOf(TakedownPhotosNotInTargetError);
    expect((error as TakedownPhotosNotInTargetError).photoIds).toEqual([a]);
    expect((error as TakedownPhotosNotInTargetError).toSerialized()).toEqual({
      kind: "business",
      code: "MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET",
      message: expect.any(String),
      retryable: false,
      missing: [a],
    });
  });

  it("does not check a proprietor's photos against the target", () => {
    const { input } = setup();
    const { entity } = TakedownClaim.submit(
      input({ standing: "proprietor", photoIds: [] }),
      { viewable: true, photoIds: [] },
      NOW,
    );
    expect(entity.ground.standing).toBe("proprietor");
  });
});

describe("TakedownClaim.resolve", () => {
  it("resolves an open claim with its outcome, bumping the version", () => {
    const { s } = setup();
    const claim = s.openClaim();
    const { entity, eventDrafts } = TakedownClaim.resolve(
      claim,
      " 削除しました ",
      NOW,
    );
    expect(entity).toEqual({
      ...claim,
      status: "resolved",
      outcome: "削除しました",
      version: 1,
    });
    expect(eventDrafts).toEqual([
      {
        type: "takedown_claim.resolved",
        payload: { claimId: claim.id },
        occurredAt: NOW,
        aggregateId: claim.id,
      },
    ]);
  });

  it("refuses a resolved claim before checking the outcome", () => {
    const { s } = setup();
    const resolved = s.resolvedClaim(s.openClaim());
    expectBusinessError(
      () => TakedownClaim.resolve(resolved, "", NOW),
      "MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED",
    );
    expectBusinessError(
      () => TakedownClaim.resolve(s.openClaim(), " ", NOW),
      "MODERATION_INVALID_TAKEDOWN_OUTCOME",
    );
  });
});

describe("TakedownClaim.authorizePhotoRemoval", () => {
  it("holds for the open claim's target, whatever photos", () => {
    const { s, a, b, listing } = setup();
    const claim = s.openClaim({ target: listing, photoIds: [a] });
    expect(() =>
      TakedownClaim.authorizePhotoRemoval(claim, listing, [b]),
    ).not.toThrow();
  });

  it("refuses a resolved claim first, then another target (kind and id)", () => {
    const { s, a, listing } = setup();
    const claim = s.openClaim({ target: listing, photoIds: [a] });
    const samePlaceId = {
      kind: "place",
      id: PlaceId.create(listing.id),
    } as const;
    expectBusinessError(
      () => TakedownClaim.authorizePhotoRemoval(claim, samePlaceId, [a]),
      "MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH",
    );
    expectBusinessError(
      () =>
        TakedownClaim.authorizePhotoRemoval(
          s.resolvedClaim(claim),
          { kind: "region", id: s.ids.region() },
          [a],
        ),
      "MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED",
    );
  });
});

describe("TakedownClaim.sameSubmission", () => {
  it("matches the same content, photos in any order and normalized text", () => {
    const { a, b, input } = setup();
    const given = input({ photoIds: [a, b] });
    const { entity } = TakedownClaim.submit(
      given,
      { viewable: true, photoIds: [a, b] },
      NOW,
    );
    expect(
      TakedownClaim.sameSubmission(entity, {
        ...given,
        photoIds: [b, a],
        reason: "私が撮った写真です",
        email: "owner@example.com",
      }),
    ).toBe(true);
    expect(
      TakedownClaim.sameSubmission(entity, { ...given, reason: "別の理由" }),
    ).toBe(false);
    expect(
      TakedownClaim.sameSubmission(entity, { ...given, photoIds: [a] }),
    ).toBe(false);
    expect(
      TakedownClaim.sameSubmission(entity, { ...given, email: "bad" }),
    ).toBe(false);
  });
});

describe("TakedownClaim.reconstruct", () => {
  it("round-trips open and resolved claims", () => {
    const { s, a, listing } = setup();
    const open = s.openClaim({ target: listing, photoIds: [a] });
    const resolved = s.resolvedClaim(s.openClaim());
    expect(TakedownClaim.reconstruct(TakedownClaim.snapshot(open))).toEqual(
      open,
    );
    expect(TakedownClaim.reconstruct(TakedownClaim.snapshot(resolved))).toEqual(
      resolved,
    );
  });

  it("rejects a status that does not match the outcome, or an unknown kind", () => {
    const { s } = setup();
    const open = TakedownClaim.snapshot(s.openClaim());
    expect(() =>
      TakedownClaim.reconstruct({ ...open, status: "resolved" }),
    ).toThrow(RehydrationError);
    expect(() =>
      TakedownClaim.reconstruct({ ...open, outcome: "結果" }),
    ).toThrow(RehydrationError);
    expect(() =>
      TakedownClaim.reconstruct({
        ...open,
        target: { kind: "shop", id: open.target.id },
      }),
    ).toThrow(RehydrationError);
  });
});
