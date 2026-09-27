import {
  AccountId,
  ApplicationId,
  ListingId,
  OccasionId,
  PhotoId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type {
  Applicant,
  IndividualApplicant,
  PlaceApplicant,
} from "../applicant";
import { sameData } from "../canonical";
import { defineKind, type JsonValue, type KindRegistry } from "../kind";
import { createApplicationModel } from "../model";
import type { PremiseRule } from "../premise";
import type { ApplicationStatusKind } from "../status";
import { StewardshipClaim } from "../stewardshipClaim";

/**
 * Test-only application kinds. Stage 1 registers no production kind (their
 * contents and premises read domains of later stages), so the core's
 * domain tests and the port conformance suites run over these. They keep
 * the spec's eight target shapes, premises (`spec/domains/application.md`
 * 「Premise」), seats, slots, subjects and submission comparisons exactly;
 * only the contents are stand-ins (a name, photos, a field list) for the
 * later domains' values. A stage that registers a real kind can take its
 * definition from here and replace the stand-in content.
 */

type None = Readonly<Record<never, never>>;

/** Stand-in for a place profile / listing content: a name and photos. */
export type StandInContent = Readonly<{
  name: string;
  photos: readonly PhotoId[];
  /** Stand-in for how widely the content is shown (見せる範囲). */
  visibility: string;
}>;

/** Stand-in for a `FieldPatch`: the changed fields and the photos it adds. */
export type StandInPatch = Readonly<{
  fields: readonly [string, ...string[]];
  addedPhotos: readonly PhotoId[];
}>;

/** Stand-in for `PlaceState` / `ListingContent`, the desired content. */
export type StandInDesired = Readonly<{ name: string; status: string }>;

/** Stand-in for Occasion's `HoldingStatus`. */
export type StandInHolding = "upcoming" | "holding" | "ended" | "cancelled";

/** Stand-in for `ParticipationDetails`. */
export type StandInParticipation = Readonly<{
  listingIds: readonly ListingId[];
  dates: readonly string[];
}>;

export type RegistrationTarget = Readonly<{
  kind: "registration";
  applicant: IndividualApplicant;
}>;
export type RevisionTarget = Readonly<{
  kind: "revision";
  applicant: IndividualApplicant;
  placeId: PlaceId;
}>;
export type StewardshipTarget = Readonly<{
  kind: "stewardship";
  applicant: IndividualApplicant;
  placeId: PlaceId;
  registrationId: ApplicationId | null;
}>;
export type AffiliationTarget = Readonly<{
  kind: "affiliation";
  applicant: Applicant;
  placeId: PlaceId;
  regionId: RegionId;
}>;
export type LeaveTarget = Readonly<{
  kind: "leave";
  applicant: Applicant;
  placeId: PlaceId;
  regionId: RegionId;
}>;
export type ParticipationTarget = Readonly<{
  kind: "participation";
  applicant: PlaceApplicant;
  placeId: PlaceId;
  occasionId: OccasionId;
}>;
export type ListingTarget = Readonly<{
  kind: "listing";
  applicant: IndividualApplicant;
  placeId: PlaceId;
}>;
export type ListingRevisionTarget = Readonly<{
  kind: "listingRevision";
  applicant: IndividualApplicant;
  listingId: ListingId;
}>;

type PlaceFacts = Readonly<{ placeHasSteward: boolean }>;
type AffiliationFacts = Readonly<{
  placeHasSteward: boolean;
  affiliated: boolean;
}>;

export type TestKindMap = {
  registration: {
    target: RegistrationTarget;
    content: StandInContent;
    reserved: Readonly<{ reservedPlaceId: PlaceId }>;
    desired: None;
    premiseKey: never;
    facts: None;
    seat: "operator";
    awaitsRegistration: false;
    slot: null;
    request: Readonly<{ target: RegistrationTarget; content: StandInContent }>;
  };
  revision: {
    target: RevisionTarget;
    content: StandInPatch;
    reserved: None;
    desired: Readonly<{ desired: StandInDesired }>;
    premiseKey: "placeHasNoSteward";
    facts: PlaceFacts;
    seat: "operator";
    awaitsRegistration: false;
    slot: RevisionTarget;
    request: Readonly<{ target: RevisionTarget; desired: StandInDesired }>;
  };
  stewardship: {
    target: StewardshipTarget;
    content: StewardshipClaim;
    reserved: None;
    desired: None;
    premiseKey: "applicantNotSteward" | "registrationStanding";
    facts: Readonly<{
      applicantIsSteward: boolean;
      registration: ApplicationStatusKind | null;
    }>;
    seat: "operator";
    awaitsRegistration: true;
    slot: Readonly<{
      kind: "stewardship";
      applicant: IndividualApplicant;
      placeId: PlaceId;
    }>;
    request: Readonly<{ target: StewardshipTarget; content: StewardshipClaim }>;
  };
  affiliation: {
    target: AffiliationTarget;
    content: null;
    reserved: None;
    desired: None;
    premiseKey: "placeHasNoSteward" | "placeHasSteward" | "notAffiliated";
    facts: AffiliationFacts;
    seat: "steward";
    awaitsRegistration: false;
    slot: AffiliationTarget;
    request: Readonly<{ target: AffiliationTarget }>;
  };
  leave: {
    target: LeaveTarget;
    content: null;
    reserved: None;
    desired: None;
    premiseKey: "placeHasNoSteward" | "placeHasSteward" | "affiliated";
    facts: AffiliationFacts;
    seat: "steward";
    awaitsRegistration: false;
    slot: LeaveTarget;
    request: Readonly<{ target: LeaveTarget }>;
  };
  participation: {
    target: ParticipationTarget;
    content: StandInParticipation;
    reserved: None;
    desired: None;
    premiseKey: "placeHasSteward" | "occasionOpen" | "notParticipating";
    facts: Readonly<{
      placeHasSteward: boolean;
      holdingStatus: StandInHolding | null;
      participating: boolean;
    }>;
    seat: "steward";
    awaitsRegistration: false;
    slot: ParticipationTarget;
    request: Readonly<{
      target: ParticipationTarget;
      listingIds: readonly ListingId[];
      dates: readonly string[];
    }>;
  };
  listing: {
    target: ListingTarget;
    content: StandInContent;
    reserved: Readonly<{ reservedListingId: ListingId }>;
    desired: None;
    premiseKey: "placeHasNoSteward";
    facts: PlaceFacts;
    seat: "operator";
    awaitsRegistration: false;
    slot: null;
    request: Readonly<{ target: ListingTarget; content: StandInContent }>;
  };
  listingRevision: {
    target: ListingRevisionTarget;
    content: StandInPatch;
    reserved: Readonly<{ placeId: PlaceId }>;
    desired: Readonly<{ desired: StandInDesired }>;
    premiseKey: "placeHasNoSteward" | "listingExists";
    facts: Readonly<{ listing: PlaceFacts | null }>;
    seat: "operator";
    awaitsRegistration: false;
    slot: ListingRevisionTarget;
    request: Readonly<{
      target: ListingRevisionTarget;
      desired: StandInDesired;
    }>;
  };
};

// --- JSON reading helpers (throw on anything malformed) ------------------

type Json = Readonly<Record<string, JsonValue>>;

function object(value: JsonValue | undefined): Json {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object");
  }
  return value as Json;
}

