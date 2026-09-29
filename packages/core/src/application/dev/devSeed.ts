import { PostalCode } from "@repo/core/domain/area/postalCode";
import { TownRef } from "@repo/core/domain/area/townRef";
import type { Actor } from "@repo/core/domain/common/actor";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import {
  type AccountId,
  type CategoryId,
  InvitationId,
  type ListingId,
  type OccasionId,
  PhotoId,
  type PlaceId,
  type RegionId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { OfferingInput } from "@repo/core/domain/listing/content";
import { acceptInvitation } from "../authority/acceptInvitation";
import { establishFirstOperator } from "../authority/establishFirstOperator";
import { grantRole } from "../authority/grantRole";
import { grantStewardship } from "../authority/grantStewardship";
import { inviteMember } from "../authority/inviteMember";
import { resignStewardship } from "../authority/resignStewardship";
import type { RequestContainer } from "../di/types";
import { ForbiddenError, NotFoundError } from "../errors";
import { addCategory } from "../listing/addCategory";
import { createListingDraft } from "../listing/createListingDraft";
import { endListingOffering } from "../listing/endListingOffering";
import {
  type CategoryListView,
  listCategories,
} from "../listing/listCategories";
import { provisionInitialCategories } from "../listing/provisionInitialCategories";
import { publishListing } from "../listing/publishListing";
import { renameCategory } from "../listing/renameCategory";
import { retireCategory } from "../listing/retireCategory";
import { suspendListing } from "../listing/suspendListing";
import { unpublishListing } from "../listing/unpublishListing";
import { updateListing } from "../listing/updateListing";
import { registerPhoto } from "../media/registerPhoto";
import { addParticipationDirectly } from "../occasion/addParticipationDirectly";
import { cancelOccasion } from "../occasion/cancelOccasion";
import { detachRegionLink } from "../occasion/detachRegionLink";
import { linkRegion } from "../occasion/linkRegion";
import { publishOccasion } from "../occasion/publishOccasion";
import { recordEndedOccasions } from "../occasion/recordEndedOccasions";
import { registerOccasion } from "../occasion/registerOccasion";
import { suspendOccasion } from "../occasion/suspendOccasion";
import { unpublishOccasion } from "../occasion/unpublishOccasion";
import { changeOperatingStatus } from "../place/changeOperatingStatus";
import { registerPlaceByProxy } from "../place/registerPlaceByProxy";
import { suspendPlace } from "../place/suspendPlace";
import type { Clock } from "../ports/clock";
import { chooseRepresentativeRegion } from "../region/chooseRepresentativeRegion";
import { publishRegion } from "../region/publishRegion";
import { registerRegion } from "../region/registerRegion";
import { suspendRegion } from "../region/suspendRegion";
import { unpublishRegion } from "../region/unpublishRegion";
import type { ServiceArgs } from "../types";
import { devAppointPlaceSteward } from "./devAppointPlaceSteward";
import { devEstablishAffiliation } from "./devEstablishAffiliation";
import { devEstablishParticipation } from "./devEstablishParticipation";
import { devSignIn } from "./devSignIn";
import { seedPhotoPng } from "./seedPhoto";

/**
 * A day: `YYYY-MM-DD`, or relative to the application's today (Japan
 * time) as `today`, `today+N`, `today-N`.
 */
export type SeedDate = string;

export type SeedOffering =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "period"; start: SeedDate | null; end: SeedDate | null }>
  | Readonly<{ kind: "dates"; dates: readonly SeedDate[] }>;

/**
 * One change to a target's stewards, applied in order:
 * - `appoint`: a place's steward as approving a stewardship claim does
 *   (`devAppointPlaceSteward`, `authority.steward_appointed` via
 *   `application`); a region's or an occasion's as the first operator's
 *   `grantStewardship` (via `grant`).
 * - `invite`: `by` (a current steward) invites the address, which needs no
 *   account; with `accept`, the invitee's account accepts it.
 * - `resign`: the steward resigns.
 */
export type SeedMemberStep =
  | Readonly<{ appoint: string }>
  | Readonly<{ invite: string; by: string; accept?: boolean | undefined }>
  | Readonly<{ resign: string }>;

/**
 * - `draft`: saved, never published.
 * - `published`: published (`offeringAfterPublish` is then saved by edit).
 * - `unpublished`: published, then unpublished by its manager.
 * - `ended`: published, then its offering ended by hand.
 */
