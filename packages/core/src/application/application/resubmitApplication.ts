import {
  Application,
  type ApplicationKind,
  type ApplicationOf,
  Premise,
  type ReturnedApplication,
  type UnderReviewApplication,
} from "@repo/core/domain/application/application";
import type {
  PremiseHolds,
  PremiseKey,
} from "@repo/core/domain/application/premise";
import type { Returned } from "@repo/core/domain/application/status";
import { StewardshipClaim } from "@repo/core/domain/application/stewardshipClaim";
import { ReturnReply } from "@repo/core/domain/application/texts";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { Version } from "@repo/core/domain/common/version";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import {
  ListingContent,
  type ListingContentInput,
} from "@repo/core/domain/listing/content";
import { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import type { PlaceProfile } from "@repo/core/domain/place/profile";
import { PlaceRevision } from "@repo/core/domain/place/revision";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import type { PlaceProfileFields } from "../place/profileInput";
import type { ActorServiceArgs } from "../types";
import {
  assertApplicantVersion,
  claimApplicationPhotos,
  requireHandledBy,
} from "./applicant";
import { type Deferred, deferProfile } from "./deferredInput";
import { evaluatePremise } from "./facts";
import { applicationNotFound } from "./review";
import { listingPatchOf } from "./submitListingRevision";

/**
 * The corrected content of a resubmission: per kind, the same input its
 * submission takes, without the target. S3B adds the affiliation and
 * leave (no content: only the reply) and the participation (listings and
 * dates).
 */
export type ResubmissionContent =
  | Readonly<{ kind: "registration"; profile: PlaceProfileFields }>
  | Readonly<{
      kind: "revision";
      profile: PlaceProfileFields;
      operatingStatus: string;
    }>
  | Readonly<{ kind: "stewardship"; relationship: string; evidence: string }>
  | Readonly<{ kind: "listing"; content: ListingContentInput }>
  | Readonly<{ kind: "listingRevision"; content: ListingContentInput }>;

export type ResubmitApplicationInput = Readonly<{
  applicationId: ApplicationId;
  /** The version the applicant read the returned application at. */
  version: Version;
  amended: ResubmissionContent;
  /** The answer to the approver's request; `null` for none. */
  reply: string | null;
}>;

/**
 * Back under review, or — when a premise no longer held — lapsed, with
 * the premises that broke (committed, not thrown).
 */
export type ResubmissionResult =
  | Readonly<{ outcome: "resubmitted"; application: UnderReviewApplication }>
  | Readonly<{
      outcome: "lapsed";
      application: ApplicationOf<ApplicationKind>;
      brokenPremises: readonly [PremiseKey, ...PremiseKey[]];
    }>;

// The profile's town is resolved before the unit of work; the profile is
// built, and its errors thrown, only after the premise held.
type DeferredProfile = Deferred<PlaceProfile>;

type Resubmitted = ReturnType<typeof Application.resubmit>;

type Context = UnitOfWorkContext;

/**
 * `Application.resubmit` of `app` with the corrected content, built now
 * through the same functions as its submission.
 */
async function resubmitWith(
  ctx: Context,
  app: ReturnedApplication,
  amended: ResubmissionContent,
  profile: DeferredProfile | null,
  reply: ReturnReply | null,
  premise: PremiseHolds,
  now: Date,
): Promise<Resubmitted> {
  const requireProfile = (): PlaceProfile => {
    if (profile === null) throw new Error("The profile was not prepared");
    return profile();
  };
  switch (amended.kind) {
    case "registration": {
      const returned = app as Returned<ApplicationOf<"registration">>;
      return Application.resubmit(
        returned,
        { content: requireProfile(), reply },
        premise,
        now,
      );
    }
    case "revision": {
      const returned = app as Returned<ApplicationOf<"revision">>;
      const desired = {
        profile: requireProfile(),
        operatingStatus: OperatingStatus.create(amended.operatingStatus),
      };
      const place = await ctx.placeRepository.findById(returned.target.placeId);
      if (place === null) throw new Error("A revised place exists");
      return Application.resubmit(
        returned,
        {
          content: PlaceRevision.between(place.entity, desired),
          reply,
          desired,
        },
        premise,
        now,
      );
    }
    case "stewardship": {
      const returned = app as Returned<ApplicationOf<"stewardship">>;
      return Application.resubmit(
        returned,
        { content: StewardshipClaim.create(amended), reply },
        premise,
        now,
      );
    }
    case "listing": {
      const returned = app as Returned<ApplicationOf<"listing">>;
      const content = ListingContent.toPublishable(
        ListingContent.create(amended.content),
      );
      const catalog = (await ctx.categoryCatalogRepository.find()).entity;
      CategoryCatalog.requireActive(catalog, content.categoryId);
      return Application.resubmit(returned, { content, reply }, premise, now);
    }
    case "listingRevision": {
      const returned = app as Returned<ApplicationOf<"listingRevision">>;
      const desired = ListingContent.create(amended.content);
      const listing = await ctx.listingRepository.findById(
        returned.target.listingId,
      );
      if (listing === null) throw new Error("A revised listing exists");
      return Application.resubmit(
        returned,
        {
          content: await listingPatchOf(ctx, listing.entity.content, desired),
          reply,
          desired,
        },
        premise,
        now,
      );
    }
  }
}

/**
 * The applicant corrects a returned application and answers the
 * approver's request, putting it back under review (APP-02, APP-06;
 * `spec/usecases/application.md` 「resubmitApplication」). One usecase for
 * every kind; the target, the reserved ids and a listing revision's place
 * never change, and a registration's companion claim is not touched. The
 * content is rebuilt by the submission's functions (a revision against the
 * target's present content). Newly added photos become the application's;
 * dropped ones are released (`photos.released`). Emits
 * `application.resubmitted`; `since` restarts the review period. A
 * steward's application may be resubmitted by any steward of the place.
 *
 * The premises are checked (the targets' viewability is not): when one no
 * longer holds the application lapses and commits (`application.lapsed`),
 * and the lapse is returned rather than thrown — the corrected content is
 * then not checked.
 *
 * Checks, in order: the application (`NotFoundError`, also for content of
 * another kind), the applicant (`ForbiddenError`), the status
 * (`requireReturned`'s codes), the version read (`ConflictError`), the
 * premises (lapse), the content (the submission's codes,
 * `APPLICATION_INVALID_RETURN_REPLY`).
 */
export async function resubmitApplication({
  container,
  actor,
  input,
}: ActorServiceArgs<ResubmitApplicationInput>): Promise<ResubmissionResult> {
  const { amended } = input;
  const profile =
    amended.kind === "registration" || amended.kind === "revision"
      ? await deferProfile(container, amended.profile)
      : null;
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.applicationRepository.findById(input.applicationId);
    if (found === null || found.entity.target.kind !== amended.kind) {
      throw applicationNotFound(input.applicationId);
    }
    const app = found.entity;
    await requireHandledBy(ctx, actor, app);
    const returned = Application.requireReturned(app);
    assertApplicantVersion(returned, input.version);
    const result = await evaluatePremise(ctx, returned.target);
    if (!result.holds) {
      const lapse = Application.reassess(returned, result, now);
      await ctx.applicationRepository.save(lapse.entity, found.expectedVersion);
      ctx.collectEvents(lapse.eventDrafts);
      return {
        outcome: "lapsed",
        application: lapse.entity,
        brokenPremises: result.broken,
      };
    }
    const resubmitted = await resubmitWith(
      ctx,
      returned,
      amended,
      profile,
      input.reply === null ? null : ReturnReply.create(input.reply),
      Premise.require(result),
      now,
    );
    await claimApplicationPhotos(
      ctx,
      returned.id,
      resubmitted.claimedPhotoIds,
      actor,
    );
    await ctx.applicationRepository.save(
      resubmitted.entity,
      found.expectedVersion,
    );
    ctx.collectEvents(resubmitted.eventDrafts);
    return { outcome: "resubmitted", application: resubmitted.entity };
  });
}
