import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { WithEventDrafts } from "@repo/core/domain/common/event";
import { PhotoId, TakedownClaimId } from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { ModerationErrorCode } from "./errorCode";
import {
  ModerationEvents,
  type TakedownClaimResolvedEvent,
  type TakedownClaimSubmittedEvent,
} from "./events";
import { TakedownOutcome } from "./takedownOutcome";
import { TakedownGround, TakedownReason } from "./values";

type TakedownClaimBase = Readonly<{
  id: TakedownClaimId;
  ground: TakedownGround;
  reason: TakedownReason;
  /** Where the outcome mail goes; the claimant has no account. */
  email: EmailAddress;
  /** When it was received — when it started awaiting the operators. */
  receivedAt: Date;
  version: Version;
}>;

export type OpenTakedownClaim = TakedownClaimBase &
  Readonly<{ status: "open" }>;

export type ResolvedTakedownClaim = TakedownClaimBase &
  Readonly<{ status: "resolved"; outcome: TakedownOutcome }>;

/**
 * 取り下げの申立て (`spec/domains/moderation.md` 「TakedownClaim」): what a
 * proprietor or a photo rights holder asked, without logging in, until
 * the operators close it with an outcome. The submission never changes
 * and the claim is never deleted.
 */
export type TakedownClaim = OpenTakedownClaim | ResolvedTakedownClaim;

export type TakedownClaimStatus = TakedownClaim["status"];

/** What the transport hands `submit`; the value objects check it. */
export type TakedownClaimInput = Readonly<{
  id: TakedownClaimId;
  standing: string;
  target: ContentRef;
  photoIds: readonly PhotoId[];
  reason: string;
  email: string;
}>;

/**
 * What the usecase read about the target: whether viewers can see it
 * (`ReferenceQueries.isViewable`) and, when they can, its current photos
 * (`ContentDirectory.describe`).
 */
export type TakedownTargetFacts =
  | Readonly<{ viewable: false }>
  | Readonly<{ viewable: true; photoIds: readonly PhotoId[] }>;

/**
 * `MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET`, naming the claimed
 * photos the target no longer has. Serialized with them as `missing`.
 */
export class TakedownPhotosNotInTargetError extends BusinessRuleError<
  typeof ModerationErrorCode.TakedownClaimPhotoNotInTarget
> {
  constructor(public readonly photoIds: readonly [PhotoId, ...PhotoId[]]) {
    super(
      ModerationErrorCode.TakedownClaimPhotoNotInTarget,
      "The claimed photos are not the target's current photos",
    );
  }

  override toSerialized() {
    return { ...super.toSerialized(), missing: this.photoIds };
  }
}

const alreadyResolved = () =>
  new BusinessRuleError(
    ModerationErrorCode.TakedownClaimAlreadyResolved,
    "The takedown claim is already resolved",
  );

/** The submission's value objects, in the order `submit` checks them. */
function submission(input: TakedownClaimInput) {
  return {
    ground: TakedownGround.create(input.standing, input.target, input.photoIds),
    reason: TakedownReason.create(input.reason),
    email: EmailAddress.create(input.email),
  };
}

/**
 * Receives a claim as open. Checks, first failure wins: the value objects
 * (ground, reason, email), then the target is viewable
 * (`MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE`), then every photo a
 * rights holder names is among the target's current photos
 * (`TakedownPhotosNotInTargetError`).
 */
function submit(
  input: TakedownClaimInput,
  facts: TakedownTargetFacts,
  now: Date,
): WithEventDrafts<OpenTakedownClaim, TakedownClaimSubmittedEvent> {
  const { ground, reason, email } = submission(input);
  if (!facts.viewable) {
    throw new BusinessRuleError(
      ModerationErrorCode.TakedownClaimTargetUnavailable,
      "The takedown claim's target is not viewable",
    );
  }
  const current = new Set(facts.photoIds);
  const [missing, ...more] = TakedownGround.photoIdsOf(ground).filter(
    (id) => !current.has(id),
  );
  if (missing !== undefined) {
    throw new TakedownPhotosNotInTargetError([missing, ...more]);
  }
  return {
    entity: {
      id: input.id,
      ground,
      reason,
      email,
      receivedAt: now,
      version: Version.initial(),
      status: "open",
    },
    eventDrafts: [ModerationEvents.takedownClaimSubmitted(input.id, now)],
  };
}

/**
 * Closes the claim with `outcome`, whatever action was or was not taken.
 * `MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED` first, then
 * `MODERATION_INVALID_TAKEDOWN_OUTCOME`.
 */
