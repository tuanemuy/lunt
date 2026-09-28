import { FieldPatch } from "@repo/core/domain/common/fieldPatch";
import {
  type ApplicationId,
  type CategoryId,
  CategoryId as CategoryIdValue,
  type ListingId,
  type PhotoId,
  type PlaceId,
} from "@repo/core/domain/common/ids";
import {
  ListingContent,
  type ListingContentInput,
} from "@repo/core/domain/listing/content";
import { ListingPatch } from "@repo/core/domain/listing/patch";
import { PlaceProfile } from "@repo/core/domain/place/profile";
import {
  PlaceRevision,
  type PlaceState,
} from "@repo/core/domain/place/revision";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import {
  type Application,
  ApplicationTarget,
  applicationModel,
  type TargetOf,
} from "../application";
import type { ApplicationFor, JsonValue } from "../kind";
import type { ApplicationKindMap } from "../kinds";
import type { UnderReview } from "../status";
import { StewardshipClaim } from "../stewardshipClaim";
import { ReturnReply } from "../texts";
import { applicationIds, individual } from "./fixtures";
import { describeKindContract, type KindCase } from "./kindContract";

/**
 * The spec's per-kind tables (`spec/domains/application.md` 「Premise」
 * 「SubmissionScope」「ApproverPolicy.seatOf」「ApplicationSubject」
 * 「SubmissionRequest」「種類ごとの内容」「ApplicationCase.ownedPhotoIds」),
 * stated for the production kinds with Place's and Listing's real values.
 */
const { Application: App, Premise, SubmissionScope } = applicationModel;

const ids = applicationIds();
const a = ids.account();
const b = ids.account();
const p = ids.place();
const l = ids.listing();
const [photo1, photo2, photo3] = [ids.photo(), ids.photo(), ids.photo()];
const category = CategoryIdValue.create("category-1");

const place = { kind: "place", id: p } as const;
const operator = { kind: "operator" } as const;

const profile = (
  name: string,
  photoIds: readonly PhotoId[] = [],
  contact: string | null = null,
): PlaceProfile =>
  PlaceProfile.create({
    name,
    photoIds,
    description: null,
    address: SampleAddress.otemachi(),
    location: { latitude: 35.68, longitude: 139.76 },
    businessHours: null,
    contact,
  });

const state = (
  name: string,
  photoIds: readonly PhotoId[] = [],
  operatingStatus: PlaceState["operatingStatus"] = "open",
): PlaceState => ({ profile: profile(name, photoIds), operatingStatus });

const listingContent = (
  name: string | null,
  photos: readonly PhotoId[],
  categoryId: CategoryId | null = category,
  overrides: Partial<ListingContentInput> = {},
): ListingContent =>
  ListingContent.create({
    name,
    description: "説明",
    categoryId,
    photos: photos.map((photoId, i) => ({
      photoId,
      framing: i === 0 ? { x: 0, y: 0, width: 0.5, height: 0.5 } : null,
    })),
    offering: { kind: "period", start: "2026-10-01", end: null },
    ...overrides,
  });

const claim = (relationship = "店主です", evidence = "03-0000-0000") =>
  StewardshipClaim.create({ relationship, evidence });

const facts = {
  holding: { placeHasSteward: false },
  stewarded: { placeHasSteward: true },
} as const;

function submit<K extends keyof ApplicationKindMap>(
  target: TargetOf<K>,
  rest: Readonly<Record<string, unknown>>,
  premiseFacts: object,
  id: ApplicationId = ids.application(),
): UnderReview<ApplicationFor<ApplicationKindMap[K]>> {
  const admission = SubmissionScope.admit(target, {
    premise: Premise.evaluate(
      target,
      premiseFacts as Parameters<typeof Premise.evaluate<TargetOf<K>>>[1],
    ),
    unviewable: [],
    activeDuplicate: null,
  });
  const params = { id, admission, reserved: {}, ...rest } as Parameters<
    typeof App.submit<TargetOf<K>>
  >[0];
  return App.submit(params, ids.tick()).entity as unknown as UnderReview<
    ApplicationFor<ApplicationKindMap[K]>
  >;
}

