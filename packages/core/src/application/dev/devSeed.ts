import { PostalCode } from "@repo/core/domain/area/postalCode";
import { TownRef } from "@repo/core/domain/area/townRef";
import type { Actor } from "@repo/core/domain/common/actor";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import {
  type AccountId,
  type CategoryId,
  InvitationId,
  type ListingId,
  PhotoId,
  type PlaceId,
} from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import type { OfferingInput } from "@repo/core/domain/listing/content";
import { acceptInvitation } from "../authority/acceptInvitation";
import { establishFirstOperator } from "../authority/establishFirstOperator";
import { grantRole } from "../authority/grantRole";
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
import { changeOperatingStatus } from "../place/changeOperatingStatus";
import { registerPlaceByProxy } from "../place/registerPlaceByProxy";
import { suspendPlace } from "../place/suspendPlace";
import type { ServiceArgs } from "../types";
import { devAppointPlaceSteward } from "./devAppointPlaceSteward";
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
 * One change to a place's stewards, applied in order:
 * - `appoint`: as approving a stewardship claim does
 *   (`devAppointPlaceSteward`, `authority.steward_appointed` via
 *   `application`).
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

export type SeedPlace = Readonly<{
  key: string;
  name: string;
  description?: string | null | undefined;
  businessHours?: string | null | undefined;
  contact?: string | null | undefined;
  address: Readonly<{
    postalCode: string;
    /** The town's name; may be left out when the postal code has one town. */
    town?: string | undefined;
    /** The part after the town. */
    rest: string;
  }>;
  location: Readonly<{ latitude: number; longitude: number }>;
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
 * What `devSeed` puts into an empty environment: accounts first, then
 * roles, categories, and each place with its stewards and listings.
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
}>;

export type DevSeedResult = Readonly<{
  accounts: Readonly<Record<string, AccountId>>;
  categories: Readonly<Record<string, CategoryId>>;
  places: Readonly<Record<string, PlaceId>>;
  listings: Readonly<Record<string, ListingId>>;
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
 * Development tool: fills an empty environment with the data a manual-test
 * document (`spec/manual-tests/*.md` 「テストデータ」) starts from, through
 * the product's own usecases acting as the right accounts — so events,
 * notifications and invariants are the real ones. Photos are generated
 * (`seedPhotoPng`) and registered with consent by the account that uses
 * them. Not idempotent: run it once on an empty state. Refused unless the
 * development tools are on.
 */
export async function devSeed({
  container,
  input,
}: ServiceArgs<SeedFixture>): Promise<DevSeedResult> {
  if (!container.runtime.devTools) {
    throw new ForbiddenError(
      "DEV_TOOLS_DISABLED",
      "Development tools are disabled",
    );
  }
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

  const places: Record<string, PlaceId> = {};
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

    const target: StewardedRef = { kind: "place", id: place.id };
    let stewards: readonly string[] = [];
    for (const step of fixture.members ?? []) {
      if ("appoint" in step) {
        await devAppointPlaceSteward({
          container,
          input: { placeId: place.id, email: step.appoint },
        });
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

    const manager = stewards[0];
    for (const listing of fixture.listings ?? []) {
      const by =
        listing.by !== undefined
          ? actorOf(listing.by)
          : manager !== undefined
            ? actorOf(manager)
            : operator;
      const today = LocalDate.fromInstant(container.clock.now());
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
        await unpublishListing({ container, actor: by, input: ref });
      } else if (listing.state === "ended") {
        await endListingOffering({ container, actor: by, input: ref });
      }
      if (listing.suspended === true) {
        await suspendListing({ container, actor: operator, input: ref });
      }
    }

    if (fixture.suspended === true) {
      await suspendPlace({
        container,
        actor: operator,
        input: { placeId: place.id },
      });
    }
  }

  return {
    accounts: Object.fromEntries(accounts),
    categories,
    places,
    listings,
  };
}

async function findTown(
  container: RequestContainer,
  address: SeedPlace["address"],
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
