import type { Actor } from "@repo/core/domain/common/actor";
import {
  AccountId,
  type ApplicationId,
  PhotoId,
} from "@repo/core/domain/common/ids";
import { type ContentRef, PhotoOwnerRef } from "@repo/core/domain/common/refs";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { MediaErrorCode } from "./errorCode";
import type { PhotoConsent } from "./photoConsent";
import { PhotoDigest, type PhotoFile } from "./photoFile";

type PhotoAssetBase = Readonly<{
  id: PhotoId;
  /** The account that registered it — for a duplicate, the one that duplicated it. */
  registeredBy: AccountId;
  consentedAt: Date;
  /** The file's digest; a duplicate keeps its source's. */
  digest: PhotoDigest;
  registeredAt: Date;
  version: Version;
}>;

/** Consent and file checked; the content is not in `PhotoStorage` yet. */
export type AcceptedPhoto = PhotoAssetBase & Readonly<{ stage: "accepted" }>;

/** The content is in `PhotoStorage`: it can be shown and owned. */
export type StoredPhoto = PhotoAssetBase &
  Readonly<{ stage: "stored"; owner: PhotoOwnerRef | null }>;

/** Due for deletion of its content, then of its record. Never comes back. */
export type DiscardedPhoto = PhotoAssetBase & Readonly<{ stage: "discarded" }>;

/**
 * One registered photo (`spec/domains/media.md` 「PhotoAsset」). Only a
 * `stored` photo has an owner, so an owned photo without content and an
 * owned discarded photo cannot be expressed.
 */
export type PhotoAsset = AcceptedPhoto | StoredPhoto | DiscardedPhoto;

export type PhotoStage = PhotoAsset["stage"];

/** The owner a transfer moves photos away from. */
export type ApplicationOwnerRef = Readonly<{
  kind: "application";
  id: ApplicationId;
}>;

const fail = (code: MediaErrorCode, message: string): never => {
  throw new BusinessRuleError(code, message);
};

function register(
  params: Readonly<{
    id: PhotoId;
    registrant: Actor;
    consent: PhotoConsent;
    file: PhotoFile;
  }>,
  now: Date,
): AcceptedPhoto {
  return {
    id: params.id,
    registeredBy: params.registrant.accountId,
    consentedAt: new Date(params.consent.agreedAt.getTime()),
    digest: params.file.digest,
    registeredAt: new Date(now.getTime()),
    version: Version.initial(),
    stage: "accepted",
  };
}

/**
 * A new photo carrying `source`'s content and consent, registered by `by`.
 * `MEDIA_DUPLICATE_SOURCE_UNAVAILABLE` when `source` is `null` (no record)
 * or not `stored`. `source` itself does not change.
 */
function duplicate(
  source: PhotoAsset | null,
  params: Readonly<{ id: PhotoId; by: Actor }>,
  now: Date,
): AcceptedPhoto {
  if (source === null || source.stage !== "stored") {
    return fail(
      MediaErrorCode.DuplicateSourceUnavailable,
      "The photo to duplicate is not available",
    );
  }
  return {
    id: params.id,
    registeredBy: params.by.accountId,
    consentedAt: new Date(source.consentedAt.getTime()),
    digest: source.digest,
    registeredAt: new Date(now.getTime()),
    version: Version.initial(),
    stage: "accepted",
  };
}

/**
 * Whether a registration request for `photo`'s id resends the one that
 * created it: same registrant and same file digest.
 */
function isResendOf(
  photo: PhotoAsset,
  params: Readonly<{ registrant: Actor; file: PhotoFile }>,
): boolean {
  return (
    photo.registeredBy === params.registrant.accountId &&
    PhotoDigest.equals(photo.digest, params.file.digest)
  );
}

function markStored(photo: AcceptedPhoto): StoredPhoto {
  return {
    ...photo,
    stage: "stored",
    owner: null,
    version: Version.next(photo.version),
  };
}

/**
 * Sets the first owner. `MEDIA_PHOTO_NOT_AVAILABLE` unless `stored`,
 * `MEDIA_PHOTO_ALREADY_OWNED` when it has any owner (the same one
 * included), `MEDIA_PHOTO_NOT_REGISTRANT` unless `by` registered it.
 */