const byIndividual = ApplicationTarget.byIndividual;

// Registration
const registrationTarget = byIndividual(a, { kind: "registration" });
const reservedPlaceId: PlaceId = ids.place();
const registration = submit<"registration">(
  registrationTarget,
  {
    reserved: { reservedPlaceId },
    content: profile("登録する店", [photo1, photo2]),
  },
  {},
);

// Revision: the place now holds photo1; the revision adds photo2.
const current = state("元の名前", [photo1]);
const desiredState = state("修正後の名前", [photo1, photo2]);
const revisionTarget = byIndividual(a, { kind: "revision", placeId: p });
const revision = submit<"revision">(
  revisionTarget,
  {
    content: PlaceRevision.between(current, desiredState),
    desired: desiredState,
  },
  facts.holding,
);

// Stewardship: an ordinary claim, and one filed with the registration.
const stewardship = submit<"stewardship">(
  byIndividual(a, { kind: "stewardship", placeId: p }),
  { content: claim() },
  { applicantIsSteward: false, registration: null },
);
const companionTarget = ApplicationTarget.companion(registration, a);
if (companionTarget === null) throw new Error("no companion");
const companion = submit<"stewardship">(
  companionTarget,
  { content: claim() },
  { applicantIsSteward: false, registration: "underReview" },
);

// Listing
const reservedListingId: ListingId = ids.listing();
const listingTarget = byIndividual(a, { kind: "listing", placeId: p });
const entered = listingContent("新しい掲載", [photo2, photo3]);
const listing = submit<"listing">(
  listingTarget,
  {
    reserved: { reservedListingId },
    content: ListingContent.toPublishable(entered),
  },
  facts.holding,
);

// Listing revision: the listing holds photo1; the revision adds photo3.
const listingNow = listingContent("元の掲載", [photo1]);
const listingDesired = listingContent("直した掲載", [photo3, photo1]);
const listingRevisionTarget = byIndividual(a, {
  kind: "listingRevision",
  listingId: l,
});
const listingRevision = submit<"listingRevision">(
  listingRevisionTarget,
  {
    reserved: { placeId: p },
    content: ListingPatch.between(
      listingNow,
      ListingContent.toPublishable(listingDesired),
    ),
    desired: listingDesired,
  },
  { listing: { placeHasSteward: false } },
);

const reply = ReturnReply.create("写真を添えました");

