import {
  type Application,
  type ApplicationOf,
  Application as Behaviour,
  Premise,
} from "@repo/core/domain/application/application";
import type { AnyApplication } from "@repo/core/domain/application/kind";
import type { PremiseKey } from "@repo/core/domain/application/premise";
import type { Active, UnderReview } from "@repo/core/domain/application/status";
import {
  RejectionReason,
  ReturnRequest,
} from "@repo/core/domain/application/texts";
import type { EventDraft } from "@repo/core/domain/common/event";
import {
  ApplicationId,
  type ListingId,
  type PhotoId,
  type PlaceId,
} from "@repo/core/domain/common/ids";
import type { Versioned } from "@repo/core/domain/common/transactionalRepository";
import { Place } from "@repo/core/domain/place/place";
import { expect } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { type ContentSpec, listingKit } from "../../listing/__tests__/kit";
import { profileFields, Towns } from "../../place/__tests__/kit";
import type { PlaceProfileFields } from "../../place/profileInput";
import { registerPlaceByProxy } from "../../place/registerPlaceByProxy";
import type { GeneratedId } from "../../ports/idGenerator";
import { evaluatePremise } from "../facts";
import {
  type SubmitListingRevisionInput,
  submitListingRevision,
} from "../submitListingRevision";
import { submitNewListing } from "../submitNewListing";
import { submitPlaceRegistration } from "../submitPlaceRegistration";
import {
  type SubmitPlaceRevisionInput,
  submitPlaceRevision,
} from "../submitPlaceRevision";
import { submitStewardshipClaim } from "../submitStewardshipClaim";

export type { Person };
export { profileFields, Towns };

export type AppKit = Awaited<ReturnType<typeof applicationKit>>;

/**
 * A container whose `n`-th unit of work (1-based) runs `beforeCommit`
 * after its callback — every read done, writes buffered — and before it
 * commits, so a competing request can commit in between.
 */
export function commitAfterRun(
  container: RequestContainer,
  n: number,
  beforeCommit: () => Promise<unknown>,
): RequestContainer {
  let runs = 0;
  return {
    ...container,
    unitOfWorkProvider: {
      run: (fn) =>
        container.unitOfWorkProvider.run(async (ctx) => {
          runs += 1;
          const current = runs;
          const result = await fn(ctx);
          if (current === n) await beforeCommit();
          return result;
        }),
    },
  };
}

/**
 * Usecase-test kit for Application, for the applicant's and the
 * reviewer's usecases alike: Listing's kit (people, roles, stewards,
 * places, categories, photos, listings, the clock at 2026-07-10 in Japan)
 * plus
 *
 * - places registered by proxy with photos (`placeWithPhotos`), their
 *   profile as submission input (`fieldsOf`), published listings;
 * - the five stage-2 submissions through their usecases (`register`,
 *   `revise`, `claim`, `newListing`, `reviseListing`) with input
 *   builders;
 * - reviewer outcomes written straight through the repository with the
 *   domain's behaviours (`sendBack`, `reject`, `approveStatus`,
 *   `withdrawRaw`, `lapse`), for preconditions of other usecases;
 * - readers (`stored`, `app`, `events`, `photoOwner`).
 */
