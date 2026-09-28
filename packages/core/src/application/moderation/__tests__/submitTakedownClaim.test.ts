import {
  PhotoId,
  RegionId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import { BusinessRuleError } from "@repo/core/domain/error";
import { TakedownPhotosNotInTargetError } from "@repo/core/domain/moderation/takedownClaim";
import { describe, expect, it } from "vitest";
import { expectCode, rejection } from "../../authority/__tests__/kit";
import { ConflictError } from "../../errors";
import { updateListing } from "../../listing/updateListing";
import { type ClaimSpec, type ModerationKit, moderationKit } from "./kit";

/** Submits `spec` and asserts it fails with `code`, leaving no claim and no event. */
async function expectRejected(
  k: ModerationKit,
  spec: ClaimSpec & Readonly<{ claimId: ReturnType<ModerationKit["newId"]> }>,
  errorClass: abstract new (...args: never[]) => Error,
  code?: string,
): Promise<void> {
  const mark = await k.mark();
  await expectCode(k.submitClaim(spec), errorClass, code);
  expect(await k.findClaim(TakedownClaimId.create(spec.claimId))).toBeNull();
  expect(await k.since(mark)).toEqual([]);
}

async function viewableListing(k: ModerationKit, photos = 1) {
  const placeId = await k.place();
  const m = await k.manager(placeId);
  const listing = await k.listingWithPhotos(m, placeId, photos);
  const target: ContentRef = { kind: "listing", id: listing.id };
  return { placeId, m, listing, target };
}

describe("submitTakedownClaim", () => {
  it("submitTakedownClaim#1 閲覧できる掲載がある。操作する人はログインしていない / 立場を店舗本人、対象をその掲載にし、写真を示さず、理由とメールアドレスを添えて提出する", async () => {
    const k = await moderationKit();
    const { target } = await viewableListing(k);
    const mark = await k.mark();
    const now = k.clock.now();
    const id = await k.claim({
      target,
      standing: "proprietor",
      reason: "私の店の掲載です",
      email: "owner@example.com",
    });
    expect((await k.storedClaim(id)).entity).toEqual({
      id,
      ground: { standing: "proprietor", target },
      reason: "私の店の掲載です",
      email: "owner@example.com",
      receivedAt: now,
      version: 0,
      status: "open",
    });
    expect(
      (await k.since(mark)).map((e) => ({ type: e.type, payload: e.payload })),
    ).toEqual([{ type: "takedown_claim.submitted", payload: { claimId: id } }]);
  });

  it("submitTakedownClaim#2 閲覧できる店舗があり、その店舗に店舗管理者がいる / 立場を店舗本人、対象をその店舗にして提出する", async () => {
    const k = await moderationKit();
    const placeId = await k.place();
    await k.manager(placeId);
    const id = await k.claim({ target: { kind: "place", id: placeId } });
    expect((await k.storedClaim(id)).entity.status).toBe("open");
    expect(await k.events("takedown_claim.submitted")).toHaveLength(1);
  });

  it("submitTakedownClaim#3 閲覧できる掲載があり、写真を2枚持つ / 立場を写真の権利者、対象をその掲載にし、そのうち1枚の PhotoId を示して提出する", async () => {
    const k = await moderationKit();
    const { listing, target } = await viewableListing(k, 2);
    const [, second] = listing.photos;
    if (second === undefined) throw new Error("two photos");
    const id = await k.claim({
      target,
      standing: "photoRightsHolder",
      photoIds: [second],
    });
    expect((await k.storedClaim(id)).entity.ground).toEqual({
      standing: "photoRightsHolder",
      target,
      photoIds: [second],
    });
    expect(await k.events("takedown_claim.submitted")).toHaveLength(1);
  });

  it.todo(
    "submitTakedownClaim#4 閲覧できる地域・イベント・読みものが、それぞれ写真を持つ / 立場を写真の権利者にし、それぞれの対象について、対象の写真を示して提出する",
  );

  it("accepts a photo rights holder's claim on a place's photo (#4 on a stage-2 kind)", async () => {
    const k = await moderationKit();
    const place = await k.placeWithPhotos(2);
    const photo = place.photos[0];
    if (photo === undefined) throw new Error("photos");
    const id = await k.claim({
      target: { kind: "place", id: place.id },
      photoIds: [photo],
    });
    expect((await k.storedClaim(id)).entity.status).toBe("open");
  });

  it.todo(
    "submitTakedownClaim#5 閲覧できる地域がある / 立場を店舗本人、対象をその地域にして提出する",
  );

  it("refuses a proprietor's claim on a region by the ground before viewability (#5 without a stored region)", async () => {
    const k = await moderationKit();
    await expectRejected(
      k,
      {
        claimId: k.newId(),
        standing: "proprietor",
        target: { kind: "region", id: RegionId.create(k.newId()) },
      },
      BusinessRuleError,
      "MODERATION_INVALID_TAKEDOWN_GROUND",
    );
  });

  it("submitTakedownClaim#6 閲覧できる掲載が写真を持つ / 立場を写真の権利者にし、写真を1枚も示さずに提出する", async () => {
    const k = await moderationKit();
    const { target } = await viewableListing(k);
    await expectRejected(
      k,
      {
        claimId: k.newId(),
        target,
        standing: "photoRightsHolder",
        photoIds: [],
      },
      BusinessRuleError,
      "MODERATION_INVALID_TAKEDOWN_GROUND",
    );
  });

  it("submitTakedownClaim#7 閲覧できる掲載が写真を持つ / 立場を店舗本人にし、その掲載の写真を1枚示して提出する", async () => {
    const k = await moderationKit();
    const { listing, target } = await viewableListing(k);
    await expectRejected(
      k,
      {
        claimId: k.newId(),
        target,
        standing: "proprietor",
        photoIds: listing.photos,
      },
      BusinessRuleError,
      "MODERATION_INVALID_TAKEDOWN_GROUND",
    );
  });

  it("submitTakedownClaim#8 閲覧できる掲載がある / 立場を写真の権利者にし、その掲載の現在の写真にない PhotoId を示して提出する", async () => {
    const k = await moderationKit();
    const { target } = await viewableListing(k);
    await expectRejected(
      k,
      {
        claimId: k.newId(),
        target,
        photoIds: [PhotoId.create(k.newId())],
      },
      BusinessRuleError,
      "MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET",
    );
  });

  it("submitTakedownClaim#9 閲覧できる掲載が写真 A・B を持つ。写真の権利者が A を示して入力している間に、店舗管理者が A を外して保存した（掲載は閲覧できるまま） / 写真の権利者として、A を示して提出する", async () => {
    const k = await moderationKit();
    const { m, listing, target } = await viewableListing(k, 2);
    const [A, B] = listing.photos;
    if (A === undefined || B === undefined) throw new Error("two photos");
    const stored = (await k.stored(listing.id)).entity;
    await updateListing({
      container: k.container,
      actor: m.actor,
      input: {
        listingId: listing.id,
        version: stored.version,
        content: k.content({ name: "掲載", photos: [B] }),
      },
    });
    const claimId = k.newId();
    const error = await rejection(
      k.submitClaim({ claimId, target, photoIds: [A] }),
    );
    expect(error).toBeInstanceOf(TakedownPhotosNotInTargetError);
    expect((error as TakedownPhotosNotInTargetError).photoIds).toEqual([A]);
    expect(await k.findClaim(TakedownClaimId.create(claimId))).toBeNull();
    expect(await k.events("takedown_claim.submitted")).toEqual([]);
  });

  it("submitTakedownClaim#10 閲覧できる掲載がある / 理由を空にして提出する", async () => {
    const k = await moderationKit();
    const { target } = await viewableListing(k);
    await expectRejected(
      k,
      { claimId: k.newId(), target, reason: "  " },
      BusinessRuleError,
      "MODERATION_INVALID_TAKEDOWN_REASON",
    );
  });

  it("submitTakedownClaim#11 閲覧できる掲載がある / 形式の正しくないメールアドレスで提出する", async () => {
    const k = await moderationKit();
    const { target } = await viewableListing(k);
    await expectRejected(
      k,
      { claimId: k.newId(), target, email: "owner@example" },
      BusinessRuleError,
      "COMMON_INVALID_EMAIL_ADDRESS",
    );
  });

  it("submitTakedownClaim#12 対象の掲載が、入力している間に運営による非公開になった / 店舗本人として提出する", async () => {
    const k = await moderationKit();
    const { listing, target } = await viewableListing(k);
    await k.suspend(await k.operator(), listing.id);
    await expectRejected(
      k,
      { claimId: k.newId(), target, standing: "proprietor" },
      BusinessRuleError,
      "MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE",
    );
  });

  it("submitTakedownClaim#13 対象の掲載の店舗が、入力している間に非公開になった / 店舗本人として、その掲載を対象に提出する", async () => {
    const k = await moderationKit();
    const { placeId, target } = await viewableListing(k);
    await k.suspendPlace(placeId);
    await expectRejected(
      k,
      { claimId: k.newId(), target, standing: "proprietor" },
      BusinessRuleError,
      "MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE",
    );
  });

  it.todo(
    "submitTakedownClaim#14 対象の読みものが、入力している間に公開の取り下げになった / 写真の権利者として提出する",
  );

  it("refuses a listing its manager unpublished while the claim was entered (#14 on a stage-2 kind)", async () => {
    const k = await moderationKit();
    const { m, listing, target } = await viewableListing(k);
    await k.unpublish(m, listing.id);
    await expectRejected(
      k,
      { claimId: k.newId(), target, photoIds: listing.photos },
      BusinessRuleError,
      "MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE",
    );
  });

  it("submitTakedownClaim#15 対象の掲載が、入力している間に削除された / 店舗本人として提出する", async () => {
    const k = await moderationKit();
    const { m, listing, target } = await viewableListing(k);
    await k.remove(m, listing.id);
    await expectRejected(
      k,
      { claimId: k.newId(), target, standing: "proprietor" },
      BusinessRuleError,
      "MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE",
    );
  });

  it("submitTakedownClaim#16 写真を持つ掲載が、入力している間に削除された / 写真の権利者として、その掲載の写真を示して提出する", async () => {
    const k = await moderationKit();
    const { m, listing, target } = await viewableListing(k);
    await k.remove(m, listing.id);
    await expectRejected(
      k,
      { claimId: k.newId(), target, photoIds: listing.photos },
      BusinessRuleError,
      "MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE",
    );
  });

  it("submitTakedownClaim#17 対象の掲載が、入力している間に運営による非公開になった / 店舗本人として、理由を空にして提出する", async () => {
    const k = await moderationKit();
    const { listing, target } = await viewableListing(k);
    await k.suspend(await k.operator(), listing.id);
    await expectRejected(
      k,
      { claimId: k.newId(), target, standing: "proprietor", reason: "" },
      BusinessRuleError,
      "MODERATION_INVALID_TAKEDOWN_REASON",
    );
  });

  it("submitTakedownClaim#18 申立てを提出して、未対応の申立てが保存されている / 同じ ID・同じ立場・対象・写真・理由・メールアドレスで、もう一度提出する", async () => {
    const k = await moderationKit();
    const { listing, target } = await viewableListing(k);
    const spec = { claimId: k.newId(), target, photoIds: listing.photos };
    await k.submitClaim(spec);
    const id = TakedownClaimId.create(spec.claimId);
    const before = await k.storedClaim(id);
    const mark = await k.mark();
    k.tick();
    await k.submitClaim(spec);
    expect(await k.storedClaim(id)).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
    expect(
      (await k.openClaims(await k.operator())).items.map((c) => c.claimId),
    ).toEqual([id]);
  });

  it("submitTakedownClaim#19 申立てを提出して、未対応の申立てが保存されている / 同じ ID で、理由だけを変えて提出する", async () => {
    const k = await moderationKit();
    const { target } = await viewableListing(k);
    const spec = { claimId: k.newId(), target };
    await k.submitClaim(spec);
    const id = TakedownClaimId.create(spec.claimId);
    const before = await k.storedClaim(id);
    const mark = await k.mark();
    await expectCode(
      k.submitClaim({ ...spec, reason: "別の理由" }),
      ConflictError,
    );
    expect(await k.storedClaim(id)).toEqual(before);
    expect(await k.since(mark)).toEqual([]);
  });

  it("submitTakedownClaim#20 閲覧できる店舗に、未対応の申立てが1件ある / 同じ店舗を対象に、別の ID で申立てを提出する", async () => {
    const k = await moderationKit();
    const target = { kind: "place", id: await k.place() } as const;
    const first = await k.claim({ target });
    const second = await k.claim({ target });
    expect(first).not.toBe(second);
    for (const id of [first, second]) {
      expect((await k.storedClaim(id)).entity.status).toBe("open");
    }
    expect(await k.events("takedown_claim.submitted")).toHaveLength(2);
  });
});
