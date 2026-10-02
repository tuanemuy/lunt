import { samplePng } from "@repo/core/adapters/shared/testing/photoSamples";
import { TownRef } from "@repo/core/domain/area/townRef";
import {
  CategoryId,
  ListingId,
  PhotoId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import { ListingContent } from "@repo/core/domain/listing/content";
import { Listing } from "@repo/core/domain/listing/listing";
import { CategoryName } from "@repo/core/domain/listing/values";
import type { PhotoAsset } from "@repo/core/domain/media/photoAsset";
import { Place } from "@repo/core/domain/place/place";
import { authorityKit, type Person } from "../../authority/__tests__/kit";
import { registerPhoto } from "../../media/registerPhoto";
import type { PlaceProfileFields } from "../profileInput";
import { registerPlaceByProxy } from "../registerPlaceByProxy";

/** Towns of 「テスト用のマスター」 (`spec/testcases/ports/areaCatalog.md`). */
export const Towns = {
  otemachi: TownRef.create({
    areaCode: "1000004",
    municipalityCode: "13101",
    name: "大手町",
  }),
  chiyoda: TownRef.create({
    areaCode: "1000001",
    municipalityCode: "13101",
    name: "千代田",
  }),
  ginza: TownRef.create({
    areaCode: "1040061",
    municipalityCode: "13102",
    name: "銀座",
  }),
  umeda: TownRef.create({
    areaCode: "5300001",
    municipalityCode: "27127",
    name: "梅田",
  }),
  /** Well-formed but not in the master. */
  missing: TownRef.create({
    areaCode: "1000009",
    municipalityCode: "13101",
    name: "存在しない町",
  }),
};

export function profileFields(
  overrides: Partial<PlaceProfileFields> = {},
): PlaceProfileFields {
  return {
    name: "山田珈琲店",
    photoIds: [],
    description: null,
    town: Towns.otemachi,
    addressRest: "1-1",
    location: { latitude: 35.6848, longitude: 139.7639 },
    businessHours: null,
    contact: null,
    ...overrides,
  };
}

export type PlaceKit = ReturnType<typeof placeKit>;

/**
 * Usecase-test kit for Place: Authority's kit (people, roles,
 * stewardships over the production-shaped test container) plus places
 * registered through `registerPlaceByProxy`, photos through Media's
 * `registerPhoto`, and readers.
 */
export function placeKit() {
  const k = authorityKit();
  const { container, t } = k;
  let photoSeed = 0;
  let operator: Person | null = null;

  /** An operator used only to set places up. */
  async function setupOperator(): Promise<Person> {
    if (operator === null) {
      operator = await k.person("setup-operator");
      await k.operators(operator);
    }
    return operator;
  }

  const newPlaceId = () => t.idGenerator.next();

  /** A stored, unowned photo registered by `who`. */
  async function photo(who: Person): Promise<PhotoId> {
    photoSeed += 1;
    const photoId = t.idGenerator.next();
    await registerPhoto({
      container,
      actor: who.actor,
      input: { photoId, bytes: samplePng(photoSeed), agreed: true },
    });
    return PhotoId.create(photoId);
  }

  /**
   * Registers a place by proxy as the setup operator. Photos, if any, must
   * be the setup operator's (`photoBy`).
   */
  async function place(
    overrides: Partial<PlaceProfileFields> = {},
  ): Promise<Place> {
    const by = await setupOperator();
    return registerPlaceByProxy({
      container,
      actor: by.actor,
      input: { placeId: newPlaceId(), profile: profileFields(overrides) },
    });
  }

  async function findPlace(id: PlaceId): Promise<Versioned<Place> | null> {
    return container.unitOfWorkProvider.run(({ placeRepository }) =>
      placeRepository.findById(id),
    );
  }

  async function getPlace(id: PlaceId): Promise<Place> {
    const found = await findPlace(id);
    if (found === null) throw new Error(`no place ${id}`);
    return found.entity;
  }

  /** Writes `change(place)` straight through the repository (no events). */
  async function writePlace(
    id: PlaceId,
    change: (place: Place) => Place,
  ): Promise<Place> {
    return container.unitOfWorkProvider.run(async ({ placeRepository }) => {
      const read = await placeRepository.findById(id);
      if (read === null) throw new Error(`no place ${id}`);
      const next = change(read.entity);
      await placeRepository.save(next, read.expectedVersion);
      return next;
    });
  }

  const suspend = (id: PlaceId) =>
    writePlace(id, (p) => Place.suspend(p, k.tick()).entity);

  const setStatus = (
    id: PlaceId,
    status: Parameters<typeof Place.changeOperatingStatus>[1],
  ) =>
    writePlace(
      id,
      (p) => Place.changeOperatingStatus(p, status, k.tick()).entity,
    );

  async function findPhoto(id: PhotoId): Promise<PhotoAsset | null> {
    const found = await container.unitOfWorkProvider.run(
      ({ photoAssetRepository }) => photoAssetRepository.findById(id),
    );
    return found?.entity ?? null;
  }

  async function ownerOf(id: PhotoId) {
    const found = await findPhoto(id);
    return found?.stage === "stored" ? found.owner : null;
  }

  let categoryId: CategoryId | null = null;

  /** The one category listings are filed under (establishes the catalog). */
  async function category(): Promise<CategoryId> {
    if (categoryId !== null) return categoryId;
    const id = CategoryId.create(newPlaceId());
    await container.unitOfWorkProvider.run(
      async ({ categoryCatalogRepository }) => {
        const read = await categoryCatalogRepository.find();
        const { entity } = CategoryCatalog.establish(
          read.entity,
          [{ id, name: CategoryName.create("喫茶") }],
          k.tick(),
        );
        await categoryCatalogRepository.save(entity, read.expectedVersion);
      },
    );
    categoryId = id;
    return id;
  }

  /**
   * A listing of `placeId` stored straight through Listing's repository:
   * `published`, a `draft`, or `unpublished` by its manager (一時非公開).
   */
  async function listing(
    placeId: PlaceId,
    state: "published" | "draft" | "unpublished",
    photoId: PhotoId,
  ): Promise<Listing> {
    const categoryOf = await category();
    return container.unitOfWorkProvider.run(
      async ({ categoryCatalogRepository, listingRepository }) => {
        const catalog = (await categoryCatalogRepository.find()).entity;
        const content = ListingContent.create({
          name: "モーニングセット",
          description: null,
          categoryId: categoryOf,
          photos: [{ photoId, framing: null }],
          offering: { kind: "none" },
        });
        const now = k.tick();
        const draft = Listing.createDraft(
          { id: ListingId.create(newPlaceId()), placeId, content },
          catalog,
          now,
        ).entity;
        const stored: Listing =
          state === "draft"
            ? draft
            : state === "published"
              ? Listing.publish(draft, now).entity
              : Listing.unpublish(Listing.publish(draft, now).entity, now)
                  .entity;
        await listingRepository.insert(stored);
        return stored;
      },
    );
  }

  async function findListing(id: ListingId): Promise<Listing | null> {
    const found = await container.unitOfWorkProvider.run(
      ({ listingRepository }) => listingRepository.findById(id),
    );
    return found?.entity ?? null;
  }

  /** An id no place has. */
  const absentPlaceId = (): PlaceId => PlaceId.create(newPlaceId());

  /** An id no photo has. */
  const absentPhotoId = (): PhotoId => PhotoId.create(newPlaceId());

  return {
    ...k,
    setupOperator,
    photo,
    place,
    findPlace,
    getPlace,
    writePlace,
    suspend,
    setStatus,
    findPhoto,
    ownerOf,
    absentPlaceId,
    absentPhotoId,
    listing,
    findListing,
    newPlaceId,
    placeRef: (place: Place) => Place.ref(place),
  };
}
