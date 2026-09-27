import {
  type AccessDecision,
  AccessPolicy,
  type TargetStanding,
} from "@repo/core/domain/authority/accessPolicy";
import type { Role } from "@repo/core/domain/authority/role";
import { expectBusinessError } from "@repo/core/domain/common/__tests__/expectBusinessError";
import type { AccountId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { ReviewPolicy } from "../reviewPolicy";
import type { ApplicationStatusKind } from "../status";
import { applicationIds, returned, submitted, targets } from "./fixtures";
import { TestModel } from "./testKinds";

const { ApproverPolicy } = TestModel;

const HOUR = 60 * 60 * 1000;
const policy = ReviewPolicy.create({ proxyAfterMs: 24 * HOUR });

const ALLOW_ROLE: AccessDecision = { allowed: true, basis: "role" };
const DENY: AccessDecision = { allowed: false };

describe("ApproverPolicy.seatOf", () => {
  it("seats the operators for registration, revision, stewardship, listing and listing revision (P-70)", () => {
    const ids = applicationIds();
    const a = ids.account();
    const p = ids.place();
    for (const target of [
      targets.registration(a),
      targets.revision(a, p),
      targets.stewardship(a, p),
      targets.stewardship(a, p, ids.application()),
      targets.listing(a, p),
      targets.listingRevision(a, ids.listing()),
    ]) {
      expect(ApproverPolicy.seatOf(target)).toEqual({ kind: "operator" });
    }
  });

  it("seats the region's stewards for affiliation and leave, the occasion's for participation", () => {
    const ids = applicationIds();
    const p = ids.place();
    const x = ids.region();
    const e = ids.occasion();
    const region = { kind: "steward", target: { kind: "region", id: x } };
    expect(ApproverPolicy.seatOf(targets.affiliation(p, x))).toEqual(region);
    expect(ApproverPolicy.seatOf(targets.leave(p, x, ids.account()))).toEqual(
      region,
    );
    expect(ApproverPolicy.seatOf(targets.participation(p, e))).toEqual({
      kind: "steward",
      target: { kind: "occasion", id: e },
    });
  });
});

describe("ApproverPolicy.decide on an operator seat", () => {
  const ids = applicationIds();
  const a = ids.account();
  const revision = submitted(ids, targets.revision(a, ids.place()));
  const now = ids.tick();

  it("lets an operator decide as the approver and refuses anyone else", () => {
    expect(
      ApproverPolicy.decide(
        revision,
        { seat: "operator", serviceOperation: ALLOW_ROLE },
        policy,
        now,
      ),
    ).toEqual({ allowed: true, reviewAs: "approver" });
    expect(
      ApproverPolicy.decide(
        revision,
        { seat: "operator", serviceOperation: DENY },
        policy,
        now,
      ),
    ).toEqual({ allowed: false, reason: "notApprover" });
  });

  it.each([
    [null, { allowed: true, reviewAs: "approver" }],
    ["underReview", { allowed: false, reason: "registrationPending" }],
    ["returned", { allowed: false, reason: "registrationPending" }],
    ["approved", { allowed: true, reviewAs: "approver" }],
    ["rejected", { allowed: true, reviewAs: "approver" }],
    ["withdrawn", { allowed: true, reviewAs: "approver" }],
  ] as const)(
    "a stewardship claim whose companion registration is %s → %j",
    (registration: ApplicationStatusKind | null, expected) => {
      const claim = submitted(
        ids,
        targets.stewardship(
          a,
          ids.place(),
          registration === null ? null : ids.application(),
        ),
      );
      expect(
        ApproverPolicy.decide(
          claim,
          { seat: "operator", serviceOperation: ALLOW_ROLE, registration },
          policy,
          now,
        ),
      ).toEqual(expected);
    },
  );

  it("refuses a non-operator before looking at the registration", () => {
    const claim = submitted(
      ids,
      targets.stewardship(a, ids.place(), ids.application()),
    );
    expect(
      ApproverPolicy.decide(
        claim,
        {
          seat: "operator",
          serviceOperation: DENY,
          registration: "underReview",
        },
        policy,
        now,
      ),
    ).toEqual({ allowed: false, reason: "notApprover" });
  });

  it("does not care who applied: an operator decides their own application (P-04)", () => {
    const own = submitted(ids, targets.listing(a, ids.place()));
    expect(
      ApproverPolicy.decide(
        own,
        { seat: "operator", serviceOperation: ALLOW_ROLE },
        policy,
        now,
      ),
    ).toEqual({ allowed: true, reviewAs: "approver" });
  });
});

describe("ApproverPolicy.decide on a steward seat", () => {
  const ids = applicationIds();
  const p = ids.place();
  const x = ids.region();
  const since = ids.tick();
  const affiliation = submitted(ids, targets.affiliation(p, x), since);
  const proxyableAt = new Date(since.getTime() + 24 * HOUR);

  /** Facts as the usecase reads them: `AccessPolicy.decide` over the actor's standing. */
  const factsFor = (
    actor: AccountId,
    roles: readonly Role[],
    standing: TargetStanding,
  ) => {
    const authority = { actor: { accountId: actor }, roles: new Set(roles) };
    return {
      seat: "steward" as const,
      targetManagement: AccessPolicy.decide(authority, {
        kind: "manage_target",
        standing,
      }),
      serviceOperation: AccessPolicy.decide(authority, {
        kind: "operate_service",
      }),
    };
  };
  const region = { kind: "region", id: x } as const;
  const steward = ids.account();
  const operator = ids.account();

  it("lets the region's steward decide as the approver", () => {
    expect(
      ApproverPolicy.decide(
        affiliation,
        factsFor(steward, [], {
          target: region,
          status: "stewarded",
          actorIsSteward: true,
        }),
        policy,
        since,
      ),
    ).toEqual({ allowed: true, reviewAs: "approver" });
  });

  it("lets an operator stand in for absent stewards as the approver (不在の代行)", () => {
    expect(
      ApproverPolicy.decide(
        affiliation,
        factsFor(operator, ["operator"], { target: region, status: "vacant" }),
        policy,
        since,
      ),
    ).toEqual({ allowed: true, reviewAs: "approver" });
  });

  it("lets an operator decide as an overdue proxy from the moment the period elapses", () => {
    const facts = factsFor(operator, ["operator"], {
      target: region,
      status: "stewarded",
      actorIsSteward: false,
    });
    expect(
      ApproverPolicy.decide(
        affiliation,
        facts,
        policy,
        new Date(proxyableAt.getTime() - 1),
      ),
    ).toEqual({ allowed: false, reason: "awaitingStewards" });
    expect(
      ApproverPolicy.decide(affiliation, facts, policy, proxyableAt),
    ).toEqual({ allowed: true, reviewAs: "overdue_proxy" });
  });

  it("keeps an operator waiting on a returned application", () => {
    const back = returned(affiliation, ids.tick());
    expect(
      ApproverPolicy.decide(
        back,
        factsFor(operator, ["operator"], {
          target: region,
          status: "stewarded",
          actorIsSteward: false,
        }),
        policy,
        new Date(proxyableAt.getTime() + 365 * 24 * HOUR),
      ),
    ).toEqual({ allowed: false, reason: "awaitingStewards" });
  });

  it("refuses someone who is neither a steward nor an operator", () => {
    expect(
      ApproverPolicy.decide(
        affiliation,
        factsFor(ids.account(), ["editor"], {
          target: region,
          status: "stewarded",
          actorIsSteward: false,
        }),
        policy,
        proxyableAt,
      ),
    ).toEqual({ allowed: false, reason: "notApprover" });
  });

  it("refuses facts read for the wrong seat", () => {
    expect(() =>
      ApproverPolicy.decide(
        affiliation,
        { seat: "operator", serviceOperation: ALLOW_ROLE } as never,
        policy,
        since,
      ),
    ).toThrow();
  });
});

describe("ApproverPolicy.reviewAs / returnAs", () => {
  const ids = applicationIds();
  const affiliation = submitted(
    ids,
    targets.affiliation(ids.place(), ids.region()),
  );
  const claim = submitted(
    ids,
    targets.stewardship(ids.account(), ids.place(), ids.application()),
  );

  it("hands the permitted standpoint to approve and reject", () => {
    expect(
      ApproverPolicy.reviewAs(affiliation, {
        allowed: true,
        reviewAs: "overdue_proxy",
      }),
    ).toBe("overdue_proxy");
    expect(
      ApproverPolicy.reviewAs(affiliation, {
        allowed: true,
        reviewAs: "approver",
      }),
    ).toBe("approver");
  });

  it("refuses an operator waiting on the stewards or on the registration", () => {
    expectBusinessError(
      () =>
        ApproverPolicy.reviewAs(affiliation, {
          allowed: false,
          reason: "awaitingStewards",
        }),
      "APPLICATION_AWAITING_STEWARDS",
    );
    expectBusinessError(
      () =>
        ApproverPolicy.reviewAs(claim, {
          allowed: false,
          reason: "registrationPending",
        }),
      "APPLICATION_REGISTRATION_PENDING",
    );
    expectBusinessError(
      () =>
        ApproverPolicy.returnAs(affiliation, {
          allowed: false,
          reason: "awaitingStewards",
        }),
      "APPLICATION_AWAITING_STEWARDS",
    );
  });

  it("lets only the approver return an application (I-13)", () => {
    expect(
      ApproverPolicy.returnAs(affiliation, {
        allowed: true,
        reviewAs: "approver",
      }),
    ).toBe("approver");
    expectBusinessError(
      () =>
        ApproverPolicy.returnAs(affiliation, {
          allowed: true,
          reviewAs: "overdue_proxy",
        }),
      "APPLICATION_OVERDUE_PROXY_CANNOT_RETURN",
    );
  });
});