function text(value: JsonValue | undefined): string {
  if (typeof value !== "string") throw new Error("Expected a string");
  return value;
}

function list(value: JsonValue | undefined): readonly JsonValue[] {
  if (!Array.isArray(value)) throw new Error("Expected an array");
  return value;
}

function nonEmpty<T>(items: readonly T[]): readonly [T, ...T[]] {
  const [first, ...rest] = items;
  if (first === undefined) throw new Error("Expected a non-empty list");
  return [first, ...rest];
}

function applicantOf(value: JsonValue | undefined): Applicant {
  const raw = object(value);
  if (raw.kind === "individual") {
    return {
      kind: "individual",
      accountId: AccountId.create(text(raw.accountId)),
    };
  }
  if (raw.kind === "place") {
    return { kind: "place", placeId: PlaceId.create(text(raw.placeId)) };
  }
  throw new Error("Unknown applicant");
}

function individualOf(value: JsonValue | undefined): IndividualApplicant {
  const applicant = applicantOf(value);
  if (applicant.kind !== "individual") throw new Error("Not an individual");
  return applicant;
}

function placeApplicantOf(
  value: JsonValue | undefined,
  placeId: PlaceId,
): PlaceApplicant {
  const applicant = applicantOf(value);
  if (applicant.kind !== "place" || applicant.placeId !== placeId) {
    throw new Error("Not the place's own application");
  }
  return applicant;
}

