import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import {
  AccountId,
  ApplicationId,
  ListingId,
  OccasionId,
  PhotoId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { IndividualApplicant, PlaceApplicant } from "../applicant";
import type {
  ApplicationFor,
  ApplicationIn,
  FactsFor,
  SpecOfTarget,
  TargetIn,
} from "../kind";
import type { Active, Returned, ReviewAs, UnderReview } from "../status";
import { StewardshipClaim } from "../stewardshipClaim";
import { RejectionReason, ReturnReply, ReturnRequest } from "../texts";
import {
  type AffiliationTarget,
  type LeaveTarget,
  type ListingRevisionTarget,
  type ListingTarget,
  type ParticipationTarget,
  type RegistrationTarget,
  type RevisionTarget,
  type StandInContent,
  type StandInDesired,
  type StandInPatch,
  type StewardshipTarget,
  type TestKindMap,
  TestModel,
} from "./testKinds";

export type TestApplication = ApplicationIn<TestKindMap>;
export type TestTarget = TargetIn<TestKindMap>;
export type TestApplicationOf<K extends keyof TestKindMap> = ApplicationFor<
  TestKindMap[K]
>;

export const T0 = new Date("2026-09-01T00:00:00.000Z");

const { Application, Premise, SubmissionScope } = TestModel;

/**
 * Ids for one test, ascending in mint order, and a clock that ticks one
 * minute per call.
 */
export function applicationIds(start = 0x20_0000) {
  const ids = new FakeIdGenerator(start);
  let clock = T0.getTime();
  return {
    account: (): AccountId => AccountId.create(ids.next()),
    place: (): PlaceId => PlaceId.create(ids.next()),
    region: (): RegionId => RegionId.create(ids.next()),
    occasion: (): OccasionId => OccasionId.create(ids.next()),
    listing: (): ListingId => ListingId.create(ids.next()),
    photo: (): PhotoId => PhotoId.create(ids.next()),
    application: (): ApplicationId => ApplicationId.create(ids.next()),
    tick: (): Date => {
      clock += 60_000;
      return new Date(clock);
    },
  };
}

export type ApplicationIds = ReturnType<typeof applicationIds>;

export const individual = (accountId: AccountId): IndividualApplicant => ({
  kind: "individual",
  accountId,
});
export const asPlace = (placeId: PlaceId): PlaceApplicant => ({
  kind: "place",
  placeId,
});

export const targets = {
  registration: (accountId: AccountId): RegistrationTarget => ({
    kind: "registration",
    applicant: individual(accountId),
  }),
  revision: (accountId: AccountId, placeId: PlaceId): RevisionTarget => ({
    kind: "revision",
    applicant: individual(accountId),
    placeId,
  }),
  stewardship: (
    accountId: AccountId,
    placeId: PlaceId,
    registrationId: ApplicationId | null = null,
  ): StewardshipTarget => ({
    kind: "stewardship",
    applicant: individual(accountId),
    placeId,
    registrationId,
  }),
  /** By a place's steward when `by` is omitted, else by the individual `by`. */
  affiliation: (
    placeId: PlaceId,
    regionId: RegionId,
    by?: AccountId,
  ): AffiliationTarget => ({
    kind: "affiliation",
    applicant: by === undefined ? asPlace(placeId) : individual(by),
    placeId,
    regionId,
  }),
  leave: (
    placeId: PlaceId,
    regionId: RegionId,
    by?: AccountId,
  ): LeaveTarget => ({
    kind: "leave",
    applicant: by === undefined ? asPlace(placeId) : individual(by),
    placeId,
    regionId,
  }),
  participation: (
    placeId: PlaceId,
    occasionId: OccasionId,
  ): ParticipationTarget => ({
    kind: "participation",
    applicant: asPlace(placeId),
    placeId,
    occasionId,
  }),
  listing: (accountId: AccountId, placeId: PlaceId): ListingTarget => ({
    kind: "listing",
    applicant: individual(accountId),
    placeId,
  }),
  listingRevision: (
    accountId: AccountId,
    listingId: ListingId,
  ): ListingRevisionTarget => ({
    kind: "listingRevision",
    applicant: individual(accountId),
    listingId,
  }),
};

/** Facts under which every premise of `target` holds. */
export function holdingFacts<T extends TestTarget>(
  target: T,
): FactsFor<SpecOfTarget<TestKindMap, T>> {
  const byPlace = target.applicant.kind === "place";
  const facts = ((): object => {
    switch (target.kind) {
      case "registration":
        return {};
      case "revision":
      case "listing":
        return { placeHasSteward: false };
      case "stewardship":
        return {
          applicantIsSteward: false,
          registration: target.registrationId === null ? null : "underReview",
        };
      case "affiliation":
        return { placeHasSteward: byPlace, affiliated: false };
      case "leave":
        return { placeHasSteward: byPlace, affiliated: true };
      case "participation":
        return {
          placeHasSteward: true,
          holdingStatus: null,
          participating: false,
        };
      case "listingRevision":
        return { listing: { placeHasSteward: false } };
    }
  })();
  return facts as FactsFor<SpecOfTarget<TestKindMap, T>>;
}

export const holds = <T extends TestTarget>(target: T) =>
  Premise.require(Premise.evaluate(target, holdingFacts(target)));

export const admitted = <T extends TestTarget>(target: T) =>
  SubmissionScope.admit(target, {
    premise: Premise.evaluate(target, holdingFacts(target)),
    unviewable: [],
    activeDuplicate: null,
  });

export const standInContent = (
  name: string,
  photos: readonly PhotoId[] = [],
): StandInContent => ({ name, photos, visibility: "public" });

export const standInPatch = (
  addedPhotos: readonly PhotoId[] = [],
  fields: readonly [string, ...string[]] = ["name"],
): StandInPatch => ({ fields, addedPhotos });

export const standInDesired = (name: string): StandInDesired => ({
  name,
  status: "open",
});

export const claim = (relationship = "店主です", evidence = "03-0000-0000") =>
  StewardshipClaim.create({ relationship, evidence });

type Extras = Readonly<{
  photos?: readonly PhotoId[];
  name?: string;
  reservedPlaceId?: PlaceId;
  reservedListingId?: ListingId;
  placeId?: PlaceId;
  listingIds?: readonly ListingId[];
  dates?: readonly string[];
}>;

/**
 * Submits `target` with stand-in content: `photos` go into the content's
 * photos (registration, listing) or added photos (revisions).
 */
export function submitted<T extends TestTarget>(
  ids: ApplicationIds,
  target: T,
  at: Date = ids.tick(),
  extras: Extras = {},
  id: ApplicationId = ids.application(),
): UnderReview<ApplicationFor<SpecOfTarget<TestKindMap, T>>> {
  const photos = extras.photos ?? [];
  const name = extras.name ?? "喫茶ルント";
  const rest = ((): object => {
    switch (target.kind) {
      case "registration":
        return {
          reserved: { reservedPlaceId: extras.reservedPlaceId ?? ids.place() },
          content: standInContent(name, photos),
        };
      case "revision":
        return {
          reserved: {},
          content: standInPatch(photos),
          desired: standInDesired(name),
        };
      case "stewardship":
        return { reserved: {}, content: claim() };
      case "affiliation":
      case "leave":
        return { reserved: {}, content: null };
      case "participation":
        return {
          reserved: {},
          content: {
            listingIds: extras.listingIds ?? [],
            dates: extras.dates ?? ["2026-10-01"],
          },
        };
      case "listing":
        return {
          reserved: {
            reservedListingId: extras.reservedListingId ?? ids.listing(),
          },
          content: standInContent(name, photos),
        };
      case "listingRevision":
        return {
          reserved: { placeId: extras.placeId ?? ids.place() },
          content: standInPatch(photos),
          desired: standInDesired(name),
        };
    }
  })();
  const params = { id, admission: admitted(target), ...rest } as Parameters<
    typeof Application.submit<T>
  >[0];
  return Application.submit(params, at).entity;
}

export const returnRequest = (text = "営業時間の根拠を添えてください") =>
  ReturnRequest.create(text);
export const reply = (text = "写真を添えました") => ReturnReply.create(text);
export const reason = (text = "確認できませんでした") =>
  RejectionReason.create(text);

export function returned<A extends UnderReview<TestApplication>>(
  app: A,
  at: Date,
) {
  return Application.sendBack(app, "approver", returnRequest(), at).entity;
}

export function resubmitted<A extends Returned<TestApplication>>(
  app: A,
  at: Date,
) {
  const current = app as unknown as TestApplication;
  const amended = {
    content: current.content,
    reply: reply(),
    ...("desired" in current ? { desired: current.desired } : {}),
  } as Parameters<typeof Application.resubmit<A>>[1];
  return Application.resubmit(app, amended, holds(current.target), at).entity;
}

export function approved<A extends UnderReview<TestApplication>>(
  app: A,
  at: Date,
  as: ReviewAs = "approver",
) {
  return Application.approve(
    app,
    as as Parameters<typeof Application.approve<A>>[1],
    holds(app.target),
    at,
  ).entity;
}

export function rejected<A extends UnderReview<TestApplication>>(
  app: A,
  at: Date,
  as: ReviewAs = "approver",
) {
  return Application.reject(
    app,
    as as Parameters<typeof Application.reject<A>>[1],
    reason(),
    at,
  ).entity;
}

export function withdrawn<A extends Active<TestApplication>>(app: A, at: Date) {
  return Application.withdraw(app, at).entity;
}

/**
 * Facts under which `target`'s first premise breaks (the lapse a test
 * needs by default); a registration has none.
 */
export function breakingFacts<T extends TestTarget>(
  target: T,
): FactsFor<SpecOfTarget<TestKindMap, T>> {
  const byPlace = target.applicant.kind === "place";
  const facts = ((): object => {
    switch (target.kind) {
      case "registration":
        throw new Error("A registration has no premise to break");
      case "revision":
      case "listing":
        return { placeHasSteward: true };
      case "stewardship":
        return {
          applicantIsSteward: true,
          registration: target.registrationId === null ? null : "underReview",
        };
      case "affiliation":
        return { placeHasSteward: !byPlace, affiliated: false };
      case "leave":
        return { placeHasSteward: !byPlace, affiliated: true };
      case "participation":
        return {
          placeHasSteward: true,
          holdingStatus: "ended",
          participating: false,
        };
      case "listingRevision":
        return { listing: null };
    }
  })();
  return facts as FactsFor<SpecOfTarget<TestKindMap, T>>;
}

/** Lapses `app` on `facts` (its first premise broken by default). */
export function lapsed<A extends Active<TestApplication>>(
  app: A,
  at: Date,
  facts?: object,
) {
  const target: TestTarget = app.target;
  const result = Premise.evaluate(
    target,
    (facts ?? breakingFacts(target)) as FactsFor<
      SpecOfTarget<TestKindMap, TestTarget>
    >,
  );
  if (result.holds) throw new Error("The facts hold every premise");
  return Application.reassess(
    app,
    result as Parameters<typeof Application.reassess<A>>[1],
    at,
  ).entity;
}

/** Narrows a read application to kind `K`, failing the test otherwise. */
export function ofKind<K extends keyof TestKindMap>(
  app: TestApplication,
  kind: K,
): TestApplicationOf<K> {
  if (app.target.kind !== kind) {
    throw new Error(`Expected a ${kind}, read a ${app.target.kind}`);
  }
  return app as TestApplicationOf<K>;
}
