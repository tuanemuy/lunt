import type { PlaceRef } from "@repo/core/domain/authority/stewardship";
import {
  CategoryId,
  ListingId,
  type PhotoId,
  PlaceId,
} from "@repo/core/domain/common/ids";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import { CategoryCatalog } from "@repo/core/domain/listing/categoryCatalog";
import {
  ListingContent,
  type ListingContentInput,
  type OfferingInput,
} from "@repo/core/domain/listing/content";
import { Listing } from "@repo/core/domain/listing/listing";
import type { Framing } from "@repo/core/domain/listing/values";
import { CategoryName } from "@repo/core/domain/listing/values";
import { Place } from "@repo/core/domain/place/place";
import { sampleProfile } from "@repo/core/domain/place/testing/samples";
import { authorityKit, type Person } from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { registerTestPhotos } from "../../media/__tests__/photoFixtures";
import { createListingDraft } from "../createListingDraft";
import { deleteListing } from "../deleteListing";
import { endListingOffering } from "../endListingOffering";
import type { ManagedListingView } from "../managedListing";
import { provisionInitialCategories } from "../provisionInitialCategories";
import { publishListing } from "../publishListing";
import { resumeListingOffering } from "../resumeListingOffering";
import { suspendListing } from "../suspendListing";
import { unpublishListing } from "../unpublishListing";
import { unsuspendListing } from "../unsuspendListing";
import { updateListing } from "../updateListing";

/** 2026-07-10 12:00 in Japan: the testcases' 「今日」. */
export const TODAY_INSTANT = "2026-07-10T03:00:00.000Z";

export type PhotoSpec =
  | PhotoId
  | Readonly<{ photoId: PhotoId; framing: Framing | null }>;

export type ContentSpec = Readonly<{
  name?: string | null;
  description?: string | null;
  categoryId?: CategoryId | null;
  photos?: readonly PhotoSpec[];
  offering?: OfferingInput;
}>;

export const period = (
  start: string | null,
  end: string | null,
): OfferingInput => ({ kind: "period", start, end });

export const dates = (...days: readonly string[]): OfferingInput => ({
  kind: "dates",
  dates: days,
});

export type ListingKit = Awaited<ReturnType<typeof listingKit>>;

/**
 * Usecase-test kit for Listing: Authority's kit (people, stewards, roles,
 * `tick`) on a container whose clock reads 2026-07-10 in Japan, real
 * places in the place repository, the opening categories (unless
 * `categories: false`) and registered photos. Preconditions other domains
 * own (a takedown, an approval) are written through the domain functions
 * and the repositories.
 */
