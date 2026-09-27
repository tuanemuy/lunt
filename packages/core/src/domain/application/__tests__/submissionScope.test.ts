import { expectBusinessError } from "@repo/core/domain/common/__tests__/expectBusinessError";
import { describe, expect, it } from "vitest";
import type { SubmissionFindings } from "../model";
import { applicationIds, holds, targets } from "./fixtures";
import { TestModel } from "./testKinds";

const { SubmissionScope, Premise } = TestModel;

const ids = applicationIds();
const a = ids.account();
const p = ids.place();
const x = ids.region();
const e = ids.occasion();
const l = ids.listing();
const place = { kind: "place", id: p } as const;
const region = { kind: "region", id: x } as const;

describe("SubmissionScope.targets", () => {
  it.each([
    ["registration", targets.registration(a), []],
    [
      "companion stewardship claim",
      targets.stewardship(a, p, ids.application()),
      [],
    ],
    ["revision", targets.revision(a, p), [place]],
    ["stewardship claim", targets.stewardship(a, p), [place]],
    ["listing", targets.listing(a, p), [place]],
    ["individual affiliation", targets.affiliation(p, x, a), [place, region]],
    [
      "listing revision",
      targets.listingRevision(a, l),
      [{ kind: "listing", id: l }],
    ],
    ["individual leave", targets.leave(p, x, a), [place, region]],
    ["affiliation as a steward", targets.affiliation(p, x), [region]],
    ["leave as a steward", targets.leave(p, x), []],
    [
      "participation",
      targets.participation(p, e),
      [{ kind: "occasion", id: e }],
    ],
  ] as const)("%s must be able to view %j", (_label, target, expected) => {
    expect(SubmissionScope.targets(target)).toEqual(expected);
  });
});

describe("SubmissionScope.accepts / admit", () => {
  const target = targets.revision(a, p);
  const clear: SubmissionFindings = {
    premise: holds(target),
    unviewable: [],
    activeDuplicate: null,
  };
  const broken = Premise.evaluate(target, { placeHasSteward: true });
  const duplicate = ids.application();

  it("admits a target that meets every condition", () => {
    expect(SubmissionScope.accepts(clear)).toBe(true);
    expect(SubmissionScope.admit(target, clear)).toEqual({
      target,
      premise: { holds: true },
    });
  });

  it.each([
    [
      "a broken premise first",
      { premise: broken, unviewable: [place], activeDuplicate: duplicate },
      "APPLICATION_PLACE_HAS_STEWARD",
    ],
    [
      "an unviewable target next",
      {
        premise: clear.premise,
        unviewable: [place],
        activeDuplicate: duplicate,
      },
      "APPLICATION_TARGET_NOT_VIEWABLE",
    ],
    [
      "an active application of the slot last",
      { premise: clear.premise, unviewable: [], activeDuplicate: duplicate },
      "APPLICATION_ALREADY_ACTIVE",
    ],
  ] as const)("refuses %s", (_label, findings, code) => {
    expect(SubmissionScope.accepts(findings)).toBe(false);
    expectBusinessError(() => SubmissionScope.admit(target, findings), code);
  });
});
