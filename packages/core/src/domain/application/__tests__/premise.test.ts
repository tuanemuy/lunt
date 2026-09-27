import { expectBusinessError } from "@repo/core/domain/common/__tests__/expectBusinessError";
import { describe, expect, it } from "vitest";
import { defineKind, type KindRegistry } from "../kind";
import { createApplicationModel } from "../model";
import { PREMISE_KEYS, type PremiseKey, PremiseRules } from "../premise";
import type { ApplicationStatusKind } from "../status";
import { applicationIds, targets } from "./fixtures";
import { type StandInHolding, TestModel } from "./testKinds";

const { Premise } = TestModel;

const ids = applicationIds();
const a = ids.account();
const p = ids.place();
const x = ids.region();
const e = ids.occasion();
const l = ids.listing();
const r = ids.application();

describe("Premise.required", () => {
  it.each([
    ["registration", targets.registration(a), []],
    ["individual revision", targets.revision(a, p), ["placeHasNoSteward"]],
    ["individual listing", targets.listing(a, p), ["placeHasNoSteward"]],
    [
      "listing revision",
      targets.listingRevision(a, l),
      ["placeHasNoSteward", "listingExists"],
    ],
    [
      "individual affiliation",
      targets.affiliation(p, x, a),
      ["placeHasNoSteward", "notAffiliated"],
    ],
    [
      "affiliation as a steward",
      targets.affiliation(p, x),
      ["placeHasSteward", "notAffiliated"],
    ],
    [
      "individual leave",
      targets.leave(p, x, a),
      ["placeHasNoSteward", "affiliated"],
    ],
    [
      "leave as a steward",
      targets.leave(p, x),
      ["placeHasSteward", "affiliated"],
    ],
    [
      "participation",
      targets.participation(p, e),
      ["placeHasSteward", "occasionOpen", "notParticipating"],
    ],
    ["stewardship claim", targets.stewardship(a, p), ["applicantNotSteward"]],
    [
      "companion stewardship claim",
      targets.stewardship(a, p, r),
      ["applicantNotSteward", "registrationStanding"],
    ],
  ] as const)("%s → %j", (_label, target, expected) => {
    expect(Premise.required(target)).toEqual(expected);
  });
});

describe("Premise.evaluate", () => {
  it("holds for a registration, which has no premise and never lapses", () => {
    expect(Premise.evaluate(targets.registration(a), {})).toEqual({
      holds: true,
    });
  });

  it("judges whether the place has a steward by the applicant", () => {
    expect(
      Premise.evaluate(targets.revision(a, p), { placeHasSteward: true }),
    ).toEqual({ holds: false, broken: ["placeHasNoSteward"] });
    expect(
      Premise.evaluate(targets.revision(a, p), { placeHasSteward: false }),
    ).toEqual({ holds: true });
    expect(
      Premise.evaluate(targets.affiliation(p, x), {
        placeHasSteward: false,
        affiliated: false,
      }),
    ).toEqual({ holds: false, broken: ["placeHasSteward"] });
  });

  it("does not ask whether the place has a steward when the listing is gone", () => {
    const target = targets.listingRevision(a, l);
    expect(Premise.evaluate(target, { listing: null })).toEqual({
      holds: false,
      broken: ["listingExists"],
    });
    expect(
      Premise.evaluate(target, { listing: { placeHasSteward: true } }),
    ).toEqual({ holds: false, broken: ["placeHasNoSteward"] });
    expect(
      Premise.evaluate(target, { listing: { placeHasSteward: false } }),
    ).toEqual({ holds: true });
  });

  it("requires no affiliation to affiliate and an affiliation to leave", () => {
    expect(
      Premise.evaluate(targets.affiliation(p, x, a), {
        placeHasSteward: false,
        affiliated: true,
      }),
    ).toEqual({ holds: false, broken: ["notAffiliated"] });
    expect(
      Premise.evaluate(targets.leave(p, x), {
        placeHasSteward: true,
        affiliated: false,
      }),
    ).toEqual({ holds: false, broken: ["affiliated"] });
  });

  it.each([
    [null, true],
    ["upcoming", true],
    ["holding", true],
    ["ended", false],
    ["cancelled", false],
  ] as const)(
    "counts an occasion whose holding status is %s as open: %s",
    (holdingStatus: StandInHolding | null, open) => {
      const result = Premise.evaluate(targets.participation(p, e), {
        placeHasSteward: true,
        holdingStatus,
        participating: false,
      });
      expect(result).toEqual(
        open ? { holds: true } : { holds: false, broken: ["occasionOpen"] },
      );
    },
  );

  it("lists every broken premise in table order", () => {
    expect(
      Premise.evaluate(targets.participation(p, e), {
        placeHasSteward: false,
        holdingStatus: "ended",
        participating: true,
      }),
    ).toEqual({
      holds: false,
      broken: ["placeHasSteward", "occasionOpen", "notParticipating"],
    });
    expect(
      Premise.evaluate(targets.leave(p, x, a), {
        placeHasSteward: true,
        affiliated: false,
      }),
    ).toEqual({ holds: false, broken: ["placeHasNoSteward", "affiliated"] });
  });

  it.each([
    [null, true],
    ["underReview", true],
    ["returned", true],
    ["approved", true],
    ["rejected", false],
    ["withdrawn", false],
    ["lapsed", false],
  ] as const)(
    "counts a companion registration that is %s as standing: %s",
    (registration: ApplicationStatusKind | null, standing) => {
      const target =
        registration === null
          ? targets.stewardship(a, p)
          : targets.stewardship(a, p, r);
      expect(
        Premise.evaluate(target, { applicantIsSteward: false, registration }),
      ).toEqual(
        standing
          ? { holds: true }
          : { holds: false, broken: ["registrationStanding"] },
      );
    },
  );

  it("refuses a claim by someone already a steward", () => {
    expect(
      Premise.evaluate(targets.stewardship(a, p, r), {
        applicantIsSteward: true,
        registration: "withdrawn",
      }),
    ).toEqual({
      holds: false,
      broken: ["applicantNotSteward", "registrationStanding"],
    });
  });
});