export type SeedListingState = "draft" | "published" | "unpublished" | "ended";

export type SeedListing = Readonly<{
  key: string;
  name: string | null;
  description?: string | null | undefined;
  /** An active category's name. */
  category?: string | null | undefined;
  /** Photo labels; each becomes a new photo drawn with its label. */
  photos?: readonly string[] | undefined;
  offering?: SeedOffering | undefined;
  /** Saved by `updateListing` after publishing (e.g. a period already past). */
  offeringAfterPublish?: SeedOffering | undefined;
  state: SeedListingState;
  /** Suspended by the operator after `state` is reached. */
  suspended?: boolean | undefined;
  /**
   * The account that creates and manages it. Default: the place's first
   * current steward, or the operator standing in for an absent one.
   */
  by?: string | undefined;
}>;

export type SeedAddress = Readonly<{
  postalCode: string;
  /** The town's name; may be left out when the postal code has one town. */
  town?: string | undefined;
  /** The part after the town. */
  rest: string;
}>;

export type SeedLocation = Readonly<{ latitude: number; longitude: number }>;

export type SeedPlace = Readonly<{
  key: string;
  name: string;
  description?: string | null | undefined;
  businessHours?: string | null | undefined;
  contact?: string | null | undefined;
  address: SeedAddress;
  location: SeedLocation;
  photos?: readonly string[] | undefined;
  operatingStatus?:
    | "open"
    | "temporarilyClosed"
    | "permanentlyClosed"
    | undefined;
  members?: readonly SeedMemberStep[] | undefined;
  listings?: readonly SeedListing[] | undefined;
  /** Suspended by the operator once everything else is in place. */
  suspended?: boolean | undefined;
}>;

/**
 * A region's or an occasion's publication:
 * - `draft`: saved, never published.
 * - `published`: published by its manager.
 * - `unpublished`: published, then unpublished by its manager once
 *   everything else is in place.
 */
export type SeedPublication = "draft" | "published" | "unpublished";

/** Content shared by regions and occasions; every field but the name may be empty. */
type SeedContent = Readonly<{
  key: string;
  name: string;
  address?: SeedAddress | null | undefined;
  location?: SeedLocation | null | undefined;
  photos?: readonly string[] | undefined;
  description?: string | null | undefined;
  tagline?: string | null | undefined;
  publication: SeedPublication;
  /** Suspended by the operator once everything else is in place. */
  suspended?: boolean | undefined;
  members?: readonly SeedMemberStep[] | undefined;
}>;

/** A region; registered by the first operator, managed by its first steward (or the operator standing in). */
export type SeedRegion = SeedContent;

/** A place's affiliations, established in the order listed. */
export type SeedAffiliation = Readonly<{
  /** A place key. */
  place: string;
  /** Region keys. */
  regions: readonly string[];
  /** One of `regions`, chosen by the place's first steward (the place needs one). */
  representative?: string | undefined;
}>;

export type SeedRegionLink = Readonly<{
  /** A region key; the region must be published (its suspension comes last). */
  region: string;
  /** Detached by the region's manager once everything else is in place. */
  detached?: boolean | undefined;
}>;

/**
 * A place taking part: established as an approved participation
 * application when the place has a steward, else added directly by the
 * occasion's manager.
 */
export type SeedParticipation = Readonly<{
  /** A place key. */
  place: string;
  /** Listing keys of the place's listings; published and not suspended at this point. */
  listings?: readonly string[] | undefined;
  /** Within the period. */
  dates?: readonly SeedDate[] | undefined;
}>;

/** An occasion; registered by the first operator, managed by its first steward (or the operator standing in). */
export type SeedOccasion = SeedContent &
  Readonly<{
    /** Inclusive; the address and location are the venue's. */
    period?: Readonly<{ start: SeedDate; end: SeedDate }> | null | undefined;
    /** Cancelled by its manager once everything else is in place. */
    cancelled?: boolean | undefined;
    regionLinks?: readonly SeedRegionLink[] | undefined;
    participations?: readonly SeedParticipation[] | undefined;
  }>;

/**
 * What `devSeed` puts into an empty environment: accounts first, then
 * roles, categories, places with their stewards and listings, regions,
 * affiliations, and occasions with their region links and participations.
 * The states that would stand in the way of later steps (unpublished,
 * ended or suspended listings, suspended places, unpublished or suspended
 * regions, cancelled, unpublished or suspended occasions, detached region
 * links) are applied last.
 */