const cases: readonly KindCase<ApplicationKindMap>[] = [
  {
    label: "登録",
    application: registration,
    required: [],
    evaluations: [{ facts: {}, broken: [] }],
    seat: operator,
    submissionTargets: [],
    slot: null,
    subjects: [{ kind: "place", id: reservedPlaceId }],
    reflectedRef: { kind: "place", id: reservedPlaceId },
    ownedPhotoIds: [photo1, photo2],
    registrationOf: null,
    contentNames: [
      { ref: { kind: "place", id: reservedPlaceId }, name: "登録する店" },
    ],
    matching: [
      {
        target: registrationTarget,
        content: profile("登録する店", [photo1, photo2]),
      },
    ],
    differing: [
      {
        target: registrationTarget,
        content: profile("別の店", [photo1, photo2]),
      },
      {
        target: registrationTarget,
        content: profile("登録する店", [photo2, photo1]),
      },
      {
        target: byIndividual(b, { kind: "registration" }),
        content: registration.content,
      },
    ],
    amendment: { content: profile("直した店", [photo2]), reply },
  },
  {
    label: "情報修正",
    application: revision,
    required: ["placeHasNoSteward"],
    evaluations: [
      { facts: facts.holding, broken: [] },
      { facts: facts.stewarded, broken: ["placeHasNoSteward"] },
    ],
    seat: operator,
    submissionTargets: [place],
    slot: revisionTarget,
    subjects: [place],
    reflectedRef: place,
    ownedPhotoIds: [photo2],
    registrationOf: null,
    contentNames: [],
    matching: [
      {
        target: revisionTarget,
        desired: state("修正後の名前", [photo1, photo2]),
      },
    ],
    differing: [
      { target: revisionTarget, desired: state("別の名前", [photo1, photo2]) },
      {
        target: revisionTarget,
        desired: state("修正後の名前", [photo1, photo2], "temporarilyClosed"),
      },
      {
        target: byIndividual(b, { kind: "revision", placeId: p }),
        desired: desiredState,
      },
    ],
    amendment: {
      content: PlaceRevision.between(
        current,
        state("元の名前", [photo1], "permanentlyClosed"),
      ),
      reply: null,
      desired: state("元の名前", [photo1], "permanentlyClosed"),
    },
  },
  {
    label: "管理権限",
    application: stewardship,
    required: ["applicantNotSteward"],
    evaluations: [
      { facts: { applicantIsSteward: false, registration: null }, broken: [] },
      {
        facts: { applicantIsSteward: true, registration: null },
        broken: ["applicantNotSteward"],
      },
    ],
    seat: operator,
    submissionTargets: [place],
    slot: { kind: "stewardship", applicant: individual(a), placeId: p },
    subjects: [place],
    reflectedRef: place,
    ownedPhotoIds: [],
    registrationOf: null,
    contentNames: [],
    matching: [{ target: stewardship.target, content: claim() }],
    differing: [
      { target: stewardship.target, content: claim("常連です") },
      {
        target: byIndividual(b, { kind: "stewardship", placeId: p }),
        content: claim(),
      },
    ],
    amendment: { content: claim("店長です"), reply },
  },
  {
    label: "併せた管理権限",
    application: companion,
    required: ["applicantNotSteward", "registrationStanding"],
    evaluations: [
      {
        facts: { applicantIsSteward: false, registration: "underReview" },
        broken: [],
      },
      {
        facts: { applicantIsSteward: false, registration: "returned" },
        broken: [],
      },
      {
        facts: { applicantIsSteward: false, registration: "approved" },
        broken: [],
      },
      {
        facts: { applicantIsSteward: false, registration: "rejected" },
        broken: ["registrationStanding"],
      },
      {
        facts: { applicantIsSteward: false, registration: "withdrawn" },
        broken: ["registrationStanding"],
      },
      {
        facts: { applicantIsSteward: true, registration: "lapsed" },
        broken: ["applicantNotSteward", "registrationStanding"],
      },
    ],
    seat: operator,
    submissionTargets: [],
    slot: {
      kind: "stewardship",
      applicant: individual(a),
      placeId: reservedPlaceId,
    },
    subjects: [
      { kind: "place", id: reservedPlaceId },
      { kind: "registration", id: registration.id },
    ],
    reflectedRef: { kind: "place", id: reservedPlaceId },
    ownedPhotoIds: [],
    registrationOf: registration.id,
    contentNames: [],
    matching: [
      { target: companionTarget, content: claim() },
      {
        target: byIndividual(a, {
          kind: "stewardship",
          placeId: reservedPlaceId,
        }),
        content: claim(),
      },
    ],
    differing: [{ target: companionTarget, content: claim("常連です") }],
    amendment: { content: claim(), reply: null },
  },
  {
    label: "掲載",
    application: listing,
    required: ["placeHasNoSteward"],
    evaluations: [
      { facts: facts.holding, broken: [] },
      { facts: facts.stewarded, broken: ["placeHasNoSteward"] },
    ],
    seat: operator,
    submissionTargets: [place],
    slot: null,
    subjects: [place],
    reflectedRef: { kind: "listing", id: reservedListingId },
    ownedPhotoIds: [photo2, photo3],
    registrationOf: null,
    contentNames: [
      { ref: { kind: "listing", id: reservedListingId }, name: "新しい掲載" },
    ],
    matching: [
      {
        target: listingTarget,
        content: listingContent("新しい掲載", [photo2, photo3]),
      },
    ],
    differing: [
      {
        target: listingTarget,
        content: listingContent("新しい掲載", [photo2, photo3], category, {
          photos: [
            { photoId: photo2, framing: null },
            { photoId: photo3, framing: null },
          ],
        }),
      },
      {
        target: listingTarget,
        content: listingContent("新しい掲載", [photo2, photo3], category, {
          offering: { kind: "none" },
        }),
      },
    ],
    amendment: {
      content: ListingContent.toPublishable(
        listingContent("直した掲載", [photo3]),
      ),
      reply: null,
    },
  },
  {
    label: "掲載の修正",
    application: listingRevision,
    required: ["placeHasNoSteward", "listingExists"],
    evaluations: [
      { facts: { listing: { placeHasSteward: false } }, broken: [] },
      // With the listing gone its place is unknown, so that premise holds.
      { facts: { listing: null }, broken: ["listingExists"] },
      {
        facts: { listing: { placeHasSteward: true } },
        broken: ["placeHasNoSteward"],
      },
    ],
    seat: operator,
    submissionTargets: [{ kind: "listing", id: l }],
    slot: listingRevisionTarget,
    subjects: [place, { kind: "listing", id: l }],
    reflectedRef: { kind: "listing", id: l },
    ownedPhotoIds: [photo3],
    registrationOf: null,
    contentNames: [],
    matching: [
      {
        target: listingRevisionTarget,
        desired: listingContent("直した掲載", [photo3, photo1]),
      },
    ],
    differing: [
      {
        target: listingRevisionTarget,
        desired: listingContent("直した掲載", [photo1, photo3]),
      },
      {
        target: byIndividual(b, { kind: "listingRevision", listingId: l }),
        desired: listingDesired,
      },
    ],
    amendment: {
      content: ListingPatch.between(
        listingNow,
        ListingContent.toPublishable(listingContent("元の掲載", [photo2])),
      ),
      reply,
      desired: listingContent("元の掲載", [photo2]),
    },
  },
];