/** An application made as a steward must name its own place (byPlace). */
function affiliationApplicantOf(
  value: JsonValue | undefined,
  placeId: PlaceId,
): Applicant {
  const applicant = applicantOf(value);
  if (applicant.kind === "place" && applicant.placeId !== placeId) {
    throw new Error("A place applicant for another place");
  }
  return applicant;
}

function contentOf(value: JsonValue | undefined): StandInContent {
  const raw = object(value);
  return {
    name: text(raw.name),
    photos: list(raw.photos).map((photo) => PhotoId.create(text(photo))),
    visibility: text(raw.visibility),
  };
}

function patchOf(value: JsonValue | undefined): StandInPatch {
  const raw = object(value);
  return {
    fields: nonEmpty(list(raw.fields).map(text)),
    addedPhotos: list(raw.addedPhotos).map((photo) =>
      PhotoId.create(text(photo)),
    ),
  };
}

function desiredOf(value: JsonValue | undefined): StandInDesired {
  const raw = object(value);
  return { name: text(raw.name), status: text(raw.status) };
}

const json = (value: unknown): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue;

const unique = <T>(items: readonly T[]): readonly T[] => [...new Set(items)];

const individualOnly = (target: Readonly<{ applicant: Applicant }>): boolean =>
  target.applicant.kind === "individual";
const placeOnly = (target: Readonly<{ applicant: Applicant }>): boolean =>
  target.applicant.kind === "place";

// --- Definitions ------------------------------------------------------------

const registration = defineKind<TestKindMap["registration"]>({
  kind: "registration",
  seat: "operator",
  awaitsRegistration: false,
  premises: [],
  seatOf: () => ({ kind: "operator" }),
  slotOf: () => null,
  submissionTargets: () => [],
  subjects: (c) => [{ kind: "place", id: c.reservedPlaceId }],
  reflectedRef: (c) => ({ kind: "place", id: c.reservedPlaceId }),
  ownedPhotoIds: (c) => c.content.photos,
  matchesSubmission: (c, request) =>
    sameData(c.target, request.target) && sameData(c.content, request.content),
  snapshot: (c) => json(c),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = object(raw.target);
    if (target.kind !== "registration") throw new Error("Not a registration");
    return {
      target: {
        kind: "registration",
        applicant: individualOf(target.applicant),
      },
      reservedPlaceId: PlaceId.create(text(raw.reservedPlaceId)),
      content: contentOf(raw.content),
    };
  },
});

const revision = defineKind<TestKindMap["revision"]>({
  kind: "revision",
  seat: "operator",
  awaitsRegistration: false,
  premises: [
    { key: "placeHasNoSteward", holds: (facts) => !facts.placeHasSteward },
  ],
  seatOf: () => ({ kind: "operator" }),
  slotOf: (target) => target,
  submissionTargets: (target) => [{ kind: "place", id: target.placeId }],
  subjects: (c) => [{ kind: "place", id: c.target.placeId }],
  reflectedRef: (c) => ({ kind: "place", id: c.target.placeId }),
  ownedPhotoIds: (c) => c.content.addedPhotos,
  matchesSubmission: (c, request) =>
    sameData(c.target, request.target) && sameData(c.desired, request.desired),
  snapshot: (c) => json(c),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = object(raw.target);
    if (target.kind !== "revision") throw new Error("Not a revision");
    return {
      target: {
        kind: "revision",
        applicant: individualOf(target.applicant),
        placeId: PlaceId.create(text(target.placeId)),
      },
      content: patchOf(raw.content),
      desired: desiredOf(raw.desired),
    };
  },
});

