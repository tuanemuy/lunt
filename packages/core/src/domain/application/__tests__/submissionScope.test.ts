import { expectBusinessError } from "@repo/core/domain/common/__tests__/expectBusinessError";
import { describe, expect, it } from "vitest";
import type { SubmissionFindings } from "../model";
import { applicationIds, holds, targets } from "./fixtures";
import { TestModel } from "./testKinds";

const { SubmissionScope, Premise } = TestModel;

const ids = applicationIds();
const a = ids.account();
const p = ids.place();
const place = { kind: "place", id: p } as const;

// Each kind's viewable targets are in the kind contract
// (`testKinds.contract.test.ts`).

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
