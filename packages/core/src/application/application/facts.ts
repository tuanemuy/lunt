import {
  type ApplicationKind,
  ApplicationSlot,
  type ApplicationTarget,
  Premise,
  type PremiseFactsOf,
  SubmissionScope,
  type TargetOf,
} from "@repo/core/domain/application/application";
import type {
  FactsFor,
  PremiseResultFor,
  SpecOfTarget,
} from "@repo/core/domain/application/kind";
import type { ApplicationKindMap } from "@repo/core/domain/application/kinds";
import type { ListingRevisionFacts } from "@repo/core/domain/application/kinds/listingRevision";
import type { SubmissionFindings } from "@repo/core/domain/application/model";
import type { ApplicationStatusKind } from "@repo/core/domain/application/status";
import type { SubmissionTarget } from "@repo/core/domain/application/subject";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type {
  AccountId,
  ApplicationId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import {
  type ListingExposure,
  type PlaceExposure,
  VisibilityPolicy,
} from "@repo/core/domain/discovery/visibilityPolicy";
import type { Listing } from "@repo/core/domain/listing/listing";
import type { RequestContainer } from "../di/types";
import type { UnitOfWorkContext } from "../execution/unitOfWork";

/**
 * Reading the facts an application's premises and admission rest on
 * (`spec/usecases/application.md` 「前提の事実の読み取り」, 「提出のユースケース
 * に共通すること」). Submission, resubmission, the eligibility check, the
 * approvals and the reassessment consumer all read them here, so every
 * one judges a premise from the same facts.
 *
 * Every `read…` runs inside a unit of work, before its writes. Stage 3
 * adds the region and occasion facts (`affiliated`, `participating`,
 * `holdingStatus`) with their kinds.
 */

/** The repositories premise facts are read from. */
export type FactContext = Pick<
  UnitOfWorkContext,
  "stewardshipRepository" | "listingRepository" | "applicationRepository"
>;

const placeRef = (id: PlaceId) => ({ kind: "place", id }) as const;

async function placeStewardship(
  ctx: Pick<FactContext, "stewardshipRepository">,
  placeId: PlaceId,
): Promise<Stewardship> {
  const ref = placeRef(placeId);
  const found = await ctx.stewardshipRepository.findById(ref);
  return Stewardship.orVacant(found?.entity ?? null, ref);
}

/**
 * `placeHasSteward`: the place's stewardship is not vacant
 * (`Stewardship.isVacant`); a place with none stored has no steward.
 */
export async function readPlaceHasSteward(
  ctx: Pick<FactContext, "stewardshipRepository">,
  placeId: PlaceId,
): Promise<boolean> {
  return !Stewardship.isVacant(await placeStewardship(ctx, placeId));
}

/**
 * `applicantIsSteward` (`Stewardship.isSteward`). A registration's reserved
 * place has no stewardship before its approval, so no one stewards it.
 */
export async function readApplicantIsSteward(
  ctx: Pick<FactContext, "stewardshipRepository">,
  placeId: PlaceId,
  accountId: AccountId,
): Promise<boolean> {
  return Stewardship.isSteward(await placeStewardship(ctx, placeId), accountId);
}

/**
 * `registration`: the status of the registration a claim was filed with,
 * or `null` without one (`registrationId` `null`). A registration that
 * cannot be read also gives `null`, which breaks `registrationStanding`.
 */
export async function readRegistrationStatus(
  ctx: Pick<FactContext, "applicationRepository">,
  registrationId: ApplicationId | null,
): Promise<ApplicationStatusKind | null> {
  if (registrationId === null) return null;
  const found = await ctx.applicationRepository.findById(registrationId);
  return found?.entity.status.kind ?? null;
}

/**
 * `listing`: `null` for a missing (deleted) listing; otherwise its place's
 * `placeHasSteward`. Takes the listing the caller already read, so a
 * usecase that needs the listing for its content reads it once.
 */
export async function readListingFacts(
  ctx: Pick<FactContext, "stewardshipRepository">,
  listing: Listing | null,
): Promise<ListingRevisionFacts["listing"]> {
  if (listing === null) return null;
  return { placeHasSteward: await readPlaceHasSteward(ctx, listing.placeId) };
}

type FactReader<K extends ApplicationKind> = (
  ctx: FactContext,
  target: TargetOf<K>,
) => Promise<PremiseFactsOf<K>>;

const FACT_READERS: { readonly [K in ApplicationKind]: FactReader<K> } = {
  registration: async () => ({}),
  revision: async (ctx, target) => ({
    placeHasSteward: await readPlaceHasSteward(ctx, target.placeId),
  }),
  listing: async (ctx, target) => ({
    placeHasSteward: await readPlaceHasSteward(ctx, target.placeId),
  }),
  stewardship: async (ctx, target) => ({
    applicantIsSteward: await readApplicantIsSteward(
      ctx,
      target.placeId,
      target.applicant.accountId,
    ),
    registration: await readRegistrationStatus(ctx, target.registrationId),
  }),
  listingRevision: async (ctx, target) => {
    const found = await ctx.listingRepository.findById(target.listingId);
    return { listing: await readListingFacts(ctx, found?.entity ?? null) };
  },
};

/** The facts of `target`'s kind (`PremiseFactsOf<K>`), read now. */
export async function readPremiseFacts<T extends ApplicationTarget>(
  ctx: FactContext,
  target: T,
): Promise<FactsFor<SpecOfTarget<ApplicationKindMap, T>>> {
  // Kind generics cannot follow a runtime kind; the table above is typed
  // per kind, so the lookup only erases the correlation.
  const read = FACT_READERS[target.kind] as unknown as (
    ctx: FactContext,
    target: T,
  ) => Promise<FactsFor<SpecOfTarget<ApplicationKindMap, T>>>;
  return read(ctx, target);
}

/**
 * `Premise.evaluate` of `target` on the facts read now: what a
 * resubmission, an approval and the reassessment consumer pass to
 * `Application.reassess`.
 */
export async function evaluatePremise<T extends ApplicationTarget>(
  ctx: FactContext,
  target: T,
): Promise<PremiseResultFor<SpecOfTarget<ApplicationKindMap, T>>> {
  return Premise.evaluate(target, await readPremiseFacts(ctx, target));
}

/**
 * Whether each of the targets that must be viewable
 * (`SubmissionScope.targets`) is, keyed by `ContentRef.key`. A usecase
 * judges the targets it reads as aggregates with `VisibilityPolicy`
 * (`placeViewability`, `listingViewability`) and the others with
 * `referenceViewability` before its unit of work; `viewabilityOf` joins
 * both.
 */
export type Viewability = ReadonlyMap<string, boolean>;

/** `ReferenceQueries.isViewable` of each ref; call it outside `run`. */
export async function referenceViewability(
  container: Pick<RequestContainer, "referenceQueries">,
  refs: readonly SubmissionTarget[],
): Promise<Viewability> {
  const judged = await Promise.all(
    refs.map(
      async (ref) =>
        [
          ContentRef.key(ref),
          await container.referenceQueries.isViewable(ref),
        ] as const,
    ),
  );
  return new Map(judged);
}

/** A place read as an aggregate: missing reads as not viewable. */
export const placeViewability = (
  id: PlaceId,
  place: PlaceExposure | null,
): Viewability =>
  new Map([
    [
      ContentRef.key(placeRef(id)),
      place !== null && VisibilityPolicy.isPlaceViewable(place),
    ],
  ]);

/**
 * A listing read as an aggregate with its place: missing reads as not
 * viewable, and so does a listing of a suspended place.
 */
export const listingViewability = (
  ref: Extract<SubmissionTarget, { kind: "listing" }>,
  listing: ListingExposure | null,
  place: PlaceExposure | null,
): Viewability =>
  new Map([
    [
      ContentRef.key(ref),
      listing !== null && VisibilityPolicy.isListingViewable(listing, place),
    ],
  ]);

/** Joins viewability judged in different ways. */
export const viewabilityOf = (...parts: readonly Viewability[]): Viewability =>
  new Map(parts.flatMap((part) => [...part]));

/**
 * The refs among `SubmissionScope.targets(target)` that are not judged
 * from aggregates of the kinds in `readAsAggregates` — the ones a usecase
 * asks `ReferenceQueries` about.
 */
export const referencedTargets = (
  target: ApplicationTarget,
  readAsAggregates: readonly SubmissionTarget["kind"][] = [],
): readonly SubmissionTarget[] =>
  SubmissionScope.targets(target).filter(
    (ref) => !readAsAggregates.includes(ref.kind),
  );

/** `activeDuplicate`: the active application in `target`'s slot, if any. */
export async function readActiveDuplicate(
  ctx: Pick<FactContext, "applicationRepository">,
  target: ApplicationTarget,
): Promise<ApplicationId | null> {
  const slot = ApplicationSlot.of(target);
  if (slot === null) return null;
  const found = await ctx.applicationRepository.findActiveBySlot(slot);
  return found?.id ?? null;
}

/**
 * `SubmissionFindings` for `target`: its premises evaluated on `facts`,
 * the targets that must be viewable and are not (each must be judged in
 * `viewability`), and the active duplicate read now.
 */
export async function readSubmissionFindings<T extends ApplicationTarget>(
  ctx: Pick<FactContext, "applicationRepository">,
  target: T,
  facts: FactsFor<SpecOfTarget<ApplicationKindMap, T>>,
  viewability: Viewability,
): Promise<SubmissionFindings> {
  const unviewable = SubmissionScope.targets(target).filter((ref) => {
    const viewable = viewability.get(ContentRef.key(ref));
    if (viewable === undefined) {
      throw new Error(`Viewability of ${ContentRef.key(ref)} was not judged`);
    }
    return !viewable;
  });
  return {
    premise: Premise.evaluate(target, facts),
    unviewable,
    activeDuplicate: await readActiveDuplicate(ctx, target),
  };
}