const stewardship = defineKind<TestKindMap["stewardship"]>({
  kind: "stewardship",
  seat: "operator",
  awaitsRegistration: true,
  premises: [
    { key: "applicantNotSteward", holds: (facts) => !facts.applicantIsSteward },
    {
      key: "registrationStanding",
      appliesTo: (target) => target.registrationId !== null,
      holds: (facts) =>
        facts.registration === "underReview" ||
        facts.registration === "returned" ||
        facts.registration === "approved",
    },
  ],
  seatOf: () => ({ kind: "operator" }),
  slotOf: (target) => ({
    kind: "stewardship",
    applicant: target.applicant,
    placeId: target.placeId,
  }),
  submissionTargets: (target) =>
    target.registrationId === null
      ? [{ kind: "place", id: target.placeId }]
      : [],
  subjects: (c) =>
    c.target.registrationId === null
      ? [{ kind: "place", id: c.target.placeId }]
      : [
          { kind: "place", id: c.target.placeId },
          { kind: "registration", id: c.target.registrationId },
        ],
  reflectedRef: (c) => ({ kind: "place", id: c.target.placeId }),
  ownedPhotoIds: () => [],
  matchesSubmission: (c, request) =>
    sameData(c.target.applicant, request.target.applicant) &&
    c.target.placeId === request.target.placeId &&
    StewardshipClaim.equals(c.content, request.content),
  snapshot: (c) => json(c),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = object(raw.target);
    if (target.kind !== "stewardship") throw new Error("Not a stewardship");
    const content = object(raw.content);
    const claim = StewardshipClaim.create({
      relationship: text(content.relationship),
      evidence: text(content.evidence),
    });
    if (!sameData(claim, content)) throw new Error("Claim not normalized");
    return {
      target: {
        kind: "stewardship",
        applicant: individualOf(target.applicant),
        placeId: PlaceId.create(text(target.placeId)),
        registrationId:
          target.registrationId === null
            ? null
            : ApplicationId.create(text(target.registrationId)),
      },
      content: claim,
    };
  },
});

function affiliationLike<
  K extends "affiliation" | "leave",
  P extends "notAffiliated" | "affiliated",
>(kind: K, membership: P) {
  type Target = Readonly<{
    kind: K;
    applicant: Applicant;
    placeId: PlaceId;
    regionId: RegionId;
  }>;
  return {
    kind,
    seat: "steward" as const,
    awaitsRegistration: false as const,
    premises: [
      {
        key: "placeHasNoSteward",
        appliesTo: individualOnly,
        holds: (facts: AffiliationFacts) => !facts.placeHasSteward,
      },
      {
        key: "placeHasSteward",
        appliesTo: placeOnly,
        holds: (facts: AffiliationFacts) => facts.placeHasSteward,
      },
      {
        key: membership,
        holds: (facts: AffiliationFacts) =>
          membership === "affiliated" ? facts.affiliated : !facts.affiliated,
      },
    ] as readonly PremiseRule<
      Target,
      AffiliationFacts,
      "placeHasNoSteward" | "placeHasSteward" | P
    >[],
    seatOf: (target: Target) => ({
      kind: "steward" as const,
      target: { kind: "region" as const, id: target.regionId },
    }),
    slotOf: (target: Target) => target,
    subjects: (c: Readonly<{ target: Target }>) => [
      { kind: "place" as const, id: c.target.placeId },
      { kind: "region" as const, id: c.target.regionId },
    ],
    reflectedRef: (c: Readonly<{ target: Target }>) => ({
      kind: "region" as const,
      id: c.target.regionId,
    }),
    ownedPhotoIds: () => [],
    matchesSubmission: (
      c: Readonly<{ target: Target }>,
      request: Readonly<{ target: Target }>,
    ) => sameData(c.target, request.target),
    snapshot: (c: Readonly<{ target: Target; content: null }>) => json(c),
    reconstruct: (snapshot: JsonValue) => {
      const raw = object(snapshot);
      const target = object(raw.target);
      if (target.kind !== kind) throw new Error(`Not a ${kind}`);
      if (raw.content !== null) throw new Error("Unexpected content");
      const placeId = PlaceId.create(text(target.placeId));
      return {
        target: {
          kind,
          applicant: affiliationApplicantOf(target.applicant, placeId),
          placeId,
          regionId: RegionId.create(text(target.regionId)),
        } as Target,
        content: null,
      };
    },
  };
}

const affiliation = defineKind<TestKindMap["affiliation"]>({
  ...affiliationLike("affiliation", "notAffiliated"),
  submissionTargets: (target) =>
    target.applicant.kind === "individual"
      ? [
          { kind: "place", id: target.placeId },
          { kind: "region", id: target.regionId },
        ]
      : [{ kind: "region", id: target.regionId }],
});

const leave = defineKind<TestKindMap["leave"]>({
  ...affiliationLike("leave", "affiliated"),
  submissionTargets: (target) =>
    target.applicant.kind === "individual"
      ? [
          { kind: "place", id: target.placeId },
          { kind: "region", id: target.regionId },
        ]
      : [],
});

