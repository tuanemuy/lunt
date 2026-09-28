import {
  InfoReportId,
  type ListingId,
  PhotoId,
  PlaceId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import { Place } from "@repo/core/domain/place/place";
import { sampleProfile } from "@repo/core/domain/place/testing/samples";
import type { Person } from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { listingKit } from "../../listing/__tests__/kit";
import type { GeneratedId } from "../../ports/idGenerator";
import { getConfirmationRequest } from "../getConfirmationRequest";
import { getInfoReport } from "../getInfoReport";
import { getTakedownClaim } from "../getTakedownClaim";
import { listConfirmationRequestsForPlace } from "../listConfirmationRequestsForPlace";
import { listOpenTakedownClaims } from "../listOpenTakedownClaims";
import { listUnresolvedInfoReports } from "../listUnresolvedInfoReports";
import { requestInfoReportConfirmation } from "../requestInfoReportConfirmation";
import { resolveInfoReport } from "../resolveInfoReport";
import { resolveTakedownClaim } from "../resolveTakedownClaim";
import {
  type SubmitInfoReportInput,
  submitInfoReport,
} from "../submitInfoReport";
import {
  type SubmitTakedownClaimInput,
  submitTakedownClaim,
} from "../submitTakedownClaim";
import { takeDownPhotosByClaim } from "../takeDownPhotosByClaim";

export type ClaimSpec = Partial<Omit<SubmitTakedownClaimInput, "target">> &
  Readonly<{ target: ContentRef }>;

export type ReportSpec = Partial<Omit<SubmitInfoReportInput, "target">> &
  Readonly<{ target: SubmitInfoReportInput["target"] }>;

const ALL = { page: 1, limit: 100 } as const;

/**
 * Usecase-test kit for Moderation: Listing's kit (people, stewards,
 * operators, real places and listings with registered photos) plus the
 * Moderation usecases bound to its container. Claims and reports are made
 * through the usecases.
 */
export async function moderationKit() {
  const k = await listingKit();
  const { container } = k;

  /** A place stored with `photos` fresh (unregistered) photo ids. */
  async function placeWithPhotos(
    photos: number,
    name = "店舗",
  ): Promise<Readonly<{ id: PlaceId; photos: readonly PhotoId[] }>> {
    const id = PlaceId.create(k.newId());
    const photoIds = Array.from({ length: photos }, () =>
      PhotoId.create(k.newId()),
    );
    const { entity } = Place.register(
      { id, profile: sampleProfile({ name, photoIds }) },
      k.clock.now(),
    );
    await k.run(({ placeRepository }) => placeRepository.insert(entity));
    return { id, photos: photoIds };
  }

  async function storedPlace(id: PlaceId) {
    const found = await k.run(({ placeRepository }) =>
      placeRepository.findById(id),
    );
    if (found === null) throw new Error(`no place ${id}`);
    return found;
  }

  /** Writes a change of the place straight through the repository. */
  async function changePlace(
    id: PlaceId,
    fn: (place: Place, now: Date) => Place,
  ): Promise<Place> {
    const read = await storedPlace(id);
    const next = fn(read.entity, k.tick());
    await k.run(({ placeRepository }) =>
      placeRepository.save(next, read.expectedVersion),
    );
    return next;
  }

  /** A published listing of `placeId` with `photos` registered photos. */
  async function listingWithPhotos(
    who: Person,
    placeId: PlaceId,
    photos: number,
    name = "掲載",
  ): Promise<Readonly<{ id: ListingId; photos: readonly PhotoId[] }>> {
    const ids = await k.photos(who, photos);
    const view = await k.published(who, placeId, { name, photos: ids });
    return { id: view.id, photos: ids };
  }

  const claimInput = (spec: ClaimSpec): SubmitTakedownClaimInput => {
    const photoIds = spec.photoIds ?? [];
    return {
      claimId: spec.claimId ?? k.newId(),
      standing:
        spec.standing ??
        (photoIds.length > 0 ? "photoRightsHolder" : "proprietor"),
      target: spec.target,
      photoIds,
      reason: spec.reason ?? "無断で掲載されています",
      email: spec.email ?? "claimant@example.com",
    };
  };

  const submitClaim = (spec: ClaimSpec, over: RequestContainer = container) =>
    submitTakedownClaim({ container: over, input: claimInput(spec) });

  /** Submits a claim; returns its id. */
  async function claim(spec: ClaimSpec): Promise<TakedownClaimId> {
    const input = claimInput(spec);
    await submitTakedownClaim({ container, input });
    return TakedownClaimId.create(input.claimId);
  }

  async function storedClaim(id: TakedownClaimId) {
    const found = await k.run(({ takedownClaimRepository }) =>
      takedownClaimRepository.findById(id),
    );
    if (found === null) throw new Error(`no claim ${id}`);
    return found;
  }

  const findClaim = (id: TakedownClaimId) =>
    k.run(({ takedownClaimRepository }) =>
      takedownClaimRepository.findById(id),
    );

  const openClaims = (who: Person, over: RequestContainer = container) =>
    listOpenTakedownClaims({
      container: over,
      actor: who.actor,
      input: { pagination: ALL },
    });

  const readClaim = (who: Person, claimId: TakedownClaimId) =>
    getTakedownClaim({ container, actor: who.actor, input: { claimId } });

  const takeDown = (
    who: Person,
    claimId: TakedownClaimId,
    target: ContentRef,
    photoIds: readonly [PhotoId, ...PhotoId[]],
    over: RequestContainer = container,
  ) =>
    takeDownPhotosByClaim({
      container: over,
      actor: who.actor,
      input: { claimId, target, photoIds },
    });

  const resolveClaim = (
    who: Person,
    claimId: TakedownClaimId,
    outcome = "写真を削除しました",
    over: RequestContainer = container,
  ) =>
    resolveTakedownClaim({
      container: over,
      actor: who.actor,
      input: { claimId, outcome },
    });

  const reportInput = (spec: ReportSpec): SubmitInfoReportInput => ({
    reportId: spec.reportId ?? k.newId(),
    target: spec.target,
    category: spec.category ?? "incorrectInfo",
    content: spec.content ?? "営業時間が違います",
  });

  const submitReport = (who: Person | null, spec: ReportSpec) =>
    submitInfoReport({
      container,
      actor: who?.actor ?? null,
      input: reportInput(spec),
    });

  /** Submits a report as `who`; returns its id. */
  async function report(who: Person, spec: ReportSpec): Promise<InfoReportId> {
    const input = reportInput(spec);
    await submitInfoReport({ container, actor: who.actor, input });
    return InfoReportId.create(input.reportId);
  }

  async function storedReport(id: InfoReportId) {
    const found = await k.run(({ infoReportRepository }) =>
      infoReportRepository.findById(id),
    );
    if (found === null) throw new Error(`no report ${id}`);
    return found;
  }

  const unresolved = (who: Person, over: RequestContainer = container) =>
    listUnresolvedInfoReports({
      container: over,
      actor: who.actor,
      input: { pagination: ALL },
    });

  const readReport = (who: Person, reportId: InfoReportId) =>
    getInfoReport({ container, actor: who.actor, input: { reportId } });

  const request = (
    who: Person,
    reportId: InfoReportId,
    over: RequestContainer = container,
  ) =>
    requestInfoReportConfirmation({
      container: over,
      actor: who.actor,
      input: { reportId },
    });

  const resolveReport = (
    who: Person,
    reportId: InfoReportId,
    over: RequestContainer = container,
  ) =>
    resolveInfoReport({
      container: over,
      actor: who.actor,
      input: { reportId },
    });

  const requestsFor = (who: Person, placeId: PlaceId) =>
    listConfirmationRequestsForPlace({
      container,
      actor: who.actor,
      input: { placeId, pagination: ALL },
    });

  const readRequest = (who: Person, reportId: InfoReportId) =>
    getConfirmationRequest({
      container,
      actor: who.actor,
      input: { reportId },
    });

  /** Every steward of `placeId` among `who` resigns. */
  async function resign(placeId: PlaceId, ...who: readonly Person[]) {
    for (const person of who) await k.removeSteward(k.ref(placeId), person);
  }

  /** An editor without the operator role. */
  async function editor(): Promise<Person> {
    const who = await k.person();
    await k.editors(who);
    return who;
  }

  const newId = (): GeneratedId => k.newId();

  return {
    ...k,
    newId,
    placeWithPhotos,
    storedPlace,
    changePlace,
    listingWithPhotos,
    claimInput,
    submitClaim,
    claim,
    storedClaim,
    findClaim,
    openClaims,
    readClaim,
    takeDown,
    takeDownListing: k.takeDown,
    resolveClaim,
    reportInput,
    submitReport,
    report,
    storedReport,
    unresolved,
    readReport,
    request,
    resolveReport,
    requestsFor,
    readRequest,
    resign,
    editor,
  };
}

export type ModerationKit = Awaited<ReturnType<typeof moderationKit>>;
