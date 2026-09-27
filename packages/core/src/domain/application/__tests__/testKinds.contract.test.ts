import {
  applicationIds,
  claim,
  individual,
  reply,
  standInContent,
  standInDesired,
  standInPatch,
  submitted,
  targets,
} from "./fixtures";
import { describeKindContract, type KindCase } from "./kindContract";
import { type TestKindMap, TestModel } from "./testKinds";

/**
 * The spec's per-kind tables (`spec/domains/application.md` 「Premise」
 * 「SubmissionScope」「ApproverPolicy.seatOf」「ApplicationSubject」
 * 「SubmissionRequest」「種類ごとの内容」), stated for the test-only kinds.
 * A stage that registers a production kind writes the same cases for it and
 * runs `describeKindContract` on `applicationModel`.
 */
const ids = applicationIds();
const a = ids.account();
const b = ids.account();
const p = ids.place();
const x = ids.region();
const e = ids.occasion();
const l = ids.listing();
const [photo1, photo2] = [ids.photo(), ids.photo()];

const place = { kind: "place", id: p } as const;
const region = { kind: "region", id: x } as const;
const operator = { kind: "operator" } as const;
const regionSeat = { kind: "steward", target: region } as const;

const registration = submitted(ids, targets.registration(a), ids.tick(), {
  photos: [photo1, photo2],
  name: "登録する店",
});
const revision = submitted(ids, targets.revision(a, p), ids.tick(), {
  photos: [photo1],
  name: "修正後の名前",
});
const stewardship = submitted(ids, targets.stewardship(a, p));
const companion = submitted(
  ids,
  targets.stewardship(a, registration.reservedPlaceId, registration.id),
);
const affiliation = submitted(ids, targets.affiliation(p, x));
const individualAffiliation = submitted(ids, targets.affiliation(p, x, a));
const leave = submitted(ids, targets.leave(p, x));
const individualLeave = submitted(ids, targets.leave(p, x, a));
const [l1, l2] = [ids.listing(), ids.listing()];
const participation = submitted(ids, targets.participation(p, e), ids.tick(), {
  listingIds: [l2, l1],
  dates: ["2026-10-01", "2026-10-02"],
});
const listing = submitted(ids, targets.listing(a, p), ids.tick(), {
  photos: [photo2],
  name: "新しい掲載",
});
const listingRevision = submitted(
  ids,
  targets.listingRevision(a, l),
  ids.tick(),
  { photos: [photo2], placeId: p },
);

