import type { TownRef } from "@repo/core/domain/area/townRef";
import {
  type AccessBasis,
  AccessPolicy,
} from "@repo/core/domain/authority/accessPolicy";
import type { Actor } from "@repo/core/domain/common/actor";
import type { Address } from "@repo/core/domain/common/address";
import type { WithEventDrafts } from "@repo/core/domain/common/event";
import { GeoPoint } from "@repo/core/domain/common/geo";
import type { OccasionId, PhotoId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import type { Publication } from "@repo/core/domain/common/publication";
import type { Tagline } from "@repo/core/domain/common/tagline";
import type { Version } from "@repo/core/domain/common/version";
import { VisibilityPolicy } from "@repo/core/domain/discovery/visibilityPolicy";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import {
  OccasionContent,
  type OccasionRequirement,
} from "@repo/core/domain/occasion/content";
import type { HoldingStatus } from "@repo/core/domain/occasion/holdingStatus";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import type {
  OccasionDescription,
  OccasionName,
} from "@repo/core/domain/occasion/values";
import { resolveAddress } from "../area/resolveAddress";
import {
  authorizeOnTarget,
  authorizeRole,
  readTargetAccess,
  type TargetAccess,
} from "../authority/access";
import type { RequestContainer } from "../di/types";
import { NotFoundError } from "../errors";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import { displayRefsOf } from "../place/photos";

export type OccasionRef = Readonly<{ kind: "occasion"; id: OccasionId }>;

export const occasionRef = (id: OccasionId): OccasionRef => ({
  kind: "occasion",
  id,
});

/** The occasion does not exist. */
export const OCCASION_NOT_FOUND = "OCCASION_NOT_FOUND";

/** `NotFoundError` unless the occasion exists. */
export async function requireOccasion(
  ctx: Pick<UnitOfWorkContext, "occasionRepository">,
  id: OccasionId,
) {
  const found = await ctx.occasionRepository.findById(id);
  if (found === null) {
    throw new NotFoundError(OCCASION_NOT_FOUND, "The occasion does not exist");
  }
  return found;
}

/**
 * An occasion's content as entered (`registerOccasion`,
 * `updateOccasionContent`). Every field may be empty; blank strings mean
 * "not entered". The address is the picked town plus the part after it.
 */
export type OccasionContentFields = Readonly<{
  name: string | null;
  /** Days as `YYYY-MM-DD`, inclusive. */
  period: Readonly<{ start: string; end: string }> | null;
  address: Readonly<{ town: TownRef; rest: string }> | null;
  location: Readonly<{ latitude: number; longitude: number }> | null;
  /** Display order; the first is the cover. */
  photoIds: readonly PhotoId[];
  description: string | null;
  tagline: string | null;
}>;

/**
 * Resolves the town (`AREA_TOWN_NOT_FOUND`) and builds the content's value
 * objects (`OCCASION_INVALID_NAME`, `COMMON_INVALID_DATE_RANGE`,
 * `COMMON_INVALID_LOCAL_DATE`, `COMMON_INVALID_GEO_POINT`,
 * `COMMON_INVALID_TAGLINE`, `OCCASION_DUPLICATE_PHOTO`, …). Called before
 * the unit of work.
 */
export async function buildOccasionContent(
  container: Pick<RequestContainer, "areaCatalog">,
  fields: OccasionContentFields,
): Promise<OccasionContent> {
  const address: Address | null =
    fields.address === null
      ? null
      : await resolveAddress(
          container.areaCatalog,
          fields.address.town,
          fields.address.rest,
        );
  return OccasionContent.create({
    name: fields.name,
    period:
      fields.period === null
        ? null
        : {
            start: LocalDate.parse(fields.period.start),
            end: LocalDate.parse(fields.period.end),
          },
    venue: {
      address,
      location:
        fields.location === null
          ? null
          : GeoPoint.create(
              fields.location.latitude,
              fields.location.longitude,
            ),
    },
    photoIds: fields.photoIds,
    description: fields.description,
    tagline: fields.tagline,
  });
}

/** A photo with the ref screens fetch it by (`null` when storage has none). */
export type OccasionPhotoView = Readonly<{
  photoId: PhotoId;
  display: PhotoDisplayRef | null;
}>;

/** Who may do what with the occasion, as the management screens show it. */
export type OccasionAccessView = Readonly<{
  /** Whether the occasion has an occasion operator (イベント運営者). */
  hasSteward: boolean;
  /** Whether the actor may manage it (`manage_target`). */
  manageable: boolean;
  /** `steward` or `absence_proxy` when manageable, `null` otherwise. */
  basis: AccessBasis | null;
}>;

/**
 * One occasion as the management screens show it (`getManagedOccasion`
 * and every write usecase of the occasion's content and states). The
 * publication, suspension, cancellation and holding status are
 * independent; `holdingStatus` is today's (`null` without a period).
 */
export type ManagedOccasionView = Readonly<{
  id: OccasionId;
  /** The version an edit (`updateOccasionContent`) starts from. */
  version: Version;
  updatedAt: Date;
  name: OccasionName | null;
  period: Readonly<{ start: LocalDate; end: LocalDate }> | null;
  address: Address | null;
  location: GeoPoint | null;
  photos: readonly OccasionPhotoView[];
  /** A takedown claim removed photos since the photos were last changed. */
  photosTakenDown: boolean;
  description: OccasionDescription | null;
  tagline: Tagline | null;
  publication: Publication;
  suspended: boolean;
  cancelled: boolean;
  holdingStatus: HoldingStatus | null;
  /** Whether viewers can see it (`VisibilityPolicy.isOccasionViewable`). */
  viewable: boolean;
  /** Publish requirements the content lacks, in requirement order. */
  missingRequirements: readonly OccasionRequirement[];
  access: OccasionAccessView;
}>;

/** What a managed occasion's view is built from, read inside the unit of work. */
export type ManagedOccasionRead = Readonly<{
  occasion: Occasion;
  access: TargetAccess<OccasionRef>;
}>;

export function accessView(
  access: TargetAccess<OccasionRef>,
): OccasionAccessView {
  const decision = AccessPolicy.decide(access.authority, {
    kind: "manage_target",
    standing: access.standing,
  });
  return {
    hasSteward: access.stewardship.status === "stewarded",
    manageable: decision.allowed,
    basis: decision.allowed ? decision.basis : null,
  };
}

/**
 * Builds the managed view of `read.occasion`: today's holding status,
 * viewability, the missing requirements, and `PhotoStorage` display refs
 * asked outside the unit of work.
 */
export async function presentManagedOccasion(
  container: RequestContainer,
  read: ManagedOccasionRead,
): Promise<ManagedOccasionView> {
  const { occasion } = read;
  const { content } = occasion;
  const photoIds = PhotoSet.photoIds(content.photos);
  const refs = await displayRefsOf(container.photoStorage, photoIds);
  const today = LocalDate.fromInstant(container.clock.now());
  return {
    id: occasion.id,
    version: occasion.version,
    updatedAt: occasion.updatedAt,
    name: content.name,
    period:
      content.period === null
        ? null
        : { start: content.period.start, end: content.period.end },
    address: content.venue.address,
    location: content.venue.location,
    photos: photoIds.map((photoId) => ({
      photoId,
      display: refs.get(photoId) ?? null,
    })),
    photosTakenDown: content.photos.takenDown,
    description: content.description,
    tagline: content.tagline,
    publication: occasion.publication,
    suspended: occasion.suspension.suspended,
    cancelled: occasion.cancellation.cancelled,
    holdingStatus: Occasion.holdingStatus(occasion, today),
    viewable: VisibilityPolicy.isOccasionViewable(occasion),
    missingRequirements: Occasion.missingRequirements(content),
    access: accessView(read.access),
  };
}

type Transition = (occasion: Occasion, now: Date) => WithEventDrafts<Occasion>;

/**
 * A state change without a version in the request
 * (`spec/usecases/occasion.md`; index.md 「編集の競合」): checks who may do
 * it and reads the occasion (`NotFoundError` when gone) before any write,
 * applies `transition` (its `BusinessRuleError` when the occasion is
 * already in that state), saves against the version read and stores the
 * events. A concurrent write committed first → `ConflictError`.
 *
 * `by` is `"occasion_operator"` for `manage_target` on the occasion, or
 * `"service_operator"` for `operate_service`.
 */
export async function transitionOccasion(
  container: RequestContainer,
  actor: Actor,
  occasionId: OccasionId,
  by: "occasion_operator" | "service_operator",
  transition: Transition,
): Promise<ManagedOccasionView> {
  const now = container.clock.now();
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const target = occasionRef(occasionId);
    const access =
      by === "occasion_operator"
        ? await authorizeOnTarget(ctx, actor, "manage_target", target)
        : await authorizeRole(ctx, actor, "operate_service").then(() =>
            readTargetAccess(ctx, actor, target),
          );
    const found = await requireOccasion(ctx, occasionId);
    const { entity, eventDrafts } = transition(found.entity, now);
    await ctx.occasionRepository.save(entity, found.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return { occasion: entity, access };
  });
  return presentManagedOccasion(container, read);
}
