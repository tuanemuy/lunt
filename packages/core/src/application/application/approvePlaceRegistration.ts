import type { Application } from "@repo/core/domain/application/application";
import { Place } from "@repo/core/domain/place/place";
import type { ActorServiceArgs } from "../types";
import {
  type ApprovalOutcome,
  type ApproveApplicationInput,
  approveApplication,
} from "./approval";
import { type CompanionView, companionView, readCompanion } from "./companion";

export type ApprovePlaceRegistrationInput = ApproveApplicationInput;

/**
 * `ApprovalOutcome` of a registration, with its companion claim (the
 * first of `findPageBySubject(registration)`: the active one, else the
 * newest) — CM-01 leads on to deciding it.
 */
export type PlaceRegistrationApproval = ApprovalOutcome &
  Readonly<{ companion: CompanionView | null }>;

/**
 * An operator approves a place registration (SHP-09, CM-01): the place is
 * registered under the reserved id, open and not suspended, with the
 * application's profile, and the application's photos become the place's.
 * The applicant gets no stewardship; a companion claim stays under review
 * and becomes decidable. Registrations have no premise, so it never
 * lapses. `application.approved` is stored.
 *
 * - `NotFoundError` (none, or not a registration); `ForbiddenError` (not
 *   an operator).
 * - The status code when not under review; `ConflictError` when changed
 *   since `version`.
 */
export async function approvePlaceRegistration({
  container,
  actor,
  input,
}: ActorServiceArgs<ApprovePlaceRegistrationInput>): Promise<PlaceRegistrationApproval> {
  let companion: Application | null = null;
  const outcome = await approveApplication({
    container,
    actor,
    input,
    kind: "registration",
    reflect: async (ctx, app, _premise, now) => {
      companion = await readCompanion(ctx, app.id);
      const { entity, eventDrafts } = Place.register(
        { id: app.reservedPlaceId, profile: app.content },
        now,
      );
      await ctx.placeRepository.insert(entity);
      return { eventDrafts };
    },
  });
  return { ...outcome, companion: companionView(companion) };
}
