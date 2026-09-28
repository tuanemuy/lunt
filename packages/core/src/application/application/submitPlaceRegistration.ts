import {
  Application,
  type ApplicationOf,
  ApplicationTarget,
  Premise,
  SubmissionScope,
} from "@repo/core/domain/application/application";
import { StewardshipClaim } from "@repo/core/domain/application/stewardshipClaim";
import { ApplicationId, PlaceId } from "@repo/core/domain/common/ids";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import type { PlaceProfileFields } from "../place/profileInput";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import { applicationIdConflict, claimApplicationPhotos } from "./applicant";
import { defer, deferProfile, peek } from "./deferredInput";

export type CompanionClaimInput = Readonly<{
  /** The claim's id, minted by the caller and resent unchanged. */
  applicationId: GeneratedId;
  /** 店舗との関係. */
  relationship: string;
  /** 確認に使える連絡先または資料, as text. */
  evidence: string;
}>;

export type SubmitPlaceRegistrationInput = Readonly<{
  /** The registration's id, minted by the caller and resent unchanged. */
  applicationId: GeneratedId;
  /** The place's whole profile; photos in display order. */
  profile: PlaceProfileFields;
  /** A stewardship claim filed with the registration, or `null`. */
  stewardship: CompanionClaimInput | null;
}>;

/** The registration, and the claim filed with it (`null` without one). */
export type SubmittedRegistration = Readonly<{
  registration: ApplicationOf<"registration">;
  stewardship: ApplicationOf<"stewardship"> | null;
}>;

type Context = Pick<UnitOfWorkContext, "applicationRepository">;

/**
 * The claim filed with `registration` as stored: `null` when no claim
 * refers to it. Any claim that refers to the registration counts
 * (`findPageBySubject`, 「登録申請の「併せた申請」」).
 */
async function storedCompanionExists(
  ctx: Context,
  registration: ApplicationOf<"registration">,
): Promise<boolean> {
  const page = await ctx.applicationRepository.findPageBySubject(
    { kind: "registration", id: registration.id },
    { kinds: ["stewardship"] },
    { page: 1, limit: 1 },
  );
  return page.count > 0;
}

/** The resend of a stored registration: the stored pair, or `ConflictError`. */
async function replay(
  ctx: Context,
  stored: ApplicationOf<"registration">,
  request: Readonly<{
    registration: Parameters<typeof Application.matchesSubmission>[1] | null;
    claim: Readonly<{
      id: ApplicationId;
      content: StewardshipClaim | null;
    }> | null;
  }>,
  actor: ActorServiceArgs<unknown>["actor"],
): Promise<SubmittedRegistration> {
  // An input whose values cannot be built never equals a stored application.
  if (
    request.registration === null ||
    !Application.matchesSubmission(stored, request.registration)
  ) {
    throw applicationIdConflict(stored.id);
  }
  if (request.claim === null) {
    if (await storedCompanionExists(ctx, stored)) {
      throw applicationIdConflict(stored.id);
    }
    return { registration: stored, stewardship: null };
  }
  const claim = await ctx.applicationRepository.findById(request.claim.id);
  const target = ApplicationTarget.companion(stored, actor.accountId);
  const { content } = request.claim;
  if (
    content === null ||
    claim === null ||
    target === null ||
    claim.entity.target.kind !== "stewardship" ||
    claim.entity.target.registrationId !== stored.id ||
    !Application.matchesSubmission(claim.entity, {
      target,
      content,
    })
  ) {
    throw applicationIdConflict(request.claim.id);
  }
  return {
    registration: stored,
    stewardship: claim.entity as ApplicationOf<"stewardship">,
  };
}

