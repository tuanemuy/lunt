import type { UnitOfWorkProvider } from "@repo/core/application/execution/unitOfWork";
import type { StewardedTargetDirectory } from "@repo/core/domain/authority/ports/stewardedTargetDirectory";
import type { PlaceRef } from "@repo/core/domain/authority/stewardship";
import { RegionId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { occasionFactory } from "@repo/core/domain/occasion/testing/samples";
import { Place } from "@repo/core/domain/place/place";
import { Region } from "@repo/core/domain/region/region";
import { describe, expect, it } from "vitest";
import { expectBusinessRuleError } from "./assertions";
import { authorityIds } from "./authorityFixtures";
import { newPlace, PLACE_T0 } from "./placeFixtures";
import {
  emptyRegionContent,
  newRegion,
  REGION_T0,
  regionContent,
  regionIds,
  updateRegion,
} from "./regionFixtures";

/**
 * Places, regions and occasions are stored through their repositories and
 * read by the object's own lookups (`STEWARDED_TARGET_LOOKUPS`).
 */
export type SeedTarget = Readonly<{
  target: StewardedRef;
  name: string | null;
}>;

export type DirectoryHarness = Readonly<{
  directory: StewardedTargetDirectory;
  /** The store's unit of work: every target is inserted through it. */
  uow: UnitOfWorkProvider;
}>;

type OccasionRef = Extract<StewardedRef, { kind: "occasion" }>;

type OccasionState = "draft" | "published" | "unpublished";

/**
 * Inserts the occasion `ref` named `name` (`null`: an unnamed draft) in
 * `state` through `OccasionRepository`, one unit of work.
 */
async function storeOccasion(
  h: DirectoryHarness,
  ref: OccasionRef,
  name: string | null,
  state: OccasionState = "draft",
): Promise<void> {
  const f = occasionFactory();
  const draft =
    name === null
      ? f.bareDraft({}, f.tick(), ref.id)
      : f.draft({ name }, f.tick(), ref.id);
  const published = () => Occasion.publish(draft, f.tick()).entity;
  const occasion: Occasion =
    state === "draft"
      ? draft
      : state === "published"
        ? published()
        : Occasion.unpublish(published(), f.tick()).entity;
  await h.uow.run(({ occasionRepository }) =>
    occasionRepository.insert(occasion),
  );
}

const named = (target: StewardedRef, name: string | null): SeedTarget => ({
  target,
  name,
});

/** Inserts a place named `name` for each ref, one unit of work each. */
async function storePlaces(
  h: DirectoryHarness,
  places: readonly Readonly<{ ref: PlaceRef; name: string }>[],
  options: Readonly<{ suspended?: boolean }> = {},
): Promise<void> {
  for (const { ref, name } of places) {
    const registered = newPlace(ref.id, { name });
    await h.uow.run(({ placeRepository }) =>
      placeRepository.insert(
        options.suspended
          ? Place.suspend(registered, PLACE_T0).entity
          : registered,
      ),
    );
  }
}

type RegionRef = Extract<StewardedRef, { kind: "region" }>;

type RegionState = "draft" | "published" | "suspended";

/** The region `ref` named `name` (`null`: unnamed draft) in `state`. */
function regionOf(
  ref: RegionRef,
  name: string | null,
  state: RegionState = "draft",
): Region {
  if (name === null) return newRegion(ref.id, emptyRegionContent());
  const published = Region.publish(
    newRegion(ref.id, regionContent({ name, photoIds: [regionIds().photo()] })),
    REGION_T0,
  ).entity;
  switch (state) {
    case "draft":
      return newRegion(ref.id, regionContent({ name }));
    case "published":
      return published;
    case "suspended":
      return Region.suspend(published, REGION_T0).entity;
  }
}

/** Inserts the region through `RegionRepository`, one unit of work. */
async function storeRegion(
  h: DirectoryHarness,
  ref: RegionRef,
  name: string | null,
  state: RegionState = "draft",
): Promise<void> {
  const region = regionOf(ref, name, state);
  await h.uow.run(({ regionRepository }) => regionRepository.insert(region));
}

/** `spec/testcases/ports/stewardedTargetDirectory.md`. */
export function describeStewardedTargetDirectoryContract(
  makeHarness: () => Promise<DirectoryHarness>,
): void {
  describe("StewardedTargetDirectory contract", () => {
    describe("describe", () => {
      it("stewardedTargetDirectory#1 店舗 P1、公開中の地域 R1、公開中のイベント O1 が保存されている / describe([O1, R1, P1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [P1, R1, O1] = [ids.place(), ids.region(), ids.occasion()];
        await storePlaces(h, [{ ref: P1, name: "喫茶ルント" }]);
        await storeRegion(h, R1, "谷中", "published");
        await storeOccasion(h, O1, "夏祭り", "published");
        expect(await h.directory.describe([O1, R1, P1])).toEqual([
          named(P1, "喫茶ルント"),
          named(R1, "谷中"),
          named(O1, "夏祭り"),
        ]);
      });

      it("stewardedTargetDirectory#2 店舗 P2、P1 が保存されている / describe([P2, P1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [P1, P2] = [ids.place(), ids.place()];
        await storePlaces(h, [
          { ref: P2, name: "二号店" },
          { ref: P1, name: "一号店" },
        ]);
        expect(await h.directory.describe([P2, P1])).toEqual([
          named(P1, "一号店"),
          named(P2, "二号店"),
        ]);
      });

      it("stewardedTargetDirectory#3 店舗 P1 が保存されている。P2 は保存されていない / describe([P1, P2])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [P1, P2] = [ids.place(), ids.place()];
        await storePlaces(h, [{ ref: P1, name: "一号店" }]);
        expect(await h.directory.describe([P1, P2])).toEqual([
          named(P1, "一号店"),
        ]);
      });

      it("stewardedTargetDirectory#4 店舗 P1 が保存されている / kind が region で、id の文字列が P1 と同じ StewardedRef で describe", async () => {
        const h = await makeHarness();
        const P1 = authorityIds().place();
        await storePlaces(h, [{ ref: P1, name: "一号店" }]);
        expect(
          await h.directory.describe([
            { kind: "region", id: RegionId.create(P1.id) },
          ]),
        ).toEqual([]);
      });

      it("stewardedTargetDirectory#5 名称を持つ下書きの地域 R1 が保存されている / describe([R1])", async () => {
        const h = await makeHarness();
        const R1 = authorityIds().region();
        await storeRegion(h, R1, "下書きの地域");
        expect(await h.directory.describe([R1])).toEqual([
          named(R1, "下書きの地域"),
        ]);
      });

      it("stewardedTargetDirectory#6 名称が未入力の下書きの地域 R1 と、名称が未入力の下書きのイベント O1 が保存されている / describe([R1, O1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [R1, O1] = [ids.region(), ids.occasion()];
        await storeRegion(h, R1, null);
        await storeOccasion(h, O1, null);
        expect(await h.directory.describe([R1, O1])).toEqual([
          named(R1, null),
          named(O1, null),
        ]);
      });

      it("stewardedTargetDirectory#7 運営による非公開の店舗 P1、運営による非公開の地域 R1、公開を取り下げたイベント O1 が保存されている / describe([P1, R1, O1])", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [P1, R1, O1] = [ids.place(), ids.region(), ids.occasion()];
        await storePlaces(h, [{ ref: P1, name: "非公開の店舗" }], {
          suspended: true,
        });
        await storeRegion(h, R1, "非公開の地域", "suspended");
        await storeOccasion(h, O1, "取り下げたイベント", "unpublished");
        expect(await h.directory.describe([P1, R1, O1])).toEqual([
          named(P1, "非公開の店舗"),
          named(R1, "非公開の地域"),
          named(O1, "取り下げたイベント"),
        ]);
      });

      it("stewardedTargetDirectory#8 店舗 P1 が保存されている / describe([])", async () => {
        const h = await makeHarness();
        await storePlaces(h, [{ ref: authorityIds().place(), name: "一号店" }]);
        expect(await h.directory.describe([])).toEqual([]);
      });

      it("stewardedTargetDirectory#9 100件の店舗が保存されている / 100件の対象で describe", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const places = Array.from({ length: 100 }, (_, i) => ({
          ref: ids.place(),
          name: `店舗${i}`,
        }));
        const registered = places.map(({ ref, name }) =>
          newPlace(ref.id, { name }),
        );
        await h.uow.run(async ({ placeRepository }) => {
          for (const place of registered) await placeRepository.insert(place);
        });
        expect(
          await h.directory.describe(
            [...places].reverse().map((place) => place.ref),
          ),
        ).toEqual(places.map(({ ref, name }) => named(ref, name)));
      });

      it("stewardedTargetDirectory#10 店舗 P1 が保存されている / 101件の対象で describe", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const P1 = ids.place();
        await storePlaces(h, [{ ref: P1, name: "一号店" }]);
        await expectBusinessRuleError(
          h.directory.describe([
            P1,
            ...Array.from({ length: 100 }, () => ids.place()),
          ]),
          "COMMON_INVALID_INPUT",
        );
      });
    });

    describe("可視性", () => {
      it("stewardedTargetDirectory#11 空 / UnitOfWork の中で地域 R1 を insert してコミットし、直後に describe([R1])", async () => {
        const h = await makeHarness();
        const R1 = authorityIds().region();
        await storeRegion(h, R1, "谷中");
        expect(await h.directory.describe([R1])).toEqual([named(R1, "谷中")]);
      });

      it("stewardedTargetDirectory#12 地域 R1 が保存されている / UnitOfWork の中で R1 の名称を変えて save してコミットし、直後に describe([R1])", async () => {
        const h = await makeHarness();
        const R1 = authorityIds().region();
        await storeRegion(h, R1, "谷中");
        await updateRegion(
          h,
          R1.id,
          (region) =>
            Region.updateContent(
              region,
              regionContent({ name: "根津" }),
              REGION_T0,
            ).entity,
        );
        expect(await h.directory.describe([R1])).toEqual([named(R1, "根津")]);
      });

      it("stewardedTargetDirectory#13 空 / UnitOfWork の中で地域 R1 を insert し、fn が例外を投げた後、describe([R1])", async () => {
        const h = await makeHarness();
        const R1 = authorityIds().region();
        await expect(
          h.uow.run(async ({ regionRepository }) => {
            await regionRepository.insert(regionOf(R1, "谷中"));
            throw new Error("abort");
          }),
        ).rejects.toThrow("abort");
        expect(await h.directory.describe([R1])).toEqual([]);
      });

      it("shows a place committed through a unit of work, its new name after a save, and nothing after a rollback", async () => {
        const h = await makeHarness();
        const ids = authorityIds();
        const [P1, P2] = [ids.place(), ids.place()];
        await storePlaces(h, [{ ref: P1, name: "一号店" }]);
        expect(await h.directory.describe([P1])).toEqual([named(P1, "一号店")]);

        await h.uow.run(async ({ placeRepository }) => {
          const read = await placeRepository.findById(P1.id);
          if (read === null) throw new Error("P1 missing");
          await placeRepository.save(
            Place.updateProfile(
              read.entity,
              newPlace(P1.id, { name: "改名した店" }).profile,
              PLACE_T0,
            ).entity,
            read.expectedVersion,
          );
        });
        expect(await h.directory.describe([P1])).toEqual([
          named(P1, "改名した店"),
        ]);

        await expect(
          h.uow.run(async ({ placeRepository }) => {
            await placeRepository.insert(newPlace(P2.id, { name: "二号店" }));
            throw new Error("abort");
          }),
        ).rejects.toThrow("abort");
        expect(await h.directory.describe([P2])).toEqual([]);
      });
    });
  });
}
