import type { ListingId, PhotoId, PlaceId } from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import { TextNormalization } from "@repo/core/domain/common/textNormalization";
import { BusinessRuleError } from "@repo/core/domain/error";
import { ModerationErrorCode } from "./errorCode";

const MAX_TEXT_LENGTH = 2000;

/** Trimmed, 1–2,000 characters; `code` otherwise. */
const boundedText = <T extends string>(
  code: ModerationErrorCode,
  label: string,
) => ({
  maxLength: MAX_TEXT_LENGTH,
  create: (raw: string): T => {
    const value = raw.trim();
    const length = TextNormalization.characterCount(value);
    if (length < 1 || length > MAX_TEXT_LENGTH) {
      throw new BusinessRuleError(
        code,
        `${label} must be 1-${MAX_TEXT_LENGTH} characters`,
      );
    }
    return value as T;
  },
});

declare const takedownReasonBrand: unique symbol;
declare const infoReportContentBrand: unique symbol;

/** Why the claimant asks for the takedown (理由). */
export type TakedownReason = string & { readonly [takedownReasonBrand]: true };

export const TakedownReason = boundedText<TakedownReason>(
  ModerationErrorCode.InvalidTakedownReason,
  "A takedown reason",
);

/** What the reporter says is wrong or closed (内容). */
export type InfoReportContent = string & {
  readonly [infoReportContentBrand]: true;
};

export const InfoReportContent = boundedText<InfoReportContent>(
  ModerationErrorCode.InvalidInfoReportContent,
  "An info report content",
);

/** 店舗本人 or 写真の権利者. */
export type ClaimantStanding = "proprietor" | "photoRightsHolder";

/** What a proprietor can claim: only listings and places. */
export type ProprietorTarget = Extract<
  ContentRef,
  { kind: "listing" | "place" }
>;

/**
 * The claimant's standing and what it may claim: a proprietor names a
 * listing or a place and no photos; a photo rights holder names any
 * content and at least one photo, none twice.
 */
export type TakedownGround =
  | Readonly<{ standing: "proprietor"; target: ProprietorTarget }>
  | Readonly<{
      standing: "photoRightsHolder";
      target: ContentRef;
      photoIds: readonly [PhotoId, ...PhotoId[]];
    }>;

const CLAIMANT_STANDINGS = [
  "proprietor",
  "photoRightsHolder",
] as const satisfies readonly ClaimantStanding[];

const invalidGround = (why: string) =>
  new BusinessRuleError(ModerationErrorCode.InvalidTakedownGround, why);

const isProprietorTarget = (target: ContentRef): target is ProprietorTarget =>
  target.kind === "listing" || target.kind === "place";

/** The photos a ground names (none for a proprietor), in the claimant's order. */
const photoIdsOf = (ground: TakedownGround): readonly PhotoId[] =>
  ground.standing === "photoRightsHolder" ? ground.photoIds : [];

const samePhotoSet = (
  a: readonly PhotoId[],
  b: readonly PhotoId[],
): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
};

export const TakedownGround = {
  standings: CLAIMANT_STANDINGS,

  isStanding: (raw: string): raw is ClaimantStanding =>
    (CLAIMANT_STANDINGS as readonly string[]).includes(raw),

  /**
   * Throws `MODERATION_INVALID_TAKEDOWN_GROUND` for an unknown standing, a
   * proprietor naming a region / occasion / article or any photo, and a
   * photo rights holder naming no photo or one photo twice.
   */
  create: (
    standing: string,
    target: ContentRef,
    photoIds: readonly PhotoId[],
  ): TakedownGround => {
    switch (standing) {
      case "proprietor": {
        if (!isProprietorTarget(target)) {
          throw invalidGround("A proprietor claims only a listing or a place");
        }
        if (photoIds.length > 0) {
          throw invalidGround("A proprietor does not name photos");
        }
        return { standing, target };
      }
      case "photoRightsHolder": {
        const [first, ...rest] = photoIds;
        if (first === undefined) {
          throw invalidGround("A photo rights holder names at least one photo");
        }
        if (new Set(photoIds).size !== photoIds.length) {
          throw invalidGround("The same photo is named more than once");
        }
        return { standing, target, photoIds: [first, ...rest] };
      }
      default:
        throw invalidGround(`Unknown claimant standing: ${standing}`);
    }
  },

  photoIdsOf,

  /** Same standing, target (kind and id) and set of photos. */
  equals: (a: TakedownGround, b: TakedownGround): boolean =>
    a.standing === b.standing &&
    ContentRef.equals(a.target, b.target) &&
    samePhotoSet(photoIdsOf(a), photoIdsOf(b)),
};

/**
 * A report's target. A listing target also carries the place the listing
 * belonged to when reported, so the request's recipients and the place's
 * list stay fixed after the listing is deleted.
 */
export type InfoReportTarget =
  | Readonly<{ kind: "place"; placeId: PlaceId }>
  | Readonly<{ kind: "listing"; placeId: PlaceId; listingId: ListingId }>;

export const InfoReportTarget = {
  equals: (a: InfoReportTarget, b: InfoReportTarget): boolean =>
    a.kind === b.kind &&
    a.placeId === b.placeId &&
    (a.kind === "place" ||
      (b.kind === "listing" && a.listingId === b.listingId)),

  /** The `ContentRef` of what was reported (the listing for a listing target). */
  contentRef: (target: InfoReportTarget): ContentRef =>
    target.kind === "place"
      ? { kind: "place", id: target.placeId }
      : { kind: "listing", id: target.listingId },
};

/** 情報の誤り or 閉店. */
export type InfoReportCategory = "incorrectInfo" | "closure";

const INFO_REPORT_CATEGORIES = [
  "incorrectInfo",
  "closure",
] as const satisfies readonly InfoReportCategory[];

export const InfoReportCategory = {
  values: INFO_REPORT_CATEGORIES,
  /** Throws `MODERATION_INVALID_INFO_REPORT_CATEGORY` for anything else. */
  create: (raw: string): InfoReportCategory => {
    const found = INFO_REPORT_CATEGORIES.find((category) => category === raw);
    if (found === undefined) {
      throw new BusinessRuleError(
        ModerationErrorCode.InvalidInfoReportCategory,
        `Unknown info report category: ${raw}`,
      );
    }
    return found;
  },
};
