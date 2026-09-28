import {
  Application,
  ApplicationCase,
  type ApplicationOf,
  type ApplicationTarget,
  ApplicationTarget as Targets,
} from "@repo/core/domain/application/application";
import { ApplicationErrorCode } from "@repo/core/domain/application/errorCode";
import type { StewardshipClaim } from "@repo/core/domain/application/stewardshipClaim";
import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import type { ApplicationId, PhotoId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { BusinessRuleError } from "@repo/core/domain/error";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import type { ListingContent } from "@repo/core/domain/listing/content";
import { ListingPatch } from "@repo/core/domain/listing/patch";
import { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import type { PlaceProfile } from "@repo/core/domain/place/profile";
import {
  PlaceRevision,
  type PlaceState,
} from "@repo/core/domain/place/revision";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import { readPhotos } from "../listing/photos";
import {
  duplicatePhotos,
  type PhotoDuplicates,
} from "../media/duplicatePhotos";
import { displayRefsOf, type PhotoView, photoView } from "../place/photos";
import type { ActorServiceArgs } from "../types";
import { requireHandledBy } from "./applicant";
import { requireApplication } from "./review";

export type PrepareReapplicationInput = Readonly<{
  applicationId: ApplicationId;
}>;

/**
 * The initial content of a reapplication, per kind, in the shape its
 * submission's input starts from: a revision's desired state is the
 * target's present content with the ended application's items laid over
 * it (`FieldPatch.preview`); photos are the duplicates; a listing's
 * category is resolved to an active one. S3B adds the affiliation and
 * leave (no content) and the participation (with what was left out).
 */
export type ReapplicationContent =
  | Readonly<{ kind: "registration"; profile: PlaceProfile }>
  | Readonly<{ kind: "revision"; desired: PlaceState }>
  | Readonly<{ kind: "stewardship"; claim: StewardshipClaim }>
  | Readonly<{ kind: "listing"; content: ListingContent }>
  | Readonly<{ kind: "listingRevision"; desired: ListingContent }>;

export type Reapplication = Readonly<{
  /**
   * The target to reapply for: the ended application's, except that a
   * claim filed with a registration is rebuilt by
   * `ApplicationTarget.companion` (an ordinary claim once the
   * registration is approved).
   */
  target: ApplicationTarget;
  content: ReapplicationContent;
  /** The initial content's photos, in order, with their display refs. */
  photos: readonly PhotoView[];
}>;

type Initial = Readonly<{
  target: ApplicationTarget;
  content: ReapplicationContent;
}>;

const categoryResolved = (
  catalog: CategoryCatalog,
  content: ListingContent,
): ListingContent => ({
  ...content,
  categoryId:
    CategoryCatalog.resolveOrNull(catalog, content.categoryId)?.id ??
    content.categoryId,
});

/** The initial content before its photos are duplicated. */
async function initialOf(
  ctx: UnitOfWorkContext,
  app: ApplicationOf<ApplicationTarget["kind"]>,
  actor: ActorServiceArgs<unknown>["actor"],
): Promise<Initial> {
  switch (app.target.kind) {
    case "registration": {
      const registration = app as ApplicationOf<"registration">;
      return {
        target: registration.target,
        content: { kind: "registration", profile: registration.content },
      };
    }
    case "revision": {
      const revision = app as ApplicationOf<"revision">;
      const place = await ctx.placeRepository.findById(revision.target.placeId);
      if (place === null) throw new Error("A revised place exists");
      const current: PlaceState = {
        profile: place.entity.profile,
        operatingStatus: place.entity.operatingStatus,
      };
      return {
        target: revision.target,
        content: {
          kind: "revision",
          desired: PlaceRevision.preview(current, revision.content),
        },
      };
    }
    case "stewardship": {
      const claim = app as ApplicationOf<"stewardship">;
      const { registrationId } = claim.target;
      const registration =
        registrationId === null
          ? null
          : await ctx.applicationRepository.findById(registrationId);
      const target =
        registration === null ||
        registration.entity.target.kind !== "registration"
          ? claim.target
          : (Targets.companion(
              registration.entity as ApplicationOf<"registration">,
              actor.accountId,
            ) ?? claim.target);
      return {
        target,
        content: { kind: "stewardship", claim: claim.content },
      };
    }
    case "listing": {
      const listing = app as ApplicationOf<"listing">;
      const catalog = (await ctx.categoryCatalogRepository.find()).entity;
      return {
        target: listing.target,
        content: {
          kind: "listing",
          content: categoryResolved(catalog, listing.content),
        },
      };
    }
    case "listingRevision": {
      const revision = app as ApplicationOf<"listingRevision">;
      const listing = await ctx.listingRepository.findById(
        revision.target.listingId,
      );
      if (listing === null) {
        throw new BusinessRuleError(
          ApplicationErrorCode.ListingNotFound,
          "The listing the revision was for has been deleted",
        );
      }
      const catalog = (await ctx.categoryCatalogRepository.find()).entity;
      return {
        target: revision.target,
        content: {
          kind: "listingRevision",
          desired: categoryResolved(
            catalog,
            FieldPatch.preview(
              ListingPatch.schema,
              listing.entity.content,
              revision.content,
            ),
          ),
        },
      };
    }
  }
}

const swapPlacePhotos = (
  profile: PlaceProfile,
  duplicates: PhotoDuplicates,
): PlaceProfile => ({
  ...profile,
  photos: PhotoSet.of(
    profile.photos.items.map((item) => ({
      photoId: duplicates.get(item.photoId) ?? item.photoId,
    })),
    "PLACE",
  ),
});

const swapListingPhotos = (
  content: ListingContent,
  duplicates: PhotoDuplicates,
): ListingContent => ({
  ...content,
  photos: PhotoSet.of(
    content.photos.items.map((item) => ({
      ...item,
      photoId: duplicates.get(item.photoId) ?? item.photoId,
    })),
    "LISTING",
  ),
});

function withDuplicates(
  content: ReapplicationContent,
  duplicates: PhotoDuplicates,
): ReapplicationContent {
  switch (content.kind) {
    case "registration":
      return {
        ...content,
        profile: swapPlacePhotos(content.profile, duplicates),
      };
    case "revision":
      return {
        ...content,
        desired: {
          ...content.desired,
          profile: swapPlacePhotos(content.desired.profile, duplicates),
        },
      };
    case "stewardship":
      return content;
    case "listing":
      return {
        ...content,
        content: swapListingPhotos(content.content, duplicates),
      };
    case "listingRevision":
      return {
        ...content,
        desired: swapListingPhotos(content.desired, duplicates),
      };
  }
}

function photoIdsOf(content: ReapplicationContent): readonly PhotoId[] {
  switch (content.kind) {
    case "registration":
      return PhotoSet.photoIds(content.profile.photos);
    case "revision":
      return PhotoSet.photoIds(content.desired.profile.photos);
    case "stewardship":
      return [];
    case "listing":
      return PhotoSet.photoIds(content.content.photos);
    case "listingRevision":
      return PhotoSet.photoIds(content.desired.photos);
  }
}

/**
 * Starts a reapplication from an application that ended rejected,
 * withdrawn or lapsed (APP-04; `spec/usecases/application.md`
 * 「prepareReapplication」): the initial content of the new application's
 * input. The photos the ended application owns
 * (`ApplicationCase.ownedPhotoIds`) are duplicated through Media's
 * `duplicatePhotos` — registered by the actor, the source's consent kept,
 * stored and ownerless until the reapplication's submission claims them —
 * and the content refers to the duplicates. Each call duplicates anew;
 * unused duplicates are swept. The ended application, its photos and
 * their owner do not change, and no application is created: the
 * eligibility check and the submission judge the reapplication.
 *
 * Two units of work around the duplication (a read, then the duplicates'
 * `markStored`); display refs are read after them.
 *
 * Checks, in order: the application (`NotFoundError`), the applicant
 * (`ForbiddenError`), the status (`requireClosed`'s codes), a revised
 * listing that has been deleted (`APPLICATION_LISTING_NOT_FOUND`). None
 * duplicates a photo.
 */
export async function prepareReapplication({
  container,
  actor,
  input,
}: ActorServiceArgs<PrepareReapplicationInput>): Promise<Reapplication> {
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await requireApplication(ctx, input.applicationId);
    await requireHandledBy(ctx, actor, found.entity);
    const closed = Application.requireClosed(found.entity);
    return {
      initial: await initialOf(ctx, closed, actor),
      owned: ApplicationCase.ownedPhotoIds(closed),
    };
  });
  const duplicates = await duplicatePhotos({
    container,
    actor,
    input: { photoIds: read.owned },
  });
  if (duplicates.size > 0) {
    await container.unitOfWorkProvider.run(async (ctx) => {
      for (const { entity, expectedVersion } of await readPhotos(ctx, [
        ...duplicates.values(),
      ])) {
        if (entity.stage !== "accepted") continue;
        await ctx.photoAssetRepository.save(
          PhotoAsset.markStored(entity),
          expectedVersion,
        );
      }
    });
  }
  const content = withDuplicates(read.initial.content, duplicates);
  const photoIds = photoIdsOf(content);
  const refs = await displayRefsOf(container.photoStorage, photoIds);
  return {
    target: read.initial.target,
    content,
    photos: photoIds.map((id) => photoView(refs, id)),
  };
}
