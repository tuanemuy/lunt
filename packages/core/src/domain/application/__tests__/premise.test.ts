import { describe, expect, it } from "vitest";
import { defineKind, type KindRegistry } from "../kind";
import { createApplicationModel } from "../model";
import { PREMISE_KEYS, type PremiseKey, PremiseRules } from "../premise";
import { applicationIds, targets } from "./fixtures";
import { TestModel } from "./testKinds";

// Each kind's premises (the premise table) are in the kind contract
// (`testKinds.contract.test.ts`); these are the kind-agnostic parts.

const { Premise } = TestModel;

const ids = applicationIds();
const a = ids.account();
const p = ids.place();

describe("Premise.require / codeOf", () => {
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
  ] as const)("names %s's code %s", (key, code) => {
    expect(Premise.codeOf(key)).toBe(code);
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
    appointsApplicant: false;
    slot: null;
    request: Readonly<{ target: Target }>;
  };
  const probe = (premises: readonly PremiseKey[]) =>
    defineKind<Spec>({
      kind: "probe",
      seat: "operator",
      awaitsRegistration: false,
      appointsApplicant: false,
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
      registrationOf: () => null,
      contentNames: () => [],
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

  it("refuses a kind that declares a premise twice", () => {
    expect(() =>
      createApplicationModel<{ probe: Spec }>({
        probe: probe(["affiliated", "affiliated"]),
      }),
    ).toThrow("Kind probe declares a premise twice");
  });

  it("refuses a kind registered under another name", () => {
    expect(() =>
      createApplicationModel({
        other: probe([]),
      } as unknown as KindRegistry<{ probe: Spec }>),
    ).toThrow("Kind probe is registered as other");
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
