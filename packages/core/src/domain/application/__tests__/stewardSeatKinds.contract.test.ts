import type { ApplicationId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { describe, expect, it } from "vitest";
import {
  ApplicationTarget,
  applicationModel,
  type TargetOf,
} from "../application";
import type { ApplicationFor } from "../kind";
import type { ApplicationKindMap } from "../kinds";
import type { UnderReview } from "../status";
import { ReturnReply } from "../texts";
import { applicationIds, asPlace, individual } from "./fixtures";
import { describeKindContract, type KindCase } from "./kindContract";

/**
 * The spec's per-kind tables for the steward-seat kinds (所属, 離脱, 参加;
 * `spec/domains/application.md` 「Premise」「SubmissionScope」
 * 「ApproverPolicy.seatOf」「ApplicationSubject」「SubmissionRequest」
 * 「種類ごとの内容」), with Occasion's real `ParticipationDetails`. An
 * affiliation and a leave are stated twice: filed by an individual and
 * filed as the place (`ApplicationTarget.byPlace`).
 */
const { Application: App, Premise, SubmissionScope } = applicationModel;

const ids = applicationIds(0x30_0000);
const a = ids.account();
const b = ids.account();
const p = ids.place();
const q = ids.place();
const r = ids.region();
const r2 = ids.region();
const o = ids.occasion();
const [l1, l2] = [ids.listing(), ids.listing()];
const [d1, d2] = [LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-02")];

const place = { kind: "place", id: p } as const;
const region = { kind: "region", id: r } as const;
const occasion = { kind: "occasion", id: o } as const;
const regionSeat = { kind: "steward", target: region } as const;

function submit<K extends keyof ApplicationKindMap>(
  target: TargetOf<K>,
  content: unknown,
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
  const params = { id, admission, reserved: {}, content } as Parameters<
    typeof App.submit<TargetOf<K>>
  >[0];
  return App.submit(params, ids.tick()).entity as unknown as UnderReview<
    ApplicationFor<ApplicationKindMap[K]>
  >;
}

const reply = ReturnReply.create("営業許可証を確認しました");

const membership = {
  vacant: { placeHasSteward: false, affiliated: false },
  vacantAffiliated: { placeHasSteward: false, affiliated: true },
  stewarded: { placeHasSteward: true, affiliated: false },
  stewardedAffiliated: { placeHasSteward: true, affiliated: true },
} as const;

// 所属
const affiliationByPlace = ApplicationTarget.byPlace(p, {
  kind: "affiliation",
  regionId: r,
});
const affiliationByIndividual = ApplicationTarget.byIndividual(a, {
  kind: "affiliation",
  placeId: p,
  regionId: r,
});
const placeAffiliation = submit<"affiliation">(
  affiliationByPlace,
  null,
  membership.stewarded,
);
const individualAffiliation = submit<"affiliation">(
  affiliationByIndividual,
  null,
  membership.vacant,
);

// 離脱
const leaveByPlace = ApplicationTarget.byPlace(p, {
  kind: "leave",
  regionId: r,
});
const leaveByIndividual = ApplicationTarget.byIndividual(a, {
  kind: "leave",
  placeId: p,
  regionId: r,
});
const placeLeave = submit<"leave">(
  leaveByPlace,
  null,
  membership.stewardedAffiliated,
);
const individualLeave = submit<"leave">(
  leaveByIndividual,
  null,
  membership.vacantAffiliated,
);

// 参加
const participationTarget = ApplicationTarget.byPlace(p, {
  kind: "participation",
  occasionId: o,
});
const details = { listingIds: [l1, l2], dates: [d1, d2] };
const participation = submit<"participation">(participationTarget, details, {
  placeHasSteward: true,
  holdingStatus: "upcoming",
  participating: false,
});

const cases: readonly KindCase<ApplicationKindMap>[] = [
  {
    label: "所属（店舗管理者として）",
    application: placeAffiliation,
    required: ["placeHasSteward", "notAffiliated"],
    evaluations: [
      { facts: membership.stewarded, broken: [] },
      { facts: membership.stewardedAffiliated, broken: ["notAffiliated"] },
      {
        facts: membership.vacantAffiliated,
        broken: ["placeHasSteward", "notAffiliated"],
      },
    ],
    seat: regionSeat,
    submissionTargets: [region],
    slot: affiliationByPlace,
    subjects: [place, region],
    reflectedRef: region,
    ownedPhotoIds: [],
    registrationOf: null,
    contentNames: [],
    matching: [{ target: affiliationByPlace }],
    differing: [
      { target: affiliationByIndividual },
      {
        target: ApplicationTarget.byPlace(p, {
          kind: "affiliation",
          regionId: r2,
        }),
      },
      {
        target: ApplicationTarget.byPlace(q, {
          kind: "affiliation",
          regionId: r,
        }),
      },
    ],
    amendment: { content: null, reply },
  },
  {
    label: "所属（個人として）",
    application: individualAffiliation,
    required: ["placeHasNoSteward", "notAffiliated"],
    evaluations: [
      { facts: membership.vacant, broken: [] },
      { facts: membership.stewarded, broken: ["placeHasNoSteward"] },
      {
        facts: membership.stewardedAffiliated,
        broken: ["placeHasNoSteward", "notAffiliated"],
      },
    ],
    seat: regionSeat,
    submissionTargets: [place, region],
    slot: affiliationByIndividual,
    subjects: [place, region],
    reflectedRef: region,
    ownedPhotoIds: [],
    registrationOf: null,
    contentNames: [],
    matching: [{ target: affiliationByIndividual }],
    differing: [
      { target: affiliationByPlace },
      {
        target: ApplicationTarget.byIndividual(b, {
          kind: "affiliation",
          placeId: p,
          regionId: r,
        }),
      },
    ],
    amendment: { content: null, reply: null },
  },
  {
    label: "離脱（店舗管理者として）",
    application: placeLeave,
    required: ["placeHasSteward", "affiliated"],
    evaluations: [
      { facts: membership.stewardedAffiliated, broken: [] },
      { facts: membership.stewarded, broken: ["affiliated"] },
      { facts: membership.vacant, broken: ["placeHasSteward", "affiliated"] },
    ],
    seat: regionSeat,
    // A steward may leave an unpublished or suspended region.
    submissionTargets: [],
    slot: leaveByPlace,
    subjects: [place, region],
    reflectedRef: region,
    ownedPhotoIds: [],
    registrationOf: null,
    contentNames: [],
    matching: [{ target: leaveByPlace }],
    differing: [{ target: leaveByIndividual }],
    amendment: { content: null, reply },
  },
  {
    label: "離脱（個人として）",
    application: individualLeave,
    required: ["placeHasNoSteward", "affiliated"],
    evaluations: [
      { facts: membership.vacantAffiliated, broken: [] },
      { facts: membership.vacant, broken: ["affiliated"] },
      {
        facts: membership.stewardedAffiliated,
        broken: ["placeHasNoSteward"],
      },
    ],
    seat: regionSeat,
    submissionTargets: [place, region],
    slot: leaveByIndividual,
    subjects: [place, region],
    reflectedRef: region,
    ownedPhotoIds: [],
    registrationOf: null,
    contentNames: [],
    matching: [{ target: leaveByIndividual }],
    differing: [{ target: leaveByPlace }],
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
          holdingStatus: "upcoming",
          participating: false,
        },
        broken: [],
      },
      {
        facts: {
          placeHasSteward: true,
          holdingStatus: "ongoing",
          participating: false,
        },
        broken: [],
      },
      {
        // Without a holding period the occasion is open.
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
          holdingStatus: "cancelled",
          participating: false,
        },
        broken: ["occasionOpen"],
      },
      {
        facts: {
          placeHasSteward: true,
          holdingStatus: "ended",
          participating: true,
        },
        broken: ["occasionOpen", "notParticipating"],
      },
      {
        facts: {
          placeHasSteward: false,
          holdingStatus: "upcoming",
          participating: false,
        },
        broken: ["placeHasSteward"],
      },
    ],
    seat: { kind: "steward", target: occasion },
    submissionTargets: [occasion],
    slot: participationTarget,
    subjects: [place, occasion],
    reflectedRef: occasion,
    ownedPhotoIds: [],
    registrationOf: null,
    contentNames: [],
    matching: [
      { target: participationTarget, listingIds: [l1, l2], dates: [d1, d2] },
      // Repeats dropped in order; days sorted.
      {
        target: participationTarget,
        listingIds: [l1, l2, l1],
        dates: [d2, d1, d2],
      },
    ],
    differing: [
      { target: participationTarget, listingIds: [l2, l1], dates: [d1, d2] },
      { target: participationTarget, listingIds: [l1, l2], dates: [d1] },
      { target: participationTarget, listingIds: [], dates: [] },
      {
        target: ApplicationTarget.byPlace(q, {
          kind: "participation",
          occasionId: o,
        }),
        listingIds: [l1, l2],
        dates: [d1, d2],
      },
    ],
    amendment: { content: { listingIds: [l2], dates: [d2] }, reply },
  },
];