function resolve(
  claim: TakedownClaim,
  outcome: string,
  now: Date,
): WithEventDrafts<ResolvedTakedownClaim, TakedownClaimResolvedEvent> {
  if (claim.status === "resolved") throw alreadyResolved();
  return {
    entity: {
      ...claim,
      status: "resolved",
      outcome: TakedownOutcome.create(outcome),
      version: Version.next(claim.version),
    },
    eventDrafts: [ModerationEvents.takedownClaimResolved(claim.id, now)],
  };
}

/**
 * Whether the claim allows removing photos from `owner` — the only rule
 * relating a claim to the photos removed on it. Holds while the claim is
 * open and `owner` is its target (kind and id); `photoIds` need not be the
 * ones the claimant named (the target's aggregate checks they are its
 * photos). `MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED` first, then
 * `MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH`.
 */
function authorizePhotoRemoval(
  claim: TakedownClaim,
  owner: ContentRef,
  _photoIds: readonly [PhotoId, ...PhotoId[]],
): void {
  if (claim.status === "resolved") throw alreadyResolved();
  if (!ContentRef.equals(claim.ground.target, owner)) {
    throw new BusinessRuleError(
      ModerationErrorCode.TakedownClaimTargetMismatch,
      "The photos are not on the claim's target",
    );
  }
}

/**
 * Whether `input` resends this claim: same standing, target, photos (as a
 * set), reason and email address. Input that fails a value object is never
 * the same submission.
 */
function sameSubmission(
  claim: TakedownClaim,
  input: TakedownClaimInput,
): boolean {
  let resent: ReturnType<typeof submission>;
  try {
    resent = submission(input);
  } catch (error) {
    if (error instanceof BusinessRuleError) return false;
    throw error;
  }
  return (
    TakedownGround.equals(claim.ground, resent.ground) &&
    claim.reason === resent.reason &&
    EmailAddress.equals(claim.email, resent.email)
  );
}

/** A claim at rest: primitives only, the inverse of `reconstruct`. */
export type TakedownClaimSnapshot = Readonly<{
  id: string;
  standing: string;
  target: Readonly<{ kind: string; id: string }>;
  /** The claimant's photos in the order named; empty for a proprietor. */
  photoIds: readonly string[];
  reason: string;
  email: string;
  receivedAt: Date;
  status: string;
  /** `null` while open. */
  outcome: string | null;
  version: number;
}>;

function snapshot(claim: TakedownClaim): TakedownClaimSnapshot {
  return {
    id: claim.id,
    standing: claim.ground.standing,
    target: { kind: claim.ground.target.kind, id: claim.ground.target.id },
    photoIds: TakedownGround.photoIdsOf(claim.ground),
    reason: claim.reason,
    email: claim.email,
    receivedAt: claim.receivedAt,
    status: claim.status,
    outcome: claim.status === "resolved" ? claim.outcome : null,
    version: claim.version,
  };
}

function reconstruct(stored: TakedownClaimSnapshot): TakedownClaim {
  try {
    if (!ContentRef.isKind(stored.target.kind)) {
      throw new Error(`Unknown content kind: ${stored.target.kind}`);
    }
    const base = {
      id: TakedownClaimId.create(stored.id),
      ground: TakedownGround.create(
        stored.standing,
        ContentRef.create(stored.target.kind, stored.target.id),
        stored.photoIds.map((id) => PhotoId.create(id)),
      ),
      reason: TakedownReason.create(stored.reason),
      email: EmailAddress.create(stored.email),
      receivedAt: stored.receivedAt,
      version: Version.create(stored.version),
    };
    if (base.reason !== stored.reason || base.email !== stored.email) {
      throw new Error("Stored reason or email is not in its normalized form");
    }
    if (Number.isNaN(stored.receivedAt.getTime())) {
      throw new Error("Invalid receivedAt");
    }
    if (stored.status === "open" && stored.outcome === null) {
      return { ...base, status: "open" };
    }
    if (stored.status === "resolved" && stored.outcome !== null) {
      const outcome = TakedownOutcome.create(stored.outcome);
      if (outcome !== stored.outcome) {
        throw new Error("Stored outcome is not in its normalized form");
      }
      return { ...base, status: "resolved", outcome };
    }
    throw new Error(
      `Status ${stored.status} does not match outcome ${String(stored.outcome)}`,
    );
  } catch (error) {
    throw new RehydrationError(
      "Stored takedown claim violates invariants",
      error,
    );
  }
}

export const TakedownClaim = {
  submit,
  resolve,
  authorizePhotoRemoval,
  sameSubmission,
  snapshot,
  reconstruct,
};
