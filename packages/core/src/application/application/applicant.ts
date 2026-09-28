import type {
  ActingApplicant,
  Applicant,
} from "@repo/core/domain/application/applicant";
import {
  type Application,
  Application as ApplicationBehaviour,
} from "@repo/core/domain/application/application";
import type { AnyApplication } from "@repo/core/domain/application/kind";
import type { AuthorityRepositories } from "@repo/core/domain/authority/ports/unitOfWork";
import type { Actor } from "@repo/core/domain/common/actor";
import type { ApplicationId, PhotoId } from "@repo/core/domain/common/ids";
import type { Version } from "@repo/core/domain/common/version";
import type { MediaRepositories } from "@repo/core/domain/media/ports/unitOfWork";
import { authorizeOnTarget } from "../authority/access";
import { ConflictError, ForbiddenError } from "../errors";
import { claimNewPhotos } from "../place/photos";

/**
 * The applicant's side of an application (`spec/usecases/application.md`
 * 「申請者の立場」): who acts for an applicant, whether they handle an
 * application, and the conflicts an applicant's operation can meet.
 */

/** The id is already an application with other content (idempotent create). */
export const APPLICATION_ID_CONFLICT = "APPLICATION_ID_CONFLICT";
/** The applicant acted on a version someone else has changed since. */
export const APPLICATION_VERSION_CONFLICT = "APPLICATION_VERSION_CONFLICT";

export const applicationIdConflict = (id: ApplicationId): ConflictError =>
  new ConflictError(
    APPLICATION_ID_CONFLICT,
    `Application id ${id} is already used for other content`,
  );

/**
 * The `ActingApplicant` of `actor` for an application from `applicant`:
 * the individual for an individual's application; for one made as a
 * place's steward, a steward of that place — decided by `act_as_place`
 * (`authorizeOnTarget`, so a stewardship lost before the commit refuses
 * it too). `ForbiddenError` when `act_as_place` refuses.
 */
export async function actingFor(
  ctx: AuthorityRepositories,
  actor: Actor,
  applicant: Applicant,
): Promise<ActingApplicant> {
  if (applicant.kind === "individual") {
    return { kind: "individual", accountId: actor.accountId };
  }
  await authorizeOnTarget(ctx, actor, "act_as_place", {
    kind: "place",
    id: applicant.placeId,
  });
  return {
    kind: "steward",
    accountId: actor.accountId,
    placeId: applicant.placeId,
  };
}

/**
 * `ForbiddenError` unless `actor` handles `app` (`Application.isHandledBy`):
 * its individual applicant, or — for an application made as a steward —
 * any current steward of the place.
 */
export async function requireHandledBy(
  ctx: AuthorityRepositories,
  actor: Actor,
  app: AnyApplication,
): Promise<ActingApplicant> {
  const acting = await actingFor(ctx, actor, app.target.applicant);
  if (!ApplicationBehaviour.isHandledBy(app, acting)) {
    throw new ForbiddenError(
      "FORBIDDEN",
      "The actor does not handle the application",
    );
  }
  return acting;
}

/** 編集の競合: the version the applicant read must still be the stored one. */
export function assertApplicantVersion(app: Application, read: Version): void {
  if (app.version !== read) {
    throw new ConflictError(
      APPLICATION_VERSION_CONFLICT,
      `Application ${app.id} changed since version ${read} was read`,
    );
  }
}

/**
 * Makes the application the owner of `photoIds` (`PhotoOwnership.claimAll`,
 * owner `{ kind: "application"; id }`, `by` the actor), inside the unit
 * of work that writes it: `MEDIA_PHOTO_NOT_AVAILABLE`,
 * `MEDIA_PHOTO_NOT_REGISTRANT`, `MEDIA_PHOTO_ALREADY_OWNED` roll it back.
 */
export function claimApplicationPhotos(
  ctx: MediaRepositories,
  id: ApplicationId,
  photoIds: readonly PhotoId[],
  actor: Actor,
): Promise<void> {
  return claimNewPhotos(ctx, photoIds, { kind: "application", id }, actor);
}
