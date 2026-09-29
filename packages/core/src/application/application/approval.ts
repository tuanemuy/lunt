import {
  Application,
  ApplicationCase,
  type ApplicationKind,
  type ApplicationOf,
  Premise,
} from "@repo/core/domain/application/application";
import type {
  PremiseHolds,
  PremiseKey,
} from "@repo/core/domain/application/premise";
import type { UnderReview } from "@repo/core/domain/application/status";
import type { Actor } from "@repo/core/domain/common/actor";
import type { EventDraft } from "@repo/core/domain/common/event";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type { Version } from "@repo/core/domain/common/version";
import type { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import { PhotoOwnership } from "@repo/core/domain/media/photoOwnership";
import type { RequestContainer } from "../di/types";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import { readPhotos } from "../listing/photos";
import { evaluatePremise } from "./facts";
import {
  applicationNotFound,
  type DecisionStance,
  type ReviewedApplication,
  requireApplication,
  requireDecision,
  reviewed,
  reviewPermission,
} from "./review";

/** What every approval takes (`spec/usecases/application.md` 「承認のユースケースに共通すること」). */
export type ApproveApplicationInput = Readonly<{
  applicationId: ApplicationId;
  /** The version the approver read the application at (CM-01). */
  version: Version;
}>;

/**
 * An approval's outcome. `approved`: the content was reflected on
 * `reflected` (`Application.reflectedRef` — CM-01's entrance to it).
 * `lapsed`: a premise no longer held when the approver approved; the
 * lapse was committed and nothing was reflected (CS-08 with the premises
 * that broke) — not an error.
 */
export type ApprovalOutcome =
  | Readonly<{
      outcome: "approved";
      application: ReviewedApplication;
      reflected: ContentRef;
    }>
  | Readonly<{
      outcome: "lapsed";
      application: ReviewedApplication;
      brokenPremises: readonly [PremiseKey, ...PremiseKey[]];
    }>;

/** The application an approval of kind `K` works on, under review. */
export type Approving<K extends ApplicationKind> = UnderReview<
  ApplicationOf<K>
>;

/** What the kind's reflection hands back to the common approval. */
export type Reflection = Readonly<{
  /** Events of the aggregate the approval wrote (its `eventDrafts`). */
  eventDrafts: readonly EventDraft[];
}>;

function ofKind<K extends ApplicationKind>(
  app: Application,
  kind: K,
): ApplicationOf<K> | null {
  // The kind was checked at run time; its generic cannot follow it.
  return app.target.kind === kind ? (app as ApplicationOf<K>) : null;
}

/**
 * The common approval (`spec/domains/application.md` 「ユースケース（概要）」):
 * inside one unit of work, the application (`NotFoundError` also for
 * another kind), the approver's permission, the status, the stance and
 * the version; then the premise re-read (`Application.reassess`) — a
 * lapse commits alone and is returned. Otherwise every read ends before
 * the first write (`spec/usecases/application.md` 「承認のユースケースに共通
 * すること」): `load` reads the target aggregate, then the application's
 * photos are read; only then does `reflect` write the target, the photos
 * move to the reflected target (`PhotoOwnership.transferAll`), and
 * `Application.approve` commits with the target's events.
 */
export async function approveApplication<K extends ApplicationKind, R>(
  args: Readonly<{
    container: RequestContainer;
    actor: Actor;
    input: ApproveApplicationInput;
    kind: K;
    /** Reads what `reflect` needs; must not write. */
    load: (ctx: UnitOfWorkContext, app: Approving<K>, now: Date) => Promise<R>;
    /** Writes the target aggregate from what `load` read; must not read. */
    reflect: (
      ctx: UnitOfWorkContext,
      app: Approving<K>,
      loaded: R,
      now: Date,
    ) => Promise<Reflection>;
  }>,
): Promise<ApprovalOutcome> {
  const { container, actor, input, kind } = args;
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireApplication(ctx, input.applicationId);
    const typed = ofKind(found.entity, kind);
    if (typed === null) throw applicationNotFound(input.applicationId);
    const permission = await reviewPermission(
      ctx,
      actor,
      typed,
      container.reviewPolicy,
      now,
    );
    const { app, as } = requireDecision(typed, permission, input.version);
    const lapsed = await lapseIfBroken(ctx, app, found.expectedVersion, now);
    if (lapsed.kind === "lapsed") return lapsed.outcome;
    const loaded = await args.load(ctx, app, now);
    const reflected = Application.reflectedRef(app);
    const photos = await readOwnedPhotos(ctx, app);
    const reflection = await args.reflect(ctx, app, loaded, now);
    await transferOwnedPhotos(ctx, app, photos, reflected);
    const approved = approve(app, as, lapsed.premise, now);
    await ctx.applicationRepository.save(
      approved.entity,
      found.expectedVersion,
    );
    ctx.collectEvents([...reflection.eventDrafts, ...approved.eventDrafts]);
    return {
      outcome: "approved",
      application: reviewed(approved.entity),
      reflected,
    };
  });
}

function approve<K extends ApplicationKind>(
  app: Approving<K>,
  as: DecisionStance<ApplicationOf<K>>,
  premise: PremiseHolds,
  now: Date,
) {
  return Application.approve<Approving<K>>(app, as, premise, now);
}

type PremiseCheck =
  | Readonly<{ kind: "holds"; premise: PremiseHolds }>
  | Readonly<{ kind: "lapsed"; outcome: ApprovalOutcome }>;

/**
 * Re-reads the premise facts now; a broken premise lapses the application
 * (saved with `application.lapsed`) instead of approving it.
 */
async function lapseIfBroken(
  ctx: UnitOfWorkContext,
  app: UnderReview<Application>,
  expectedVersion: ExpectedVersion<Application>,
  now: Date,
): Promise<PremiseCheck> {
  const result = await evaluatePremise(ctx, app.target, now);
  if (result.holds) return { kind: "holds", premise: Premise.require(result) };
  const { entity, eventDrafts } = Application.reassess(app, result, now);
  await ctx.applicationRepository.save(entity, expectedVersion);
  ctx.collectEvents(eventDrafts);
  return {
    kind: "lapsed",
    outcome: {
      outcome: "lapsed",
      application: reviewed(entity),
      brokenPremises: result.broken,
    },
  };
}

/** The stored records of every photo the application owns. */
function readOwnedPhotos(
  ctx: UnitOfWorkContext,
  app: Application,
): Promise<readonly Versioned<PhotoAsset>[]> {
  const photoIds = ApplicationCase.ownedPhotoIds(app);
  return photoIds.length === 0
    ? Promise.resolve([])
    : readPhotos(ctx, photoIds);
}

/**
 * Moves every photo the application owns (`read` before any write) to the
 * reflected target (`PhotoOwnership.transferAll`), in the approval's unit
 * of work.
 */
async function transferOwnedPhotos(
  ctx: UnitOfWorkContext,
  app: Application,
  read: readonly Versioned<PhotoAsset>[],
  to: ContentRef,
): Promise<void> {
  const photoIds = ApplicationCase.ownedPhotoIds(app);
  if (photoIds.length === 0) return;
  const versions = new Map(
    read.map(({ entity, expectedVersion }) => [entity.id, expectedVersion]),
  );
  const moved = PhotoOwnership.transferAll(
    read.map(({ entity }) => entity),
    photoIds,
    { kind: "application", id: app.id },
    to,
  );
  for (const photo of moved) {
    const version = versions.get(photo.id);
    if (version === undefined) {
      throw new Error(`Transferred photo ${photo.id} was not read`);
    }
    await ctx.photoAssetRepository.save(photo, version);
  }
}