/**
 * A user applies for a new place to be registered (SHP-03, APP-04;
 * `spec/usecases/application.md` 「submitPlaceRegistration」), optionally
 * filing a stewardship claim with it (M-45): two applications under
 * review, in one unit of work, each emitting `application.submitted`. The
 * registration reserves the place id its approval creates the place
 * under; it has no premises, no viewable targets and no slot. The claim's
 * target is `ApplicationTarget.companion` of the registration. The
 * photos become the registration's.
 *
 * Checks, in order: the same id, then the content's values (built from
 * the input before the unit of work, their errors held back until here),
 * then the photos. A registration has no premise, target or slot.
 *
 * Idempotent create per application: a resend of the stored registration
 * (and of its claim, rebuilt from the stored registration) with the same
 * content returns them without writing or reserving; other content — or a
 * claim where none was filed, or none where one was — is `ConflictError`,
 * and neither is written.
 *
 * - `BusinessRuleError`: `PlaceProfile.create`'s codes
 *   (`PLACE_INVALID_NAME`, `PLACE_DUPLICATE_PHOTO`, …),
 *   `AREA_TOWN_NOT_FOUND`, `APPLICATION_INVALID_STEWARDSHIP_CLAIM`,
 *   `MEDIA_PHOTO_NOT_AVAILABLE`, `MEDIA_PHOTO_NOT_REGISTRANT`,
 *   `MEDIA_PHOTO_ALREADY_OWNED`.
 * - `ConflictError`: the id conflicts above, a taken id, a photo's lock.
 */
export async function submitPlaceRegistration({
  container,
  actor,
  input,
}: ActorServiceArgs<SubmitPlaceRegistrationInput>): Promise<SubmittedRegistration> {
  const id = ApplicationId.create(input.applicationId);
  const profile = await deferProfile(container, input.profile);
  const { stewardship } = input;
  const claim =
    stewardship === null
      ? null
      : {
          id: ApplicationId.create(stewardship.applicationId),
          content: defer(() => StewardshipClaim.create(stewardship)),
        };
  const target = ApplicationTarget.byIndividual(actor.accountId, {
    kind: "registration",
  });
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.applicationRepository.findById(id);
    if (found !== null) {
      if (found.entity.target.kind !== "registration") {
        throw applicationIdConflict(id);
      }
      const entered = peek(profile);
      return replay(
        ctx,
        found.entity as ApplicationOf<"registration">,
        {
          registration: entered === null ? null : { target, content: entered },
          claim:
            claim === null
              ? null
              : { id: claim.id, content: peek(claim.content) },
        },
        actor,
      );
    }
    const admission = SubmissionScope.admit(target, {
      premise: Premise.evaluate(target, {}),
      unviewable: [],
      activeDuplicate: null,
    });
    const content = profile();
    const claimContent = claim?.content() ?? null;
    const submitted = Application.submit(
      {
        id,
        admission,
        reserved: {
          reservedPlaceId: PlaceId.create(container.idGenerator.next()),
        },
        content,
      },
      now,
    );
    const registration = submitted.entity;
    await claimApplicationPhotos(ctx, id, submitted.claimedPhotoIds, actor);
    await ctx.applicationRepository.insert(registration);
    ctx.collectEvents(submitted.eventDrafts);
    if (claim === null || claimContent === null) {
      return { registration, stewardship: null };
    }

    const companion = ApplicationTarget.companion(
      registration,
      actor.accountId,
    );
    if (companion === null) {
      throw new Error("A registration's own applicant files its companion");
    }
    // Filed in the same scope: the registration is under review and the
    // reserved place has no stewardship yet.
    const filed = Application.submit(
      {
        id: claim.id,
        admission: SubmissionScope.admit(companion, {
          premise: Premise.evaluate(companion, {
            applicantIsSteward: false,
            registration: "underReview",
          }),
          unviewable: [],
          activeDuplicate: null,
        }),
        reserved: {},
        content: claimContent,
      },
      now,
    );
    await ctx.applicationRepository.insert(filed.entity);
    ctx.collectEvents(filed.eventDrafts);
    return { registration, stewardship: filed.entity };
  });
}