function claim(
  photo: PhotoAsset,
  owner: PhotoOwnerRef,
  by: Actor,
): StoredPhoto {
  if (photo.stage !== "stored") {
    return fail(
      MediaErrorCode.PhotoNotAvailable,
      `Photo ${photo.id} is not available`,
    );
  }
  if (photo.owner !== null) {
    return fail(
      MediaErrorCode.PhotoAlreadyOwned,
      `Photo ${photo.id} already has an owner`,
    );
  }
  if (photo.registeredBy !== by.accountId) {
    return fail(
      MediaErrorCode.PhotoNotRegistrant,
      `Photo ${photo.id} was registered by another account`,
    );
  }
  return { ...photo, owner, version: Version.next(photo.version) };
}

/**
 * Moves the owner from the approved application to the aggregate it was
 * applied to. `MEDIA_PHOTO_OWNER_MISMATCH` unless `stored` and owned by
 * `from`.
 */
function transfer(
  photo: PhotoAsset,
  from: ApplicationOwnerRef,
  to: ContentRef,
): StoredPhoto {
  if (
    photo.stage !== "stored" ||
    photo.owner === null ||
    !PhotoOwnerRef.equals(photo.owner, from)
  ) {
    return fail(
      MediaErrorCode.PhotoOwnerMismatch,
      `Photo ${photo.id} is not owned by application ${from.id}`,
    );
  }
  return { ...photo, owner: to, version: Version.next(photo.version) };
}

/** Marks the photo for deletion, owned or not. */
function discard(photo: AcceptedPhoto | StoredPhoto): DiscardedPhoto {
  return {
    id: photo.id,
    registeredBy: photo.registeredBy,
    consentedAt: photo.consentedAt,
    digest: photo.digest,
    registeredAt: photo.registeredAt,
    version: Version.next(photo.version),
    stage: "discarded",
  };
}

/**
 * `accepted`, or `stored` without an owner, registered before
 * `sweepBefore` (`PhotoPolicy.sweepBefore`).
 */
function isAbandoned(photo: PhotoAsset, sweepBefore: Date): boolean {
  const unowned =
    photo.stage === "accepted" ||
    (photo.stage === "stored" && photo.owner === null);
  return unowned && photo.registeredAt.getTime() < sweepBefore.getTime();
}

/** At-rest form of a photo, shared by the repository adapters. */
export type PhotoAssetSnapshot = Readonly<{
  id: string;
  registeredBy: string;
  consentedAt: Date;
  digest: string;
  registeredAt: Date;
  stage: string;
  /** Only a `stored` photo may have one. */
  owner: Readonly<{ kind: string; id: string }> | null;
  version: number;
}>;

const restoreDate = (value: Date, label: string): Date => {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`Stored ${label} is not a date`);
  }
  return new Date(value.getTime());
};

function reconstruct(input: PhotoAssetSnapshot): PhotoAsset {
  try {
    const base: PhotoAssetBase = {
      id: PhotoId.create(input.id),
      registeredBy: AccountId.create(input.registeredBy),
      consentedAt: restoreDate(input.consentedAt, "consentedAt"),
      digest: PhotoDigest.restore(input.digest),
      registeredAt: restoreDate(input.registeredAt, "registeredAt"),
      version: Version.create(input.version),
    };
    if (input.stage === "stored") {
      const owner = input.owner;
      if (owner === null) return { ...base, stage: "stored", owner: null };
      if (!PhotoOwnerRef.isKind(owner.kind)) {
        throw new Error(`Unknown photo owner kind: ${owner.kind}`);
      }
      return {
        ...base,
        stage: "stored",
        owner: PhotoOwnerRef.create(owner.kind, owner.id),
      };
    }
    if (input.owner !== null) {
      throw new Error(`A ${input.stage} photo cannot have an owner`);
    }
    switch (input.stage) {
      case "accepted":
        return { ...base, stage: "accepted" };
      case "discarded":
        return { ...base, stage: "discarded" };
      default:
        throw new Error(`Unknown photo stage: ${input.stage}`);
    }
  } catch (error) {
    throw new RehydrationError("Stored photo violates invariants", error);
  }
}

function snapshot(photo: PhotoAsset): PhotoAssetSnapshot {
  return {
    id: photo.id,
    registeredBy: photo.registeredBy,
    consentedAt: photo.consentedAt,
    digest: photo.digest,
    registeredAt: photo.registeredAt,
    stage: photo.stage,
    owner:
      photo.stage === "stored" && photo.owner !== null
        ? { kind: photo.owner.kind, id: photo.owner.id }
        : null,
    version: photo.version,
  };
}

export const PhotoAsset = {
  register,
  duplicate,
  isResendOf,
  markStored,
  claim,
  transfer,
  discard,
  isAbandoned,
  reconstruct,
  snapshot,
};
