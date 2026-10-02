import { regionContent } from "@repo/core/adapters/durableObject/__conformance__/regionFixtures";
import { PhotoId, type PlaceId, RegionId } from "@repo/core/domain/common/ids";
import { PlaceAffiliations } from "@repo/core/domain/region/placeAffiliations";
import { Region } from "@repo/core/domain/region/region";
import type { RequestContainer } from "../../di/types";

export type RegionTieSpec = Readonly<{
  name: string;
  /** `published` by default. */
  state?: "published" | "unpublished" | "draft";
}>;

export type RegionTieDeps = Readonly<{
  container: Pick<RequestContainer, "unitOfWorkProvider">;
  /** A fresh id the container's `IdGenerator` accepts. */
  newId: () => string;
  /** A later instant on every call. */
  tick: () => Date;
}>;

/**
 * For Place / Listing / Application usecase tests: stores regions named by
 * `specs` (one photo each; published unless said otherwise) and affiliates
 * the place with them in that order, choosing `representative` (an index
 * into `specs`; the first is the representative anyway) when given — once
 * per place. Returns the stored regions in
 * `specs` order.
 */
export async function affiliateWithRegions(
  deps: RegionTieDeps,
  placeId: PlaceId,
  specs: readonly RegionTieSpec[],
  representative?: number,
): Promise<readonly Region[]> {
  const regions = specs.map((spec) => {
    const at = deps.tick();
    const draft = Region.register(
      {
        id: RegionId.create(deps.newId()),
        content: regionContent({
          name: spec.name,
          photoIds: [PhotoId.create(deps.newId())],
        }),
      },
      at,
    ).entity;
    if (spec.state === "draft") return draft;
    const published = Region.publish(draft, at).entity;
    return spec.state === "unpublished"
      ? Region.unpublish(published, at).entity
      : published;
  });
  const joined = regions.reduce(
    (a, region) =>
      PlaceAffiliations.affiliate(a, region.id, deps.tick()).entity,
    PlaceAffiliations.empty(placeId, deps.tick()),
  );
  const chosen = representative === undefined ? null : regions[representative];
  const affiliations =
    chosen === undefined ||
    chosen === null ||
    PlaceAffiliations.representative(joined) === chosen.id
      ? joined
      : PlaceAffiliations.chooseRepresentative(joined, chosen.id, deps.tick())
          .entity;
  await deps.container.unitOfWorkProvider.run(
    async ({ regionRepository, placeAffiliationsRepository }) => {
      for (const region of regions) await regionRepository.insert(region);
      await placeAffiliationsRepository.insert(affiliations);
    },
  );
  return regions;
}
