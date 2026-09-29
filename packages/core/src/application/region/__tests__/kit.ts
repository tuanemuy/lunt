import {
  type PhotoId,
  type PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { Region, type RegionRef } from "@repo/core/domain/region/region";
import type { Person } from "../../authority/__tests__/kit";
import { placeKit, Towns } from "../../place/__tests__/kit";
import type { RegionContentFields } from "../regions";
import { registerRegion } from "../registerRegion";

/** Every field entered: 谷中, 大手町 1-1, a location, no photos. */
export function contentFields(
  overrides: Partial<RegionContentFields> = {},
): RegionContentFields {
  return {
    name: "谷中",
    address: { town: Towns.otemachi, rest: "1-1" },
    location: { latitude: 35.7266, longitude: 139.7669 },
    photoIds: [],
    description: "下町の路地",
    tagline: "路地を歩く",
    ...overrides,
  };
}

/** Nothing entered. */
export const emptyContentFields = (): RegionContentFields => ({
  name: null,
  address: null,
  location: null,
  photoIds: [],
  description: null,
  tagline: null,
});

export type RegionState =
  | "draft"
  | "published"
  | "unpublished"
  | "photoTakedown";

export type RegionKit = ReturnType<typeof regionKit>;

/**
 * Usecase-test kit for Region: Place's kit (people, roles, stewardships,
 * places and photos over the production-shaped test container) plus
 * regions registered through `registerRegion` by a setup operator and
 * moved to other states straight through the repository (no events),
 * and affiliations written straight through `PlaceAffiliationsRepository`
 * (their approval is Application's, stage 3b).
 */
export function regionKit() {
  const k = placeKit();
  const { container } = k;

  const regionRef = (id: RegionId): RegionRef => ({ kind: "region", id });

  async function findRegion(id: RegionId): Promise<Versioned<Region> | null> {
    return container.unitOfWorkProvider.run(({ regionRepository }) =>
      regionRepository.findById(id),
    );
  }

  async function getRegion(id: RegionId): Promise<Region> {
    const found = await findRegion(id);
    if (found === null) throw new Error(`no region ${id}`);
    return found.entity;
  }

  /** Writes `change(region)` straight through the repository (no events). */
  async function writeRegion(
    id: RegionId,
    change: (region: Region) => Region,
  ): Promise<Region> {
    return container.unitOfWorkProvider.run(async ({ regionRepository }) => {
      const read = await regionRepository.findById(id);
      if (read === null) throw new Error(`no region ${id}`);
      const next = change(read.entity);
      await regionRepository.save(next, read.expectedVersion);
      return next;
    });
  }

  /**
   * A region registered by the setup operator, then brought to `state`.
   * A published / unpublished region gets one photo of the setup operator
   * unless `content.photoIds` says otherwise; `photoTakedown` takes all its
   * photos down.
   */
  async function region(
    content: Partial<RegionContentFields> = {},
    state: RegionState = "draft",
    options: Readonly<{ suspended?: boolean }> = {},
  ): Promise<Region> {
    const by = await k.setupOperator();
    const photoIds =
      content.photoIds ?? (state === "draft" ? [] : [await k.photo(by)]);
    const { region: registered } = await registerRegion({
      container,
      actor: by.actor,
      input: {
        regionId: k.newPlaceId(),
        content: contentFields({ ...content, photoIds }),
      },
    });
    let stored = registered;
    if (state !== "draft") {
      stored = await writeRegion(
        stored.id,
        (r) => Region.publish(r, k.tick()).entity,
      );
    }
    if (state === "unpublished") {
      stored = await writeRegion(
        stored.id,
        (r) => Region.unpublish(r, k.tick()).entity,
      );
    }
    if (options.suspended) {
      stored = await writeRegion(
        stored.id,
        (r) => Region.suspend(r, k.tick()).entity,
      );
    }
    if (state === "photoTakedown") {
      const [first, ...rest] = stored.content.photos.items.map(
        (p) => p.photoId,
      );
      if (first === undefined) throw new Error("no photo to take down");
      stored = await takeDown(stored.id, [first, ...rest]);
    }
    return stored;
  }

  /** `Region.takeDownPhotos` straight through the repository (no events). */
  const takeDown = (id: RegionId, photoIds: readonly [PhotoId, ...PhotoId[]]) =>
    writeRegion(id, (r) => Region.takeDownPhotos(r, photoIds, k.tick()).entity);

  const suspendRegion = (id: RegionId) =>
    writeRegion(id, (r) => Region.suspend(r, k.tick()).entity);

  /** A region steward `who` of `id` (appointed straight through the repository). */
  async function steward(
    id: RegionId,
    label = "region-steward",
  ): Promise<Person> {
    const who = await k.person(label);
    await k.appoint(regionRef(id), who);
    return who;
  }

  async function findAffiliations(
    placeId: PlaceId,
  ): Promise<Versioned<PlaceAffiliations> | null> {
    return container.unitOfWorkProvider.run(({ placeAffiliationsRepository }) =>
      placeAffiliationsRepository.findById(placeId),
    );
  }

  /** Writes `change(current)` (empty when none is stored) straight through the repository. */
  async function writeAffiliations(
    placeId: PlaceId,
    change: (a: PlaceAffiliations) => PlaceAffiliations,
  ): Promise<PlaceAffiliations> {
    return container.unitOfWorkProvider.run(
      async ({ placeAffiliationsRepository }) => {
        const read = await placeAffiliationsRepository.findById(placeId);
        const next = change(
          read?.entity ?? PlaceAffiliations.empty(placeId, k.tick()),
        );
        if (read === null) await placeAffiliationsRepository.insert(next);
        else await placeAffiliationsRepository.save(next, read.expectedVersion);
        return next;
      },
    );
  }

  /** Affiliates the place with each region in order, one tick apart. */
  const affiliate = (placeId: PlaceId, ...regionIds: readonly RegionId[]) =>
    writeAffiliations(placeId, (a) =>
      regionIds.reduce(
        (acc, regionId) =>
          PlaceAffiliations.affiliate(acc, regionId, k.tick()).entity,
        a,
      ),
    );

  const choose = (placeId: PlaceId, regionId: RegionId) =>
    writeAffiliations(
      placeId,
      (a) =>
        PlaceAffiliations.chooseRepresentative(a, regionId, k.tick()).entity,
    );

  const exclude = (placeId: PlaceId, regionId: RegionId) =>
    writeAffiliations(
      placeId,
      (a) => PlaceAffiliations.exclude(a, regionId, k.tick()).entity,
    );

  /** An id no region has. */
  const absentRegionId = (): RegionId => RegionId.create(k.newPlaceId());

  return {
    ...k,
    regionRef,
    findRegion,
    getRegion,
    writeRegion,
    region,
    takeDown,
    suspendRegion,
    steward,
    findAffiliations,
    writeAffiliations,
    affiliate,
    choose,
    exclude,
    absentRegionId,
  };
}
