import {
  Application,
  type ApplicationOf,
  ApplicationTarget,
  SubmissionScope,
} from "@repo/core/domain/application/application";
import { ApplicationId, type PlaceId } from "@repo/core/domain/common/ids";
import { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import {
  PlaceRevision,
  type PlaceState,
} from "@repo/core/domain/place/revision";
import type { PlaceProfileFields } from "../place/profileInput";
import type { GeneratedId } from "../ports/idGenerator";
import type { ActorServiceArgs } from "../types";
import { applicationIdConflict, claimApplicationPhotos } from "./applicant";
import { defer, deferProfile, peek } from "./deferredInput";
import {
  placeViewability,
  readPlaceHasSteward,
  readSubmissionFindings,
} from "./facts";

export type SubmitPlaceRevisionInput = Readonly<{
  /** Minted by the caller and resent unchanged. */
  applicationId: GeneratedId;
  placeId: PlaceId;
  /** The whole desired profile (the same items as a registration). */
  profile: PlaceProfileFields;
  /** The desired operating status. */
  operatingStatus: string;
}>;

/**
 * A user applies for a revision — and/or an operating status change — of
 * a place without a steward (SHP-08, APP-04; `spec/usecases/application.md`
 * 「submitPlaceRevision」). The application holds only the items that
 * differ from the place now (`PlaceRevision`), plus the whole desired
 * state for the idempotent resend. Only newly added photos become the
 * application's. Emits `application.submitted` (operator seat); the place
 * does not change.
 *
 * Checks, in order: the same id (resend: the same desired state returns
 * the stored application, whatever became of the place or of it — else
 * `ConflictError`), the premise, the viewable place, an active revision
 * of the applicant, then the content (the entered values, built before the
 * unit of work with their errors held back until here, then the patch
 * against the place) and photos. An entered input that does not make a
 * valid state never equals a stored application: `ConflictError`.
 *
 * - `BusinessRuleError`: `APPLICATION_PLACE_HAS_STEWARD`,
 *   `APPLICATION_TARGET_NOT_VIEWABLE` (suspended or missing place),
 *   `APPLICATION_ALREADY_ACTIVE`, `COMMON_INVALID_FIELD_PATCH`,
 *   `PlaceProfile.create`'s codes, `PLACE_INVALID_OPERATING_STATUS`,
 *   `AREA_TOWN_NOT_FOUND`, `MEDIA_PHOTO_*`.
 * - `ConflictError`: the id conflict, a slot taken concurrently, a
 *   photo's lock.
 */
export async function submitPlaceRevision({
  container,
  actor,
  input,
}: ActorServiceArgs<SubmitPlaceRevisionInput>): Promise<
  ApplicationOf<"revision">
> {
  const id = ApplicationId.create(input.applicationId);
  const profile = await deferProfile(container, input.profile);
  const entered = defer(
    (): PlaceState => ({
      profile: profile(),
      operatingStatus: OperatingStatus.create(input.operatingStatus),
    }),
  );
  const target = ApplicationTarget.byIndividual(actor.accountId, {
    kind: "revision",
    placeId: input.placeId,
  });
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.applicationRepository.findById(id);
    if (found !== null) {
      const desired = peek(entered);
      if (
        desired === null ||
        !Application.matchesSubmission(found.entity, { target, desired })
      ) {
        throw applicationIdConflict(id);
      }
      return found.entity as ApplicationOf<"revision">;
    }
    const place =
      (await ctx.placeRepository.findById(input.placeId))?.entity ?? null;
    const admission = SubmissionScope.admit(
      target,
      await readSubmissionFindings(
        ctx,
        target,
        { placeHasSteward: await readPlaceHasSteward(ctx, input.placeId) },
        placeViewability(input.placeId, place),
      ),
    );
    if (place === null) throw new Error("An admitted place exists");
    const desired = entered();
    const submitted = Application.submit(
      {
        id,
        admission,
        reserved: {},
        content: PlaceRevision.between(place, desired),
        desired,
      },
      now,
    );
    await claimApplicationPhotos(ctx, id, submitted.claimedPhotoIds, actor);
    await ctx.applicationRepository.insert(submitted.entity);
    ctx.collectEvents(submitted.eventDrafts);
    return submitted.entity;
  });
}