export type SeedFixture = Readonly<{
  /** Accounts to create, as a development login does. */
  accounts: readonly string[];
  /** The first is established as the first operator and grants the rest. */
  operators: readonly [string, ...string[]];
  editors?: readonly string[] | undefined;
  /**
   * The active categories, exactly. Left out: the four initial ones. The
   * initial ones not named are renamed to the missing names in order,
   * further names are added, and initial ones still unused are retired.
   */
  categories?: readonly string[] | undefined;
  places?: readonly SeedPlace[] | undefined;
  regions?: readonly SeedRegion[] | undefined;
  affiliations?: readonly SeedAffiliation[] | undefined;
  occasions?: readonly SeedOccasion[] | undefined;
}>;

export type DevSeedResult = Readonly<{
  accounts: Readonly<Record<string, AccountId>>;
  categories: Readonly<Record<string, CategoryId>>;
  places: Readonly<Record<string, PlaceId>>;
  listings: Readonly<Record<string, ListingId>>;
  regions: Readonly<Record<string, RegionId>>;
  occasions: Readonly<Record<string, OccasionId>>;
}>;

type Accounts = Map<string, AccountId>;

const RELATIVE_DAY = /^today(?:([+-])(\d{1,5}))?$/;

function resolveDate(input: SeedDate, today: LocalDate): string {
  const relative = RELATIVE_DAY.exec(input);
  if (relative === null) return input;
  const days = Number(relative[2] ?? "0") * (relative[1] === "-" ? -1 : 1);
  return LocalDate.format(LocalDate.addDays(today, days));
}

function resolveOffering(
  offering: SeedOffering,
  today: LocalDate,
): OfferingInput {
  switch (offering.kind) {
    case "none":
      return offering;
    case "period":
      return {
        kind: "period",
        start:
          offering.start === null ? null : resolveDate(offering.start, today),
        end: offering.end === null ? null : resolveDate(offering.end, today),
      };
    case "dates":
      return {
        kind: "dates",
        dates: offering.dates.map((day) => resolveDate(day, today)),
      };
  }
}

/**
 * Seeded records keep the fixture's order wherever the product orders by
 * time (first-affiliated order, participants, links), even when several
 * writes land in the same millisecond.
 */
function strictlyIncreasing(clock: Clock): Clock {
  let last = Number.NEGATIVE_INFINITY;
  return {
    now: () => {
      last = Math.max(clock.now().getTime(), last + 1);
      return new Date(last);
    },
  };
}

function lookup<T>(
  ids: Readonly<Record<string, T>>,
  key: string,
  kind: "PLACE" | "LISTING" | "REGION",
): T {
  const id = ids[key];
  if (id === undefined) {
    throw new NotFoundError(
      `SEED_${kind}_NOT_LISTED`,
      `${key} is used in the fixture but is not one of its ${kind.toLowerCase()} keys`,
    );
  }
  return id;
}

/**
 * Development tool: fills an empty environment with the data a manual-test
 * document (`spec/manual-tests/*.md` 「テストデータ」) starts from, through
 * the product's own usecases acting as the right accounts — so events,
 * notifications and invariants are the real ones. Affiliations and the
 * participations of places with a steward, which only applications (S3B)
 * create, go through the development paths that do what their approval
 * will (`devEstablishAffiliation`, `devEstablishParticipation`). Photos
 * are generated (`seedPhotoPng`) and registered with consent by the
 * account that uses them. Ends with a run of `recordEndedOccasions`, as
 * the daily job would have recorded the occasions already over. Not
 * idempotent: run it once on an empty state. Refused unless the
 * development tools are on.
 */