describeKindContract("production kinds (S3B)", applicationModel, cases);

describe("steward-seat kinds: targets and stored forms", () => {
  it("builds a place's own targets with the place as applicant and target", () => {
    expect(affiliationByPlace).toEqual({
      kind: "affiliation",
      applicant: asPlace(p),
      placeId: p,
      regionId: r,
    });
    expect(leaveByIndividual).toEqual({
      kind: "leave",
      applicant: individual(a),
      placeId: p,
      regionId: r,
    });
    expect(participationTarget).toEqual({
      kind: "participation",
      applicant: asPlace(p),
      placeId: p,
      occasionId: o,
    });
  });

  it("refuses a stored place applicant for another place", () => {
    const stored = App.snapshot(placeAffiliation);
    const caseOf = stored.case as { target: object };
    expect(() =>
      App.reconstruct({
        ...stored,
        case: {
          ...caseOf,
          target: { ...caseOf.target, applicant: asPlace(q) },
        },
      }),
    ).toThrow(/violates invariants/);
  });

  it("refuses stored participation details that are not normalized", () => {
    const stored = App.snapshot(participation);
    const caseOf = stored.case as { content: object };
    for (const content of [
      { listingIds: [l1, l1], dates: [d1] },
      { listingIds: [l1], dates: [d2, d1] },
      { listingIds: [l1], dates: ["2026-13-01"] },
    ]) {
      expect(() =>
        App.reconstruct({ ...stored, case: { ...caseOf, content } }),
      ).toThrow(/violates invariants/);
    }
  });

  it("refuses a participation filed by an individual in storage", () => {
    const stored = App.snapshot(participation);
    const caseOf = stored.case as { target: object };
    expect(() =>
      App.reconstruct({
        ...stored,
        case: {
          ...caseOf,
          target: { ...caseOf.target, applicant: individual(a) },
        },
      }),
    ).toThrow(/violates invariants/);
  });
});