const cases: readonly KindCase<TestKindMap>[] = [
  {
    label: "登録",
    application: registration,
    required: [],
    evaluations: [{ facts: {}, broken: [] }],
    seat: operator,
    submissionTargets: [],
    slot: null,
    subjects: [{ kind: "place", id: registration.reservedPlaceId }],
    reflectedRef: { kind: "place", id: registration.reservedPlaceId },
    ownedPhotoIds: [photo1, photo2],
    registrationOf: null,
    contentNames: [
      {
        ref: { kind: "place", id: registration.reservedPlaceId },
        name: "登録する店",
      },
    ],
    matching: [{ target: registration.target, content: registration.content }],
    differing: [
      {
        target: registration.target,
        content: standInContent("別の店", [photo1, photo2]),
      },
      { target: targets.registration(b), content: registration.content },
    ],
    amendment: {
      content: standInContent("直した店", [photo2]),
      reply: reply(),
    },
  },
  {
    label: "情報修正（個人）",
    application: revision,
    required: ["placeHasNoSteward"],
    evaluations: [
      { facts: { placeHasSteward: false }, broken: [] },
      { facts: { placeHasSteward: true }, broken: ["placeHasNoSteward"] },
    ],
    seat: operator,
    submissionTargets: [place],
    slot: revision.target,
    subjects: [place],
    reflectedRef: place,
    ownedPhotoIds: [photo1],
    registrationOf: null,
    contentNames: [],
    matching: [{ target: revision.target, desired: revision.desired }],
    differing: [
      { target: revision.target, desired: standInDesired("別の名前") },
      { target: targets.revision(b, p), desired: revision.desired },
    ],
    amendment: {
      content: standInPatch([], ["status"]),
      reply: null,
      desired: standInDesired("直した名前"),
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
    differing: [{ target: stewardship.target, content: claim("常連です") }],
    amendment: { content: claim("店長です"), reply: reply() },
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
      placeId: registration.reservedPlaceId,
    },
    subjects: [
      { kind: "place", id: registration.reservedPlaceId },
      { kind: "registration", id: registration.id },
    ],
    reflectedRef: { kind: "place", id: registration.reservedPlaceId },
    ownedPhotoIds: [],
    registrationOf: registration.id,
    contentNames: [],
    // The registration is not compared: after its approval the same
    // request builds a target without it (`ApplicationTarget.companion`).
    matching: [
      {
        target: targets.stewardship(a, registration.reservedPlaceId),
        content: claim(),
      },
    ],
    differing: [
      {
        target: targets.stewardship(a, registration.reservedPlaceId),
        content: claim("常連です"),
      },
    ],
    amendment: { content: claim(), reply: null },
  },
  {
    label: "所属（店舗管理者として）",
    application: affiliation,
    required: ["placeHasSteward", "notAffiliated"],
    evaluations: [
      { facts: { placeHasSteward: true, affiliated: false }, broken: [] },
      {
        facts: { placeHasSteward: false, affiliated: true },
        broken: ["placeHasSteward", "notAffiliated"],
      },
    ],
    seat: regionSeat,
    submissionTargets: [region],
    slot: affiliation.target,
    subjects: [place, region],
    reflectedRef: region,
    ownedPhotoIds: [],
    registrationOf: null,
    contentNames: [],
    matching: [{ target: affiliation.target }],
    differing: [{ target: targets.affiliation(p, x, a) }],
    amendment: { content: null, reply: reply() },
  },
  {
    label: "所属（個人）",
    application: individualAffiliation,
    required: ["placeHasNoSteward", "notAffiliated"],
    evaluations: [
      { facts: { placeHasSteward: false, affiliated: false }, broken: [] },
      {
        facts: { placeHasSteward: false, affiliated: true },
        broken: ["notAffiliated"],
      },
      {
        facts: { placeHasSteward: true, affiliated: false },
        broken: ["placeHasNoSteward"],
      },
    ],
    seat: regionSeat,
    submissionTargets: [place, region],
    slot: individualAffiliation.target,
    subjects: [place, region],
    reflectedRef: region,
    ownedPhotoIds: [],
    registrationOf: null,
    contentNames: [],
    matching: [{ target: individualAffiliation.target }],
    differing: [{ target: targets.affiliation(p, x) }],
    amendment: { content: null, reply: null },
  },
  {
    label: "離脱（店舗管理者として）",
    application: leave,
    required: ["placeHasSteward", "affiliated"],
    evaluations: [
      { facts: { placeHasSteward: true, affiliated: true }, broken: [] },
      {
        facts: { placeHasSteward: true, affiliated: false },
        broken: ["affiliated"],
      },
    ],
    seat: regionSeat,
    // A steward may leave even an unpublished or suspended region.
    submissionTargets: [],
    slot: leave.target,
    subjects: [place, region],
    reflectedRef: region,
    ownedPhotoIds: [],
    registrationOf: null,
    contentNames: [],
    matching: [{ target: leave.target }],
    differing: [{ target: targets.leave(p, ids.region()) }],
    amendment: { content: null, reply: null },
  },
  {
    label: "離脱（個人）",
    application: individualLeave,
    required: ["placeHasNoSteward", "affiliated"],
    evaluations: [
      { facts: { placeHasSteward: false, affiliated: true }, broken: [] },
      {
        facts: { placeHasSteward: true, affiliated: false },
        broken: ["placeHasNoSteward", "affiliated"],
      },
    ],
    seat: regionSeat,
    submissionTargets: [place, region],
    slot: individualLeave.target,
    subjects: [place, region],
    reflectedRef: region,
    ownedPhotoIds: [],
    registrationOf: null,
    contentNames: [],
    matching: [{ target: individualLeave.target }],
    differing: [{ target: leave.target }],
    amendment: { content: null, reply: null },
  },
  {
    label: "参加",
    application: participation,
    required: ["placeHasSteward", "occasionOpen", "notParticipating"],
    evaluations: [
      {
        facts: {
          placeHasSteward: true,
          holdingStatus: null,
          participating: false,
        },
        broken: [],
      },
      {
        facts: {
          placeHasSteward: true,
          holdingStatus: "upcoming",
          participating: false,
        },
        broken: [],
      },
      {
        facts: {
          placeHasSteward: true,
          holdingStatus: "holding",
          participating: false,
        },
        broken: [],
      },
      {
        facts: {
          placeHasSteward: true,
          holdingStatus: "ended",
          participating: false,
        },
        broken: ["occasionOpen"],
      },
      {
        facts: {
          placeHasSteward: true,
          holdingStatus: "cancelled",
          participating: false,
        },
        broken: ["occasionOpen"],
      },
      {
        facts: {
          placeHasSteward: false,
          holdingStatus: "ended",
          participating: true,
        },
        broken: ["placeHasSteward", "occasionOpen", "notParticipating"],
      },
    ],
    seat: { kind: "steward", target: { kind: "occasion", id: e } },
    submissionTargets: [{ kind: "occasion", id: e }],
    slot: participation.target,
    subjects: [place, { kind: "occasion", id: e }],
    reflectedRef: { kind: "occasion", id: e },
    ownedPhotoIds: [],
    registrationOf: null,
    contentNames: [],
    // Listings keep their order without duplicates; dates sort ascending.
    matching: [
      {
        target: participation.target,
        listingIds: [l2, l1, l2],
        dates: ["2026-10-02", "2026-10-01", "2026-10-02"],
      },
    ],
    differing: [
      {
        target: participation.target,
        listingIds: [l1, l2],
        dates: ["2026-10-01", "2026-10-02"],
      },
      {
        target: participation.target,
        listingIds: [l2, l1],
        dates: ["2026-10-01"],
      },
    ],
    amendment: {
      content: { listingIds: [l1], dates: ["2026-10-03"] },
      reply: reply(),
    },
  },
  {
    label: "掲載",
    application: listing,
    required: ["placeHasNoSteward"],
    evaluations: [
      { facts: { placeHasSteward: false }, broken: [] },
      { facts: { placeHasSteward: true }, broken: ["placeHasNoSteward"] },
    ],
    seat: operator,
    submissionTargets: [place],
    slot: null,
    subjects: [place],
    reflectedRef: { kind: "listing", id: listing.reservedListingId },
    ownedPhotoIds: [photo2],
    registrationOf: null,
    contentNames: [
      {
        ref: { kind: "listing", id: listing.reservedListingId },
        name: "新しい掲載",
      },
    ],
    matching: [{ target: listing.target, content: listing.content }],
    differing: [
      {
        target: listing.target,
        content: { ...listing.content, visibility: "members" },
      },
    ],
    amendment: { content: standInContent("直した掲載"), reply: null },
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
    slot: listingRevision.target,
    subjects: [place, { kind: "listing", id: l }],
    reflectedRef: { kind: "listing", id: l },
    ownedPhotoIds: [photo2],
    registrationOf: null,
    contentNames: [],
    matching: [
      { target: listingRevision.target, desired: listingRevision.desired },
    ],
    differing: [
      { target: listingRevision.target, desired: standInDesired("別") },
      {
        target: targets.listingRevision(a, ids.listing()),
        desired: listingRevision.desired,
      },
    ],
    amendment: {
      content: standInPatch([photo1]),
      reply: null,
      desired: standInDesired("直した掲載"),
    },
  },
];

describeKindContract("test-only kinds", TestModel, cases);