describe("Premise.require", () => {
  it("passes a holding result through", () => {
    const result = Premise.evaluate(targets.registration(a), {});
    expect(Premise.require(result)).toBe(result);
  });

  it.each([
    ["placeHasNoSteward", "APPLICATION_PLACE_HAS_STEWARD"],
    ["placeHasSteward", "APPLICATION_PLACE_HAS_NO_STEWARD"],
    ["listingExists", "APPLICATION_LISTING_NOT_FOUND"],
    ["notAffiliated", "APPLICATION_ALREADY_AFFILIATED"],
    ["affiliated", "APPLICATION_NOT_AFFILIATED"],
    ["occasionOpen", "APPLICATION_OCCASION_NOT_OPEN"],
    ["notParticipating", "APPLICATION_ALREADY_PARTICIPATING"],
    ["applicantNotSteward", "APPLICATION_ALREADY_STEWARD"],
    ["registrationStanding", "APPLICATION_REGISTRATION_NOT_STANDING"],
  ] as const)("throws %s's code %s", (key, code) => {
    expect(Premise.codeOf(key)).toBe(code);
    expectBusinessError(
      () => Premise.require({ holds: false, broken: [key] }),
      code,
    );
  });

  it("throws the first broken premise's code", () => {
    expectBusinessError(
      () =>
        Premise.require(
          Premise.evaluate(targets.participation(p, e), {
            placeHasSteward: true,
            holdingStatus: "cancelled",
            participating: true,
          }),
        ),
      "APPLICATION_OCCASION_NOT_OPEN",
    );
  });
});

describe("premise rules of a kind", () => {
  type Target = Readonly<{
    kind: "probe";
    applicant: Readonly<{ kind: "individual"; accountId: typeof a }>;
  }>;
  type Spec = {
    target: Target;
    content: null;
    reserved: Readonly<Record<never, never>>;
    desired: Readonly<Record<never, never>>;
    premiseKey: PremiseKey;
    facts: Readonly<{ broken: readonly PremiseKey[] }>;
    seat: "operator";
    awaitsRegistration: false;
    slot: null;
    request: Readonly<{ target: Target }>;
  };
  const probe = (premises: readonly PremiseKey[]) =>
    defineKind<Spec>({
      kind: "probe",
      seat: "operator",
      awaitsRegistration: false,
      premises: premises.map((key) => ({
        key,
        holds: (facts) => !facts.broken.includes(key),
      })),
      seatOf: () => ({ kind: "operator" }),
      slotOf: () => null,
      submissionTargets: () => [],
      subjects: () => [],
      reflectedRef: () => ({ kind: "place", id: p }),
      ownedPhotoIds: () => [],
      matchesSubmission: () => true,
      snapshot: () => null,
      reconstruct: () => {
        throw new Error("not stored");
      },
    });
  const target: Target = {
    kind: "probe",
    applicant: { kind: "individual", accountId: a },
  };

  it("orders a kind's premises by the table whatever order it declares them in", () => {
    const reversed = [...PREMISE_KEYS].reverse();
    const model = createApplicationModel<{ probe: Spec }>({
      probe: probe(reversed),
    });
    expect(model.Premise.required(target)).toEqual(PREMISE_KEYS);
    expect(
      model.Premise.evaluate(target, {
        broken: ["registrationStanding", "placeHasSteward"],
      }),
    ).toEqual({
      holds: false,
      broken: ["placeHasSteward", "registrationStanding"],
    });
  });

  it("refuses a kind that declares a premise twice or is registered under another name", () => {
    expect(() =>
      createApplicationModel<{ probe: Spec }>({
        probe: probe(["affiliated", "affiliated"]),
      }),
    ).toThrow();
    expect(() =>
      createApplicationModel({
        other: probe([]),
      } as unknown as KindRegistry<{ probe: Spec }>),
    ).toThrow();
  });

  it("keeps the evaluation order of the shared rules", () => {
    expect(
      PremiseRules.required(
        [
          { key: "affiliated", holds: () => true },
          { key: "placeHasSteward", holds: () => true },
        ],
        target,
      ),
    ).toEqual(["placeHasSteward", "affiliated"]);
  });
});