const participation = defineKind<TestKindMap["participation"]>({
  kind: "participation",
  seat: "steward",
  awaitsRegistration: false,
  premises: [
    { key: "placeHasSteward", holds: (facts) => facts.placeHasSteward },
    {
      key: "occasionOpen",
      holds: (facts) =>
        facts.holdingStatus !== "ended" && facts.holdingStatus !== "cancelled",
    },
    { key: "notParticipating", holds: (facts) => !facts.participating },
  ],
  seatOf: (target) => ({
    kind: "steward",
    target: { kind: "occasion", id: target.occasionId },
  }),
  slotOf: (target) => target,
  submissionTargets: (target) => [{ kind: "occasion", id: target.occasionId }],
  subjects: (c) => [
    { kind: "place", id: c.target.placeId },
    { kind: "occasion", id: c.target.occasionId },
  ],
  reflectedRef: (c) => ({ kind: "occasion", id: c.target.occasionId }),
  ownedPhotoIds: () => [],
  matchesSubmission: (c, request) =>
    sameData(c.target, request.target) &&
    sameData(c.content.listingIds, unique(request.listingIds)) &&
    sameData(c.content.dates, [...unique(request.dates)].sort()),
  snapshot: (c) => json(c),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = object(raw.target);
    if (target.kind !== "participation") throw new Error("Not a participation");
    const placeId = PlaceId.create(text(target.placeId));
    const content = object(raw.content);
    return {
      target: {
        kind: "participation",
        applicant: placeApplicantOf(target.applicant, placeId),
        placeId,
        occasionId: OccasionId.create(text(target.occasionId)),
      },
      content: {
        listingIds: list(content.listingIds).map((id) =>
          ListingId.create(text(id)),
        ),
        dates: list(content.dates).map(text),
      },
    };
  },
});

const listing = defineKind<TestKindMap["listing"]>({
  kind: "listing",
  seat: "operator",
  awaitsRegistration: false,
  premises: [
    { key: "placeHasNoSteward", holds: (facts) => !facts.placeHasSteward },
  ],
  seatOf: () => ({ kind: "operator" }),
  slotOf: () => null,
  submissionTargets: (target) => [{ kind: "place", id: target.placeId }],
  subjects: (c) => [{ kind: "place", id: c.target.placeId }],
  reflectedRef: (c) => ({ kind: "listing", id: c.reservedListingId }),
  ownedPhotoIds: (c) => c.content.photos,
  matchesSubmission: (c, request) =>
    sameData(c.target, request.target) && sameData(c.content, request.content),
  snapshot: (c) => json(c),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = object(raw.target);
    if (target.kind !== "listing") throw new Error("Not a listing");
    return {
      target: {
        kind: "listing",
        applicant: individualOf(target.applicant),
        placeId: PlaceId.create(text(target.placeId)),
      },
      reservedListingId: ListingId.create(text(raw.reservedListingId)),
      content: contentOf(raw.content),
    };
  },
});

const listingRevision = defineKind<TestKindMap["listingRevision"]>({
  kind: "listingRevision",
  seat: "operator",
  awaitsRegistration: false,
  premises: [
    {
      key: "placeHasNoSteward",
      holds: (facts) =>
        facts.listing === null || !facts.listing.placeHasSteward,
    },
    { key: "listingExists", holds: (facts) => facts.listing !== null },
  ],
  seatOf: () => ({ kind: "operator" }),
  slotOf: (target) => target,
  submissionTargets: (target) => [{ kind: "listing", id: target.listingId }],
  subjects: (c) => [
    { kind: "place", id: c.placeId },
    { kind: "listing", id: c.target.listingId },
  ],
  reflectedRef: (c) => ({ kind: "listing", id: c.target.listingId }),
  ownedPhotoIds: (c) => c.content.addedPhotos,
  matchesSubmission: (c, request) =>
    sameData(c.target, request.target) && sameData(c.desired, request.desired),
  snapshot: (c) => json(c),
  reconstruct: (snapshot) => {
    const raw = object(snapshot);
    const target = object(raw.target);
    if (target.kind !== "listingRevision") {
      throw new Error("Not a listing revision");
    }
    return {
      target: {
        kind: "listingRevision",
        applicant: individualOf(target.applicant),
        listingId: ListingId.create(text(target.listingId)),
      },
      placeId: PlaceId.create(text(raw.placeId)),
      content: patchOf(raw.content),
      desired: desiredOf(raw.desired),
    };
  },
});

export const TEST_KINDS: KindRegistry<TestKindMap> = {
  registration,
  revision,
  stewardship,
  affiliation,
  leave,
  participation,
  listing,
  listingRevision,
};

/** The Application domain bound to the test-only kinds. */
export const TestModel = createApplicationModel(TEST_KINDS);