export async function devSeed({
  container: base,
  input,
}: ServiceArgs<SeedFixture>): Promise<DevSeedResult> {
  if (!base.runtime.devTools) {
    throw new ForbiddenError(
      "DEV_TOOLS_DISABLED",
      "Development tools are disabled",
    );
  }
  const container: RequestContainer = {
    ...base,
    clock: strictlyIncreasing(base.clock),
  };
  const today = LocalDate.fromInstant(container.clock.now());
  const accounts: Accounts = new Map();
  for (const email of input.accounts) {
    const { accountId } = await devSignIn({ container, input: { email } });
    accounts.set(EmailAddress.create(email), accountId);
  }
  const actorOf = (email: string): Actor => {
    const accountId = accounts.get(EmailAddress.create(email));
    if (accountId === undefined) {
      throw new NotFoundError(
        "SEED_ACCOUNT_NOT_LISTED",
        `${email} acts in the fixture but is not in its accounts`,
      );
    }
    return { accountId };
  };

  const [firstOperator, ...otherOperators] = input.operators;
  await establishFirstOperator({ container, input: { email: firstOperator } });
  const operator = actorOf(firstOperator);
  for (const email of otherOperators) {
    await grantRole({
      container,
      actor: operator,
      input: { role: "operator", email },
    });
  }
  for (const email of input.editors ?? []) {
    await grantRole({
      container,
      actor: operator,
      input: { role: "editor", email },
    });
  }

  const categories = await seedCategories(
    container,
    operator,
    input.categories,
  );

  const newPhotos = async (
    labels: readonly string[] | undefined,
    by: Actor,
  ): Promise<PhotoId[]> => {
    const ids: PhotoId[] = [];
    for (const label of labels ?? []) {
      const photoId = container.idGenerator.next();
      await registerPhoto({
        container,
        actor: by,
        input: { photoId, bytes: seedPhotoPng(label), agreed: true },
      });
      ids.push(PhotoId.create(photoId));
    }
    return ids;
  };

  /** Applies the steps; answers the current stewards, first appointed first. */
  const applyMembers = async (
    target: StewardedRef,
    steps: readonly SeedMemberStep[] | undefined,
  ): Promise<readonly string[]> => {
    let stewards: readonly string[] = [];
    for (const step of steps ?? []) {
      if ("appoint" in step) {
        if (target.kind === "place") {
          await devAppointPlaceSteward({
            container,
            input: { placeId: target.id, email: step.appoint },
          });
        } else {
          await grantStewardship({
            container,
            actor: operator,
            input: { target, email: step.appoint },
          });
        }
        stewards = [...stewards, EmailAddress.create(step.appoint)];
      } else if ("invite" in step) {
        const invitationId = container.idGenerator.next();
        await inviteMember({
          container,
          actor: actorOf(step.by),
          input: { target, invitationId, email: step.invite },
        });
        if (step.accept === true) {
          await acceptInvitation({
            container,
            actor: actorOf(step.invite),
            input: { target, invitationId: InvitationId.create(invitationId) },
          });
          stewards = [...stewards, EmailAddress.create(step.invite)];
        }
      } else {
        await resignStewardship({
          container,
          actor: actorOf(step.resign),
          input: { target },
        });
        const email = EmailAddress.create(step.resign);
        stewards = stewards.filter((steward) => steward !== email);
      }
    }
    return stewards;
  };
  /** The first current steward, or the operator standing in for an absent one. */
  const managerOf = (stewards: readonly string[] | undefined): Actor => {
    const first = stewards?.[0];
    return first === undefined ? operator : actorOf(first);
  };

  /** Steps that would stand in the way of later ones, run at the end in order. */
  const finishing: (() => Promise<unknown>)[] = [];

  const places: Record<string, PlaceId> = {};
  const placeStewards = new Map<string, readonly string[]>();
  const listings: Record<string, ListingId> = {};
  for (const fixture of input.places ?? []) {
    const town = await findTown(container, fixture.address);
    const placeId = container.idGenerator.next();
    const place = await registerPlaceByProxy({
      container,
      actor: operator,
      input: {
        placeId,
        profile: {
          name: fixture.name,
          photoIds: await newPhotos(fixture.photos, operator),
          description: fixture.description ?? null,
          town,
          addressRest: fixture.address.rest,
          location: fixture.location,
          businessHours: fixture.businessHours ?? null,
          contact: fixture.contact ?? null,
        },
      },
    });
    places[fixture.key] = place.id;
    if (
      fixture.operatingStatus !== undefined &&
      fixture.operatingStatus !== "open"
    ) {
      await changeOperatingStatus({
        container,
        actor: operator,
        input: {
          placeId: place.id,
          version: place.version,
          status: fixture.operatingStatus,
        },
      });
    }

    const stewards = await applyMembers(
      { kind: "place", id: place.id },
      fixture.members,
    );
    placeStewards.set(fixture.key, stewards);

    for (const listing of fixture.listings ?? []) {
      const by =
        listing.by !== undefined ? actorOf(listing.by) : managerOf(stewards);
      const categoryName = listing.category ?? null;
      const categoryId =
        categoryName === null ? null : categories[categoryName];
      if (categoryId === undefined) {
        throw new NotFoundError(
          "SEED_CATEGORY_NOT_FOUND",
          `Listing ${listing.key}: no active category ${categoryName}`,
        );
      }
      const content = {
        name: listing.name,
        description: listing.description ?? null,
        categoryId,
        photos: (await newPhotos(listing.photos, by)).map((photoId) => ({
          photoId,
          framing: null,
        })),
        offering: resolveOffering(listing.offering ?? { kind: "none" }, today),
      };
      const draft = await createListingDraft({
        container,
        actor: by,
        input: {
          listingId: container.idGenerator.next(),
          placeId: place.id,
          content,
        },
      });
      listings[listing.key] = draft.id;
      const ref = { listingId: draft.id };
      if (listing.state !== "draft") {
        const published = await publishListing({
          container,
          actor: by,
          input: ref,
        });
        if (listing.offeringAfterPublish !== undefined) {
          await updateListing({
            container,
            actor: by,
            input: {
              listingId: draft.id,
              version: published.version,
              content: {
                ...content,
                offering: resolveOffering(listing.offeringAfterPublish, today),
              },
            },
          });
        }
      }
      if (listing.state === "unpublished") {
        finishing.push(() =>
          unpublishListing({ container, actor: by, input: ref }),
        );
      } else if (listing.state === "ended") {
        finishing.push(() =>
          endListingOffering({ container, actor: by, input: ref }),
        );
      }
      if (listing.suspended === true) {
        finishing.push(() =>
          suspendListing({ container, actor: operator, input: ref }),
        );
      }
    }

    if (fixture.suspended === true) {
      finishing.push(() =>
        suspendPlace({
          container,
          actor: operator,
          input: { placeId: place.id },
        }),
      );
    }
  }

  const contentFields = async (fixture: SeedContent) => ({
    name: fixture.name,
    address:
      fixture.address === undefined || fixture.address === null
        ? null
        : {
            town: await findTown(container, fixture.address),
            rest: fixture.address.rest,
          },
    location: fixture.location ?? null,
    photoIds: await newPhotos(fixture.photos, operator),
    description: fixture.description ?? null,
    tagline: fixture.tagline ?? null,
  });

  const regions: Record<string, RegionId> = {};
  const regionStewards = new Map<string, readonly string[]>();
  for (const fixture of input.regions ?? []) {
    const { region } = await registerRegion({
      container,
      actor: operator,
      input: {
        regionId: container.idGenerator.next(),
        content: await contentFields(fixture),
      },
    });
    regions[fixture.key] = region.id;
    const stewards = await applyMembers(
      { kind: "region", id: region.id },
      fixture.members,
    );
    regionStewards.set(fixture.key, stewards);
    const manager = managerOf(stewards);
    const ref = { regionId: region.id };
    if (fixture.publication !== "draft") {
      await publishRegion({ container, actor: manager, input: ref });
    }
    if (fixture.publication === "unpublished") {
      finishing.push(() =>
        unpublishRegion({ container, actor: manager, input: ref }),
      );
    }
    if (fixture.suspended === true) {
      finishing.push(() =>
        suspendRegion({ container, actor: operator, input: ref }),
      );
    }
  }

  for (const fixture of input.affiliations ?? []) {
    const placeId = lookup(places, fixture.place, "PLACE");
    for (const key of fixture.regions) {
      await devEstablishAffiliation({
        container,
        input: { placeId, regionId: lookup(regions, key, "REGION") },
      });
    }
    if (fixture.representative !== undefined) {
      const steward = placeStewards.get(fixture.place)?.[0];
      if (steward === undefined) {
        throw new NotFoundError(
          "SEED_PLACE_STEWARD_NOT_FOUND",
          `${fixture.place}: only a steward chooses the representative region`,
        );
      }
      await chooseRepresentativeRegion({
        container,
        actor: actorOf(steward),
        input: {
          placeId,
          regionId: lookup(regions, fixture.representative, "REGION"),
        },
      });
    }
  }

  const occasions: Record<string, OccasionId> = {};
  for (const fixture of input.occasions ?? []) {
    const period =
      fixture.period === undefined || fixture.period === null
        ? null
        : {
            start: resolveDate(fixture.period.start, today),
            end: resolveDate(fixture.period.end, today),
          };
    const occasion = await registerOccasion({
      container,
      actor: operator,
      input: {
        occasionId: container.idGenerator.next(),
        content: { ...(await contentFields(fixture)), period },
      },
    });
    occasions[fixture.key] = occasion.id;
    const manager = managerOf(
      await applyMembers(
        { kind: "occasion", id: occasion.id },
        fixture.members,
      ),
    );
    const ref = { occasionId: occasion.id };
    if (fixture.publication !== "draft") {
      await publishOccasion({ container, actor: manager, input: ref });
    }

    for (const link of fixture.regionLinks ?? []) {
      const regionId = lookup(regions, link.region, "REGION");
      await linkRegion({
        container,
        actor: manager,
        input: { occasionId: occasion.id, regionId },
      });
      if (link.detached === true) {
        finishing.push(() =>
          detachRegionLink({
            container,
            actor: managerOf(regionStewards.get(link.region)),
            input: { occasionId: occasion.id, regionId },
          }),
        );
      }
    }

    for (const participation of fixture.participations ?? []) {
      const placeId = lookup(places, participation.place, "PLACE");
      const details = {
        occasionId: occasion.id,
        placeId,
        listingIds: (participation.listings ?? []).map((key) =>
          lookup(listings, key, "LISTING"),
        ),
        dates: (participation.dates ?? []).map((day) =>
          LocalDate.parse(resolveDate(day, today)),
        ),
      };
      if ((placeStewards.get(participation.place) ?? []).length > 0) {
        await devEstablishParticipation({ container, input: details });
      } else {
        await addParticipationDirectly({
          container,
          actor: manager,
          input: details,
        });
      }
    }

    if (fixture.publication === "unpublished") {
      finishing.push(() =>
        unpublishOccasion({ container, actor: manager, input: ref }),
      );
    }
    if (fixture.cancelled === true) {
      finishing.push(() =>
        cancelOccasion({ container, actor: manager, input: ref }),
      );
    }
    if (fixture.suspended === true) {
      finishing.push(() =>
        suspendOccasion({ container, actor: operator, input: ref }),
      );
    }
  }

  for (const step of finishing) await step();
  if ((input.occasions ?? []).length > 0) {
    await recordEndedOccasions(container, container.clock.now());
  }

  return {
    accounts: Object.fromEntries(accounts),
    categories,
    places,
    listings,
    regions,
    occasions,
  };
}