export async function listingKit(
  options: Readonly<{ categories?: boolean }> = {},
) {
  const a = authorityKit();
  a.clock.set(TODAY_INSTANT);
  const { container } = a;
  const newId = () => a.t.idGenerator.next();

  const run = container.unitOfWorkProvider.run.bind(
    container.unitOfWorkProvider,
  );

  async function place(name = "店舗"): Promise<PlaceId> {
    const id = PlaceId.create(newId());
    const { entity } = Place.register(
      { id, profile: sampleProfile({ name }) },
      a.clock.now(),
    );
    await run(({ placeRepository }) => placeRepository.insert(entity));
    return id;
  }

  const ref = (id: PlaceId): PlaceRef => ({ kind: "place", id });

  async function suspendPlace(id: PlaceId): Promise<void> {
    await run(async ({ placeRepository }) => {
      const found = await placeRepository.findById(id);
      if (found === null) throw new Error("no place");
      await placeRepository.save(
        Place.suspend(found.entity, a.tick()).entity,
        found.expectedVersion,
      );
    });
  }

  /** A new person stewarding `placeId`. */
  async function manager(placeId: PlaceId, label?: string): Promise<Person> {
    const who = await a.person(label);
    await a.appoint(ref(placeId), who);
    return who;
  }

  /** A new person holding the operator role. */
  async function operator(label?: string): Promise<Person> {
    const who = await a.person(label);
    await a.operators(who);
    return who;
  }

  async function catalog() {
    return run(({ categoryCatalogRepository }) =>
      categoryCatalogRepository.find(),
    );
  }

  async function writeCatalog(
    change: (current: CategoryCatalog) => CategoryCatalog,
  ): Promise<void> {
    await run(async ({ categoryCatalogRepository }) => {
      const read = await categoryCatalogRepository.find();
      await categoryCatalogRepository.save(
        change(read.entity),
        read.expectedVersion,
      );
    });
  }

  /** The active category named `name`. */
  async function category(name: string): Promise<CategoryId> {
    const found = CategoryCatalog.actives((await catalog()).entity).find(
      (c) => c.name === name,
    );
    if (found === undefined) throw new Error(`no category ${name}`);
    return found.id;
  }

  async function addCategory(name: string): Promise<CategoryId> {
    const id = CategoryId.create(newId());
    await writeCatalog(
      (current) =>
        CategoryCatalog.add(
          current,
          { id, name: CategoryName.create(name) },
          a.tick(),
        ).entity,
    );
    return id;
  }

  async function retireCategory(
    id: CategoryId,
    successorId: CategoryId,
  ): Promise<void> {
    await writeCatalog(
      (current) =>
        CategoryCatalog.retire(current, id, successorId, a.tick()).entity,
    );
  }

  async function renameCategory(id: CategoryId, name: string): Promise<void> {
    await writeCatalog(
      (current) =>
        CategoryCatalog.rename(current, id, CategoryName.create(name), a.tick())
          .entity,
    );
  }

  if (options.categories ?? true) {
    await provisionInitialCategories({ container });
  }
  const defaultCategory =
    (options.categories ?? true) ? await category("食べる") : null;

  const photos = (who: Person, count: number) =>
    registerTestPhotos(container, who.actor, count);

  async function photo(who: Person): Promise<PhotoId> {
    const [id] = await photos(who, 1);
    if (id === undefined) throw new Error("no photo");
    return id;
  }

  const content = (spec: ContentSpec = {}): ListingContentInput => ({
    name: spec.name === undefined ? "掲載" : spec.name,
    description: spec.description ?? null,
    categoryId:
      spec.categoryId === undefined ? defaultCategory : spec.categoryId,
    photos: (spec.photos ?? []).map((p) =>
      typeof p === "string" ? { photoId: p, framing: null } : p,
    ),
    offering: spec.offering ?? { kind: "none" },
  });

  /** A draft made by `who`, with a fresh photo unless `spec.photos` says otherwise. */
  async function draft(
    who: Person,
    placeId: PlaceId,
    spec: ContentSpec = {},
  ): Promise<ManagedListingView> {
    const withPhotos =
      spec.photos === undefined
        ? { ...spec, photos: [await photo(who)] }
        : spec;
    return createListingDraft({
      container,
      actor: who.actor,
      input: { listingId: newId(), placeId, content: content(withPhotos) },
    });
  }

  async function published(
    who: Person,
    placeId: PlaceId,
    spec: ContentSpec = {},
  ): Promise<ManagedListingView> {
    const made = await draft(who, placeId, spec);
    return publishListing({
      container,
      actor: who.actor,
      input: { listingId: made.id },
    });
  }

  async function stored(id: ListingId) {
    const found = await run(({ listingRepository }) =>
      listingRepository.findById(id),
    );
    if (found === null) throw new Error(`no listing ${id}`);
    return found;
  }

  async function findListing(id: ListingId): Promise<Listing | null> {
    const found = await run(({ listingRepository }) =>
      listingRepository.findById(id),
    );
    return found?.entity ?? null;
  }

  /** Writes a change straight through the repository (another domain's step). */
  async function change(
    id: ListingId,
    fn: (listing: Listing, now: Date) => Listing,
  ): Promise<Listing> {
    const read = await stored(id);
    const next = fn(read.entity, a.tick());
    await run(({ listingRepository }) =>
      listingRepository.save(next, read.expectedVersion),
    );
    return next;
  }

  /** Moderation's takedown of `photoIds` from the listing. */
  const takeDown = (
    id: ListingId,
    photoIds: readonly [PhotoId, ...PhotoId[]],
  ) =>
    change(
      id,
      (listing, now) => Listing.takeDownPhotos(listing, photoIds, now).entity,
    );

  /** A published listing as an approved listing application creates it. */
  async function approved(
    placeId: PlaceId,
    applicant: Person,
    spec: ContentSpec = {},
  ): Promise<ListingId> {
    const photos = spec.photos ?? [await photo(applicant)];
    const id = ListingId.create(newId());
    const { entity } = Listing.createPublished(
      {
        id,
        placeId,
        content: ListingContent.toPublishable(
          ListingContent.create(content({ ...spec, photos })),
        ),
      },
      (await catalog()).entity,
      a.tick(),
    );
    await run(({ listingRepository }) => listingRepository.insert(entity));
    return id;
  }

  async function photoOwner(id: PhotoId) {
    const found = await run(({ photoAssetRepository }) =>
      photoAssetRepository.findById(id),
    );
    if (found === null) return undefined;
    return found.entity.stage === "stored" ? found.entity.owner : null;
  }

  async function offeringRecord(id: ListingId) {
    return run(({ offeringPhaseLedger }) => offeringPhaseLedger.find(id));
  }

  async function events(type?: string) {
    const all = await a.t.storedEvents();
    return type === undefined ? all : all.filter((e) => e.type === type);
  }

  const versionOf = (read: { expectedVersion: ExpectedVersion<Listing> }) =>
    read.expectedVersion;

  type Act<R> = (
    args: Readonly<{
      container: RequestContainer;
      actor: Person["actor"];
      input: Readonly<{ listingId: ListingId }>;
    }>,
  ) => Promise<R>;

  /** Runs a state-change usecase for `who` on `listingId`. */
  const act =
    <R>(fn: Act<R>) =>
    (who: Person, listingId: ListingId, over: RequestContainer = container) =>
      fn({ container: over, actor: who.actor, input: { listingId } });

  const publish = act(publishListing);
  const unpublish = act(unpublishListing);
  const end = act(endListingOffering);
  const resume = act(resumeListingOffering);
  const suspend = act(suspendListing);
  const unsuspend = act(unsuspendListing);
  const remove = act(deleteListing);

  /** `updateListing` keeping the stored content but the name. */
  async function saveName(
    who: Person,
    listingId: ListingId,
    name: string,
    over: RequestContainer = container,
  ): Promise<ManagedListingView> {
    const { entity } = await stored(listingId);
    const { content: c } = entity;
    const offering = c.offering;
    return updateListing({
      container: over,
      actor: who.actor,
      input: {
        listingId,
        version: entity.version,
        content: content({
          name,
          description: c.description,
          categoryId: c.categoryId,
          photos: c.photos.items,
          offering:
            offering.kind === "none"
              ? { kind: "none" }
              : offering.kind === "period"
                ? period(offering.period.start, offering.period.end)
                : dates(...offering.dates),
        }),
      },
    });
  }

  return {
    ...a,
    newId,
    run,
    place,
    ref,
    suspendPlace,
    manager,
    operator,
    catalog,
    category,
    addCategory,
    retireCategory,
    renameCategory,
    defaultCategory,
    photos,
    photo,
    content,
    draft,
    published,
    stored,
    findListing,
    change,
    takeDown,
    approved,
    photoOwner,
    offeringRecord,
    events,
    versionOf,
    publish,
    unpublish,
    end,
    resume,
    suspend,
    unsuspend,
    remove,
    saveName,
  };
}