export async function applicationKit() {
  const l = await listingKit();
  const { container, run } = l;
  let setup: Person | null = null;

  /** The operator that registers places and listings for the tests. */
  async function setupOperator(): Promise<Person> {
    if (setup === null) setup = await l.operator("setup-operator");
    return setup;
  }

  const newApplicationId = (): GeneratedId => l.newId();
  const asApplicationId = (id: GeneratedId): ApplicationId =>
    ApplicationId.create(id);

  /** A place by proxy whose photos (`count`, by the setup operator) it owns. */
  async function placeWithPhotos(
    name: string,
    count: number,
  ): Promise<Readonly<{ placeId: PlaceId; photoIds: readonly PhotoId[] }>> {
    const by = await setupOperator();
    const photoIds = await l.photos(by, count);
    const place = await registerPlaceByProxy({
      container,
      actor: by.actor,
      input: {
        placeId: l.newId(),
        profile: profileFields({ name, photoIds }),
      },
    });
    return { placeId: place.id, photoIds };
  }

  async function getPlace(id: PlaceId): Promise<Versioned<Place>> {
    const found = await run(({ placeRepository }) =>
      placeRepository.findById(id),
    );
    if (found === null) throw new Error(`no place ${id}`);
    return found;
  }

  /** Writes a change of the place straight through the repository. */
  async function changePlace(
    id: PlaceId,
    change: (place: Place, now: Date) => Place,
  ): Promise<Place> {
    const read = await getPlace(id);
    const next = change(read.entity, l.tick());
    await run(({ placeRepository }) =>
      placeRepository.save(next, read.expectedVersion),
    );
    return next;
  }

  /** The place's present profile as submission input (Towns of the test master). */
  async function fieldsOf(
    id: PlaceId,
    overrides: Partial<PlaceProfileFields> = {},
  ): Promise<PlaceProfileFields> {
    const { profile } = (await getPlace(id)).entity;
    const town = Object.values(Towns).find(
      (ref) =>
        ref.areaCode === profile.address.areaCode &&
        ref.name === profile.address.town,
    );
    if (town === undefined) throw new Error("the place's town is not known");
    return {
      name: profile.name,
      photoIds: profile.photos.items.map((item) => item.photoId),
      description: profile.description,
      town,
      addressRest: profile.address.rest,
      location: {
        latitude: profile.location.latitude,
        longitude: profile.location.longitude,
      },
      businessHours: profile.visitInfo.businessHours,
      contact: profile.visitInfo.contact,
      ...overrides,
    };
  }

  /**
   * A published listing of `placeId`, drafted and published by the setup
   * operator standing in for the absent steward (so its photos are the
   * listing's). The place must have no steward yet.
   */
  async function listing(
    placeId: PlaceId,
    spec: ContentSpec = {},
  ): Promise<ListingId> {
    const by = await setupOperator();
    return (await l.published(by, placeId, spec)).id;
  }

  // --- submissions --------------------------------------------------------

  async function register(
    who: Person,
    options: Readonly<{
      id?: GeneratedId;
      profile?: Partial<PlaceProfileFields>;
      claim?: Readonly<{
        id?: GeneratedId;
        relationship?: string;
        evidence?: string;
      }> | null;
    }> = {},
  ) {
    return submitPlaceRegistration({
      container,
      actor: who.actor,
      input: {
        applicationId: options.id ?? newApplicationId(),
        profile: profileFields({ name: "新しい店", ...options.profile }),
        stewardship:
          options.claim === undefined || options.claim === null
            ? null
            : {
                applicationId: options.claim.id ?? newApplicationId(),
                relationship: options.claim.relationship ?? "店主です",
                evidence: options.claim.evidence ?? "03-0000-0000",
              },
      },
    });
  }

  type RevisionOptions = Readonly<{
    id?: GeneratedId;
    profile?: Partial<PlaceProfileFields>;
    operatingStatus?: string;
  }>;

  /**
   * A revision's input: the place's present profile with `options` laid
   * over it — by default only the name changes.
   */
  async function revisionInput(
    placeId: PlaceId,
    options: RevisionOptions = {},
  ): Promise<SubmitPlaceRevisionInput> {
    const current = (await getPlace(placeId)).entity;
    return {
      applicationId: options.id ?? newApplicationId(),
      placeId,
      profile: await fieldsOf(placeId, {
        name: `${current.profile.name}（修正）`,
        ...options.profile,
      }),
      operatingStatus: options.operatingStatus ?? current.operatingStatus,
    };
  }

  const submitRevision = (who: Person, input: SubmitPlaceRevisionInput) =>
    submitPlaceRevision({ container, actor: who.actor, input });

  async function revise(
    who: Person,
    placeId: PlaceId,
    options: RevisionOptions = {},
  ): Promise<ApplicationOf<"revision">> {
    return submitRevision(who, await revisionInput(placeId, options));
  }

  async function claim(
    who: Person,
    target:
      | Readonly<{ placeId: PlaceId }>
      | Readonly<{ registrationId: ApplicationId }>,
    options: Readonly<{
      id?: GeneratedId;
      relationship?: string;
      evidence?: string;
    }> = {},
  ): Promise<ApplicationOf<"stewardship">> {
    return submitStewardshipClaim({
      container,
      actor: who.actor,
      input: {
        applicationId: options.id ?? newApplicationId(),
        target,
        relationship: options.relationship ?? "店主です",
        evidence: options.evidence ?? "03-0000-0000",
      },
    });
  }

  /** A listing application; a fresh photo of `who` unless `spec.photos` says otherwise. */
  async function newListing(
    who: Person,
    placeId: PlaceId,
    spec: ContentSpec = {},
    id: GeneratedId = newApplicationId(),
  ): Promise<ApplicationOf<"listing">> {
    const photos = spec.photos ?? [await l.photo(who)];
    return submitNewListing({
      container,
      actor: who.actor,
      input: {
        applicationId: id,
        placeId,
        content: l.content({ ...spec, photos }),
      },
    });
  }

  /** The listing's present content as input, with `spec` laid over it. */
  async function listingInput(listingId: ListingId, spec: ContentSpec = {}) {
    const { content } = (await l.stored(listingId)).entity;
    const offering = content.offering;
    return l.content({
      name: content.name,
      description: content.description,
      categoryId: content.categoryId,
      photos: content.photos.items,
      offering:
        offering.kind === "none"
          ? { kind: "none" }
          : offering.kind === "period"
            ? { kind: "period", ...offering.period }
            : { kind: "dates", dates: offering.dates },
      ...spec,
    });
  }

  /** A listing revision's input: the listing now, with `spec` laid over it. */
  async function listingRevisionInput(
    listingId: ListingId,
    spec: ContentSpec = { name: "直した掲載" },
    id: GeneratedId = newApplicationId(),
  ): Promise<SubmitListingRevisionInput> {
    return {
      applicationId: id,
      listingId,
      content: await listingInput(listingId, spec),
    };
  }

  const submitListingRev = (who: Person, input: SubmitListingRevisionInput) =>
    submitListingRevision({ container, actor: who.actor, input });

  async function reviseListing(
    who: Person,
    listingId: ListingId,
    spec: ContentSpec = { name: "直した掲載" },
    id: GeneratedId = newApplicationId(),
  ): Promise<ApplicationOf<"listingRevision">> {
    return submitListingRev(
      who,
      await listingRevisionInput(listingId, spec, id),
    );
  }

  // --- reading and writing applications -----------------------------------

  async function stored(id: ApplicationId): Promise<Versioned<Application>> {
    const found = await run(({ applicationRepository }) =>
      applicationRepository.findById(id),
    );
    if (found === null) throw new Error(`no application ${id}`);
    return found;
  }

  const app = async (id: ApplicationId): Promise<Application> =>
    (await stored(id)).entity;

  async function findApp(id: ApplicationId): Promise<Application | null> {
    const found = await run(({ applicationRepository }) =>
      applicationRepository.findById(id),
    );
    return found?.entity ?? null;
  }

  /**
   * Writes the result of a domain behaviour on the stored application,
   * with its events — another usecase's outcome as a precondition.
   */
  async function changeApp(
    id: ApplicationId,
    fn: (
      app: Application,
      now: Date,
    ) => Readonly<{
      entity: AnyApplication;
      eventDrafts: readonly EventDraft[];
    }>,
  ): Promise<Application> {
    const read = await stored(id);
    const { entity, eventDrafts } = fn(read.entity, l.tick());
    await run(async (ctx) => {
      await ctx.applicationRepository.save(
        entity as Application,
        read.expectedVersion,
      );
      ctx.collectEvents(eventDrafts);
    });
    return entity as Application;
  }

  const underReview = (a: Application) =>
    Behaviour.requireUnderReview(a) as UnderReview<Application>;

  /** The approver returns the application with `request`. */
  const sendBack = (
    id: ApplicationId,
    request = "確認に使える資料を添えてください",
  ) =>
    changeApp(id, (a, now) =>
      Behaviour.sendBack(
        underReview(a),
        "approver",
        ReturnRequest.create(request),
        now,
      ),
    );

  /** The approver rejects the application (nothing reflected). */
  const reject = (id: ApplicationId, reason = "確認できませんでした") =>
    changeApp(id, (a, now) =>
      Behaviour.reject(
        underReview(a),
        "approver",
        RejectionReason.create(reason),
        now,
      ),
    );

  /**
   * The application's status becomes approved on the facts now; nothing is
   * reflected (use an approval usecase for that).
   */
  async function approveStatus(id: ApplicationId): Promise<Application> {
    const read = await stored(id);
    const result = await run((ctx) =>
      evaluatePremise(ctx, read.entity.target, l.clock.now()),
    );
    return changeApp(id, (a, now) =>
      Behaviour.approve(
        underReview(a),
        "approver",
        Premise.require(result),
        now,
      ),
    );
  }

  /**
   * A registration approved as its approval leaves it: approved, and its
   * place registered under the reserved id with its profile (the photos'
   * owner is not moved).
   */
  async function registrationApproved(id: ApplicationId): Promise<PlaceId> {
    const registration = (await approveStatus(
      id,
    )) as ApplicationOf<"registration">;
    const { entity } = Place.register(
      { id: registration.reservedPlaceId, profile: registration.content },
      l.tick(),
    );
    await run(({ placeRepository }) => placeRepository.insert(entity));
    return entity.id;
  }

  const withdrawRaw = (id: ApplicationId) =>
    changeApp(id, (a, now) =>
      Behaviour.withdraw(
        Behaviour.requireActive(a) as Active<Application>,
        now,
      ),
    );

  /** Lapses the application on the facts now (they must break a premise). */
  async function lapse(id: ApplicationId): Promise<Application> {
    const read = await stored(id);
    const result = await run((ctx) =>
      evaluatePremise(ctx, read.entity.target, l.clock.now()),
    );
    if (result.holds) throw new Error("every premise holds");
    return changeApp(id, (a, now) =>
      Behaviour.reassess(
        Behaviour.requireActive(a) as Active<Application>,
        result as never,
        now,
      ),
    );
  }

  async function events(type?: string) {
    return l.events(type);
  }

  /** Events stored after `mark` (`l.mark()`), optionally of one type. */
  async function eventsSince(mark: number, type?: string) {
    const after = await l.since(mark);
    return type === undefined ? after : after.filter((e) => e.type === type);
  }

  /** The photo's owner: `null` for an ownerless stored photo. */
  const photoOwner = l.photoOwner;

  const applicationOwner = (id: ApplicationId) =>
    ({ kind: "application", id }) as const;

  return {
    ...l,
    setupOperator,
    newApplicationId,
    asApplicationId,
    placeWithPhotos,
    getPlace,
    changePlace,
    fieldsOf,
    listing,
    listingInput,
    register,
    revisionInput,
    submitRevision,
    revise,
    claim,
    newListing,
    listingRevisionInput,
    submitListingRev,
    reviseListing,
    stored,
    app,
    findApp,
    changeApp,
    sendBack,
    reject,
    approveStatus,
    registrationApproved,
    withdrawRaw,
    lapse,
    events,
    eventsSince,
    photoOwner,
    applicationOwner,
  };
}

/** An id no application has. */
export const absentApplicationId = (k: Pick<AppKit, "newId">): ApplicationId =>
  ApplicationId.create(k.newId());

/** Asserts that `promise` settles with a lapse on `premises`. */
export async function expectLapsed(
  k: Pick<AppKit, "mark" | "app" | "eventsSince">,
  act: () => Promise<
    Readonly<{
      outcome: string;
      application: Readonly<{ id: ApplicationId }>;
      brokenPremises?: readonly PremiseKey[];
    }>
  >,
  premises: readonly PremiseKey[],
): Promise<void> {
  const mark = await k.mark();
  const result = await act();
  expect(result.outcome).toBe("lapsed");
  expect(result.brokenPremises).toEqual(premises);
  const { id } = result.application;
  expect((await k.app(id)).status).toEqual({
    kind: "lapsed",
    brokenPremises: premises,
  });
  const lapsed = await k.eventsSince(mark, "application.lapsed");
  expect(lapsed.map((e) => e.payload)).toEqual([
    expect.objectContaining({ applicationId: id }),
  ]);
}