async function findTown(
  container: RequestContainer,
  address: SeedAddress,
): Promise<TownRef> {
  const towns = await container.areaCatalog.findTownsByPostalCode(
    PostalCode.create(address.postalCode),
  );
  const matching = towns.filter(
    (town) => address.town === undefined || town.name === address.town,
  );
  const [town] = matching;
  if (town === undefined || matching.length > 1) {
    throw new NotFoundError(
      "SEED_TOWN_NOT_FOUND",
      `No single town ${address.town ?? "(any)"} for postal code ${address.postalCode}`,
    );
  }
  return TownRef.of(town);
}

/** Brings the active categories to exactly `wanted` (see `SeedFixture.categories`). */
async function seedCategories(
  container: RequestContainer,
  operator: Actor,
  wanted: readonly string[] | undefined,
): Promise<Record<string, CategoryId>> {
  await provisionInitialCategories({ container });
  let actives: CategoryListView = await listCategories({ container });
  if (wanted !== undefined) {
    const names = new Set(wanted);
    const unused = actives.filter((category) => !names.has(category.name));
    const missing = wanted.filter(
      (name) => !actives.some((category) => category.name === name),
    );
    for (const name of missing) {
      const reusable = unused.shift();
      actives =
        reusable === undefined
          ? await addCategory({
              container,
              actor: operator,
              input: { categoryId: container.idGenerator.next(), name },
            })
          : await renameCategory({
              container,
              actor: operator,
              input: { categoryId: reusable.id, name },
            });
    }
    const successor = actives.find((category) => category.name === wanted[0]);
    for (const category of unused) {
      if (successor === undefined) break;
      actives = await retireCategory({
        container,
        actor: operator,
        input: { categoryId: category.id, successorId: successor.id },
      });
    }
  }
  return Object.fromEntries(
    actives.map((category) => [category.name, category.id]),
  );
}