describeKindContract("production kinds (S2B)", applicationModel, cases);

describe("production kinds: contents", () => {
  const snapshotOf = (app: Application) => App.snapshot(app);

  it("stores only the revision's changed items, in the schema's order", () => {
    expect(FieldPatch.fields(revision.content)).toEqual(["name", "photos"]);
    expect(FieldPatch.fields(listingRevision.content)).toEqual([
      "name",
      "photos",
    ]);
  });

  it("refuses stored contents its value objects refuse", () => {
    const stored = snapshotOf(listing);
    const tampered = {
      ...stored,
      case: {
        ...(stored.case as object),
        content: {
          ...((stored.case as { content: object }).content as object),
          photos: [],
        },
      },
    };
    expect(() => App.reconstruct(tampered)).toThrow(/violates invariants/);
    const reordered = snapshotOf(revision);
    const changes = (reordered.case as { content: readonly JsonValue[] })
      .content;
    expect(() =>
      App.reconstruct({
        ...reordered,
        case: {
          ...(reordered.case as object),
          content: [...changes].reverse(),
        },
      }),
    ).toThrow(/violates invariants/);
  });

  it("builds an individual's targets and a companion claim's", () => {
    expect(byIndividual(a, { kind: "stewardship", placeId: p })).toEqual({
      kind: "stewardship",
      applicant: individual(a),
      placeId: p,
      registrationId: null,
    });
    expect(ApplicationTarget.companion(registration, b)).toBeNull();
    const approved = App.approve(
      registration,
      "approver",
      Premise.require(Premise.evaluate(registrationTarget, {})),
      ids.tick(),
    ).entity;
    expect(
      ApplicationTarget.companion(
        approved as ApplicationFor<ApplicationKindMap["registration"]>,
        a,
      ),
    ).toEqual({
      kind: "stewardship",
      applicant: individual(a),
      placeId: reservedPlaceId,
      registrationId: null,
    });
  });

  it("keys a companion claim's slot like an ordinary claim on its place", () => {
    const ordinary = byIndividual(a, {
      kind: "stewardship",
      placeId: reservedPlaceId,
    });
    const slot = applicationModel.ApplicationSlot.of(ordinary);
    const companionSlot = applicationModel.ApplicationSlot.of(companionTarget);
    if (slot === null || companionSlot === null) throw new Error("no slot");
    expect(applicationModel.ApplicationSlot.equals(slot, companionSlot)).toBe(
      true,
    );
  });
});
