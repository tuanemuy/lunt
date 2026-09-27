import {
  CommonErrorCode,
  type PublishConditionUnmetCode,
  SubjectErrorCode,
} from "@repo/core/domain/common/errorCode";
import type { PublishableSubject } from "@repo/core/domain/common/exposureSubject";
import type { Suspension } from "@repo/core/domain/common/suspension";
import {
  BusinessRuleError,
  type SerializedBusinessError,
} from "@repo/core/domain/error";

export type UnpublishReason = "byManager" | "photoTakedown";

export type DraftPublication = Readonly<{ status: "draft" }>;
export type PublishedPublication = Readonly<{
  status: "published";
  firstPublishedAt: Date;
}>;
export type UnpublishedPublication = Readonly<{
  status: "unpublished";
  firstPublishedAt: Date;
  reason: UnpublishReason;
}>;

/**
 * Publication state shared by listings, regions, occasions and articles.
 * `firstPublishedAt` is the first publication instant and survives
 * re-publishing (it drives "newest first").
 */
export type Publication =
  | DraftPublication
  | PublishedPublication
  | UnpublishedPublication;

export type Exposure = Readonly<{
  publication: Publication;
  suspension: Suspension;
}>;

export type SerializedPublishConditionUnmetError<M = unknown> =
  SerializedBusinessError & { missing: readonly M[] };

/**
 * `{subject}_PUBLISH_CONDITION_UNMET`, carrying the unmet requirements so the
 * UI can say what is missing. Aggregates that reject a save of published
 * content for the same reason raise this too (`Publication.assertConditionMet`).
 */
export class PublishConditionUnmetError<
  S extends PublishableSubject = PublishableSubject,
  M = unknown,
> extends BusinessRuleError<PublishConditionUnmetCode<S>> {
  constructor(
    subject: S,
    public readonly missing: readonly [M, ...M[]],
  ) {
    super(
      SubjectErrorCode.publishConditionUnmet(subject),
      "Publish condition unmet",
    );
  }

  override toSerialized(): SerializedPublishConditionUnmetError<M> {
    return { ...super.toSerialized(), missing: this.missing };
  }
}

export function isPublishConditionUnmetError(
  error: unknown,
): error is PublishConditionUnmetError {
  return error instanceof PublishConditionUnmetError;
}

const isNonEmpty = <T>(items: readonly T[]): items is readonly [T, ...T[]] =>
  items.length > 0;

const invalidTransition = (from: Publication["status"], to: string) =>
  new BusinessRuleError(
    CommonErrorCode.PublicationInvalidTransition,
    `Cannot transition publication from ${from} to ${to}`,
  );

/**
 * The only place the publication transitions and their check order live.
 * Aggregates pass their own state and the unmet requirements; they do not
 * re-implement the ordering.
 */
export const Publication = {
  draft: (): DraftPublication => ({ status: "draft" }),

  /**
   * Checks, in order: suspended → `{subject}_SUSPENDED`; already published →
   * `COMMON_PUBLICATION_INVALID_TRANSITION`; `missing` non-empty →
   * `PublishConditionUnmetError`. `firstPublishedAt` is `now` from `draft`
   * and unchanged on re-publishing.
   */
  publish: <S extends PublishableSubject, M>(
    state: Exposure,
    missing: readonly M[],
    now: Date,
    subject: S,
  ): PublishedPublication => {
    if (state.suspension.suspended) {
      throw new BusinessRuleError(
        SubjectErrorCode.suspended(subject),
        "Suspended by the operator",
      );
    }
    const { publication } = state;
    if (publication.status === "published") {
      throw invalidTransition(publication.status, "published");
    }
    if (isNonEmpty(missing)) {
      throw new PublishConditionUnmetError(subject, missing);
    }
    return {
      status: "published",
      firstPublishedAt:
        publication.status === "draft" ? now : publication.firstPublishedAt,
    };
  },

  /**
   * Checks, in order: `byManager` while suspended → `{subject}_SUSPENDED`
   * (`photoTakedown` skips this: losing the publish condition unpublishes even
   * during a suspension); not published → `COMMON_PUBLICATION_INVALID_TRANSITION`.
   */
  unpublish: <S extends PublishableSubject>(
    state: Exposure,
    reason: UnpublishReason,
    subject: S,
  ): UnpublishedPublication => {
    if (reason === "byManager" && state.suspension.suspended) {
      throw new BusinessRuleError(
        SubjectErrorCode.suspended(subject),
        "Suspended by the operator",
      );
    }
    const { publication } = state;
    if (publication.status !== "published") {
      throw invalidTransition(publication.status, "unpublished");
    }
    return {
      status: "unpublished",
      firstPublishedAt: publication.firstPublishedAt,
      reason,
    };
  },

  /**
   * Throws `PublishConditionUnmetError` when `missing` is non-empty. For
   * aggregates guarding a save of published content (the check `publish`
   * does as its last step, without the transition checks).
   */
  assertConditionMet: <S extends PublishableSubject, M>(
    missing: readonly M[],
    subject: S,
  ): void => {
    if (isNonEmpty(missing)) {
      throw new PublishConditionUnmetError(subject, missing);
    }
  },

  isPublished: (
    publication: Publication,
  ): publication is PublishedPublication => publication.status === "published",
};
