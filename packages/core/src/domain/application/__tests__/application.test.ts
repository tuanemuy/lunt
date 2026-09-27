import { expectBusinessError } from "@repo/core/domain/common/__tests__/expectBusinessError";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { BusinessRuleError, isRehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import type { ApplicationSnapshot } from "../model";
import type { AnyApplicationStatus } from "../status";
import {
  admitted,
  applicationIds,
  approved,
  asPlace,
  claim,
  holds,
  individual,
  lapsed,
  reason,
  rejected,
  reply,
  resubmitted,
  returned,
  returnRequest,
  standInContent,
  standInDesired,
  standInPatch,
  submitted,
  type TestApplication,
  targets,
  withdrawn,
} from "./fixtures";
import { companionTarget, TestModel } from "./testKinds";

const { Application, ApplicationCase, ApplicationSlot } = TestModel;

function everyKind(ids = applicationIds()) {
  const a = ids.account();
  const p = ids.place();
  const registration = submitted(ids, targets.registration(a), ids.tick(), {
    photos: [ids.photo(), ids.photo()],
  });
  return {
    ids,
    a,
    p,
    registration,
    revision: submitted(ids, targets.revision(a, p), ids.tick(), {
      photos: [ids.photo()],
    }),
    stewardship: submitted(ids, targets.stewardship(a, p)),
    companion: submitted(
      ids,
      targets.stewardship(a, registration.reservedPlaceId, registration.id),
    ),
    affiliation: submitted(ids, targets.affiliation(p, ids.region())),
    individualAffiliation: submitted(
      ids,
      targets.affiliation(p, ids.region(), a),
    ),
    leave: submitted(ids, targets.leave(p, ids.region())),
    individualLeave: submitted(ids, targets.leave(p, ids.region(), a)),
    participation: submitted(ids, targets.participation(p, ids.occasion())),
    listing: submitted(ids, targets.listing(a, p), ids.tick(), {
      photos: [ids.photo()],
    }),
    listingRevision: submitted(
      ids,
      targets.listingRevision(a, ids.listing()),
      ids.tick(),
      { photos: [ids.photo()], placeId: p },
    ),
  };
}

describe("Application.submit", () => {
  it("creates an under-review application with the admitted target, content and reserved ids", () => {
    const ids = applicationIds();
    const a = ids.account();
    const p = ids.place();
    const id = ids.application();
    const photo = ids.photo();
    const now = ids.tick();
    const target = targets.revision(a, p);
    const result = Application.submit(
      {
        id,
        admission: TestModel.SubmissionScope.admit(target, {
          premise: TestModel.Premise.evaluate(target, {
            placeHasSteward: false,
          }),
          unviewable: [],
          activeDuplicate: null,
        }),
        reserved: {},
        content: standInPatch([photo]),
        desired: standInDesired("新しい名前"),
      },
      now,
    );
    expect(result.entity).toEqual({
      id,
      target,
      content: standInPatch([photo]),
      desired: standInDesired("新しい名前"),
      status: { kind: "underReview", since: now, answering: null },
      submittedAt: now,
      version: 0,
    });
    expect(result.claimedPhotoIds).toEqual([photo]);
    expect(result.eventDrafts).toEqual([
      {
        type: "application.submitted",
        payload: { applicationId: id, approver: { kind: "operator" } },
        occurredAt: now,
        aggregateId: id,
      },
    ]);
  });

  it("keeps the reserved ids of a registration and a listing, and a listing revision's place", () => {
    const k = everyKind();
    expect(k.registration.reservedPlaceId).toBeDefined();
    expect(k.listing.reservedListingId).toBeDefined();
    expect(k.listingRevision.placeId).toBe(k.p);
  });

  it("addresses the approver seat: the operators, or the region's or occasion's stewards", () => {
    const ids = applicationIds();
    const p = ids.place();
    const x = ids.region();
    const e = ids.occasion();
    const submit = (target: Parameters<typeof submitted>[1]) => {
      const id = ids.application();
      const now = ids.tick();
      const params = {
        id,
        admission: TestModel.SubmissionScope.admit(target, {
          premise: holds(target),
          unviewable: [],
          activeDuplicate: null,
        }),
        reserved: {},
        content:
          target.kind === "participation"
            ? { listingIds: [], dates: [] }
            : null,
      } as Parameters<typeof Application.submit>[0];
      return Application.submit(params, now).eventDrafts[0]?.payload.approver;
    };
    expect(submit(targets.affiliation(p, x))).toEqual({
      kind: "steward",
      target: { kind: "region", id: x },
    });
    expect(submit(targets.participation(p, e))).toEqual({
      kind: "steward",
      target: { kind: "occasion", id: e },
    });
  });

  it("claims every photo the application owns", () => {
    const ids = applicationIds();
    const photos = [ids.photo(), ids.photo()];
    const target = targets.registration(ids.account());
    const result = Application.submit(
      {
        id: ids.application(),
        admission: TestModel.SubmissionScope.admit(target, {
          premise: holds(target),
          unviewable: [],
          activeDuplicate: null,
        }),
        reserved: { reservedPlaceId: ids.place() },
        content: { name: "店", photos, visibility: "public" },
      },
      ids.tick(),
    );
    expect(result.claimedPhotoIds).toEqual(photos);
  });
});

describe("Application.sendBack", () => {
  it("returns the application with the request and notifies the applicant", () => {
    const k = everyKind();
    const at = k.ids.tick();
    const request = returnRequest();
    const result = Application.sendBack(k.affiliation, "approver", request, at);
    expect(result.entity).toEqual({
      ...k.affiliation,
      status: { kind: "returned", request },
      version: 1,
    });
    expect(result.eventDrafts).toEqual([
      {
        type: "application.returned",
        payload: {
          applicationId: k.affiliation.id,
          applicant: asPlace(k.p),
        },
        occurredAt: at,
        aggregateId: k.affiliation.id,
      },
    ]);
  });

  it("refuses an application that is not under review", () => {
    const k = everyKind();
    const back = returned(k.revision, k.ids.tick());
    expectBusinessError(
      () =>
        Application.sendBack(
          back as unknown as Parameters<typeof Application.sendBack>[0],
          "approver",
          returnRequest(),
          k.ids.tick(),
        ),
      "APPLICATION_RETURNED",
    );
  });
});

describe("Application.resubmit", () => {
  it("replaces the content and desired content, answers the return and restarts the spell", () => {
    const k = everyKind();
    const back = returned(k.revision, k.ids.tick());
    const at = k.ids.tick();
    const answer = reply();
    const result = Application.resubmit(
      back,
      {
        content: standInPatch([], ["status"]),
        reply: answer,
        desired: standInDesired("直した名前"),
      },
      holds(back.target),
      at,
    );
    expect(result.entity).toEqual({
      ...k.revision,
      content: standInPatch([], ["status"]),
      desired: standInDesired("直した名前"),
      status: {
        kind: "underReview",
        since: at,
        answering: { request: returnRequest(), reply: answer },
      },
      version: 2,
    });
    expect(result.entity.submittedAt).toEqual(k.revision.submittedAt);
    expect(result.eventDrafts[0]).toEqual({
      type: "application.resubmitted",
      payload: {
        applicationId: k.revision.id,
        approver: { kind: "operator" },
      },
      occurredAt: at,
      aggregateId: k.revision.id,
    });
  });

  it("carries only a reply for a kind without content", () => {
    const k = everyKind();
    const back = returned(k.affiliation, k.ids.tick());
    const result = Application.resubmit(
      back,
      { content: null, reply: null },
      holds(back.target),
      k.ids.tick(),
    );
    expect(result.entity.status).toMatchObject({
      kind: "underReview",
      answering: { request: returnRequest(), reply: null },
    });
    expect(result.entity.target).toEqual(k.affiliation.target);
  });

  it("claims the photos it adds and releases the photos it drops", () => {
    const ids = applicationIds();
    const [p1, p2, p3] = [ids.photo(), ids.photo(), ids.photo()];
    const app = submitted(
      ids,
      targets.listing(ids.account(), ids.place()),
      ids.tick(),
      { photos: [p1, p2] as never },
    );
    const back = returned(app, ids.tick());
    const at = ids.tick();
    const result = Application.resubmit(
      back,
      {
        content: {
          name: "店",
          photos: [p2, p3] as never,
          visibility: "public",
        },
        reply: null,
      },
      holds(back.target),
      at,
    );
    expect(result.claimedPhotoIds).toEqual([p3]);
    expect(result.eventDrafts).toEqual([
      expect.objectContaining({ type: "application.resubmitted" }),
      {
        type: "photos.released",
        payload: { photoIds: [p1] },
        occurredAt: at,
        aggregateId: app.id,
      },
    ]);
  });

  it("releases nothing when no photo is dropped", () => {
    const k = everyKind();
    const back = returned(k.registration, k.ids.tick());
    const result = Application.resubmit(
      back,
      { content: back.content, reply: null },
      holds(back.target),
      k.ids.tick(),
    );
    expect(result.claimedPhotoIds).toEqual([]);
    expect(result.eventDrafts.map((draft) => draft.type)).toEqual([
      "application.resubmitted",
    ]);
  });
});

describe("Application.approve / reject", () => {
  it("records no reviewAs for an operator-seat kind", () => {
    const k = everyKind();
    const at = k.ids.tick();
    const result = Application.approve(
      k.revision,
      "approver",
      holds(k.revision.target),
      at,
    );
    expect(result.entity).toEqual({
      ...k.revision,
      status: { kind: "approved" },
      version: 1,
    });
    expect(result.eventDrafts).toEqual([
      {
        type: "application.approved",
        payload: {
          applicationId: k.revision.id,
          applicant: individual(k.a),
        },
        occurredAt: at,
        aggregateId: k.revision.id,
      },
    ]);
    expect(
      Application.reject(k.listing, "approver", reason(), k.ids.tick()).entity
        .status,
    ).toEqual({ kind: "rejected", reason: reason() });
  });

  it("records whether a steward-seat kind was decided by the approver or an overdue proxy", () => {
    const k = everyKind();
    expect(
      approved(k.affiliation, k.ids.tick(), "overdue_proxy").status,
    ).toEqual({
      kind: "approved",
      reviewAs: "overdue_proxy",
    });
    expect(approved(k.participation, k.ids.tick()).status).toEqual({
      kind: "approved",
      reviewAs: "approver",
    });
    const result = Application.reject(
      k.leave,
      "overdue_proxy",
      reason(),
      k.ids.tick(),
    );
    expect(result.entity.status).toEqual({
      kind: "rejected",
      reason: reason(),
      reviewAs: "overdue_proxy",
    });
    expect(result.eventDrafts[0]?.type).toBe("application.rejected");
  });

  it("keeps every photo of the content", () => {
    const k = everyKind();
    expect(approved(k.registration, k.ids.tick()).content).toEqual(
      k.registration.content,
    );
    expect(rejected(k.listing, k.ids.tick()).content).toEqual(
      k.listing.content,
    );
  });

  it("refuses an overdue proxy on an operator-seat kind even past the types", () => {
    const k = everyKind();
    expect(() =>
      Application.approve(
        k.revision,
        "overdue_proxy" as never,
        holds(k.revision.target),
        k.ids.tick(),
      ),
    ).toThrow("An operator-seat kind has no overdue proxy");
  });

  it("types the decision by the kind's seat", () => {
    const k = everyKind();
    // @ts-expect-error an operator-seat kind has no overdue proxy
    const typed: Parameters<typeof Application.approve<typeof k.revision>>[1] =
      "overdue_proxy";
    void typed;
    const status = approved(k.revision, k.ids.tick()).status;
    if (status.kind === "approved") {
      // @ts-expect-error an operator-seat decision carries no reviewAs
      void status.reviewAs;
    }
    expect(status.kind).toBe("approved");
  });
});

describe("Application.withdraw", () => {
  it("withdraws an under-review or returned application and notifies the approver", () => {
    const k = everyKind();
    const at = k.ids.tick();
    const result = Application.withdraw(k.participation, at);
    expect(result.entity.status).toEqual({ kind: "withdrawn" });
    expect(result.entity.version).toBe(1);
    expect(result.eventDrafts).toEqual([
      {
        type: "application.withdrawn",
        payload: {
          applicationId: k.participation.id,
          approver: {
            kind: "steward",
            target: {
              kind: "occasion",
              id: k.participation.target.occasionId,
            },
          },
        },
        occurredAt: at,
        aggregateId: k.participation.id,
      },
    ]);
    const back = returned(k.revision, k.ids.tick());
    expect(withdrawn(back, k.ids.tick()).status).toEqual({ kind: "withdrawn" });
  });
});

describe("Application.reassess", () => {
  it("returns the application unchanged, with no event, while the premises hold", () => {
    const k = everyKind();
    const result = Application.reassess(
      k.revision,
      TestModel.Premise.evaluate(k.revision.target, { placeHasSteward: false }),
      k.ids.tick(),
    );
    expect(result.entity).toBe(k.revision);
    expect(result.eventDrafts).toEqual([]);
  });

  it("lapses on the broken premises and notifies the applicant", () => {
    const k = everyKind();
    const back = returned(k.individualLeave, k.ids.tick());
    const at = k.ids.tick();
    const result = Application.reassess(
      back,
      TestModel.Premise.evaluate(back.target, {
        placeHasSteward: true,
        affiliated: false,
      }),
      at,
    );
    expect(result.entity.status).toEqual({
      kind: "lapsed",
      brokenPremises: ["placeHasNoSteward", "affiliated"],
    });
    expect(result.entity.version).toBe(2);
    expect(result.eventDrafts).toEqual([
      {
        type: "application.lapsed",
        payload: {
          applicationId: back.id,
          applicant: individual(k.a),
        },
        occurredAt: at,
        aggregateId: back.id,
      },
    ]);
  });
});

describe("status guards", () => {
  const k = everyKind();
  const at = () => k.ids.tick();
  const byStatus: Readonly<
    Record<AnyApplicationStatus["kind"], TestApplication>
  > = {
    underReview: k.revision,
    returned: returned(k.revision, at()),
    approved: approved(k.revision, at()),
    rejected: rejected(k.revision, at()),
    withdrawn: withdrawn(k.revision, at()),
    lapsed: lapsed(k.revision, at()),
  };
  const table = [
    ["requireUnderReview", "underReview", null],
    ["requireUnderReview", "returned", "APPLICATION_RETURNED"],
    ["requireUnderReview", "approved", "APPLICATION_ALREADY_APPROVED"],
    ["requireUnderReview", "rejected", "APPLICATION_ALREADY_REJECTED"],
    ["requireUnderReview", "withdrawn", "APPLICATION_ALREADY_WITHDRAWN"],
    ["requireUnderReview", "lapsed", "APPLICATION_ALREADY_LAPSED"],
    ["requireReturned", "underReview", "APPLICATION_UNDER_REVIEW"],
    ["requireReturned", "returned", null],
    ["requireReturned", "approved", "APPLICATION_ALREADY_APPROVED"],
    ["requireReturned", "rejected", "APPLICATION_ALREADY_REJECTED"],
    ["requireReturned", "withdrawn", "APPLICATION_ALREADY_WITHDRAWN"],
    ["requireReturned", "lapsed", "APPLICATION_ALREADY_LAPSED"],
    ["requireActive", "underReview", null],
    ["requireActive", "returned", null],
    ["requireActive", "approved", "APPLICATION_ALREADY_APPROVED"],
    ["requireActive", "rejected", "APPLICATION_ALREADY_REJECTED"],
    ["requireActive", "withdrawn", "APPLICATION_ALREADY_WITHDRAWN"],
    ["requireActive", "lapsed", "APPLICATION_ALREADY_LAPSED"],
    ["requireClosed", "underReview", "APPLICATION_UNDER_REVIEW"],
    ["requireClosed", "returned", "APPLICATION_RETURNED"],
    ["requireClosed", "approved", "APPLICATION_ALREADY_APPROVED"],
    ["requireClosed", "rejected", null],
    ["requireClosed", "withdrawn", null],
    ["requireClosed", "lapsed", null],
  ] as const;

  it.each(table)("%s on %s → %s", (guard, status, code) => {
    const app = byStatus[status];
    if (code === null) {
      expect(Application[guard](app)).toBe(app);
    } else {
      expectBusinessError(() => Application[guard](app), code);
    }
  });

  it("keeps a closed application closed: no transition leaves a final status", () => {
    for (const status of [
      "approved",
      "rejected",
      "withdrawn",
      "lapsed",
    ] as const) {
      const app = byStatus[status];
      expect(() => Application.requireActive(app)).toThrow(BusinessRuleError);
      expect(() => Application.requireUnderReview(app)).toThrow(
        BusinessRuleError,
      );
    }
  });
});

describe("Application.isHandledBy", () => {
  it("matches an individual's application by account and a steward's by place", () => {
    const k = everyKind();
    const other = k.ids.account();
    expect(
      Application.isHandledBy(k.revision, {
        kind: "individual",
        accountId: k.a,
      }),
    ).toBe(true);
    expect(
      Application.isHandledBy(k.revision, {
        kind: "individual",
        accountId: other,
      }),
    ).toBe(false);
    expect(
      Application.isHandledBy(k.revision, {
        kind: "steward",
        accountId: k.a,
        placeId: k.p,
      }),
    ).toBe(false);
    expect(
      Application.isHandledBy(k.affiliation, {
        kind: "steward",
        accountId: other,
        placeId: k.p,
      }),
    ).toBe(true);
    expect(
      Application.isHandledBy(k.affiliation, {
        kind: "steward",
        accountId: k.a,
        placeId: k.ids.place(),
      }),
    ).toBe(false);
    expect(
      Application.isHandledBy(k.affiliation, {
        kind: "individual",
        accountId: k.a,
      }),
    ).toBe(false);
  });
});

describe("Application.requireApplicantAccount", () => {
  it("returns the applicant's account as the appointee, and refuses a withdrawn applicant", () => {
    const k = everyKind();
    const email = EmailAddress.create("a@example.com");
    expect(
      Application.requireApplicantAccount(k.stewardship, {
        accountId: k.a,
        email,
      }),
    ).toEqual({ accountId: k.a, email });
    expectBusinessError(
      () => Application.requireApplicantAccount(k.stewardship, null),
      "APPLICATION_APPLICANT_WITHDRAWN",
    );
    expect(() =>
      Application.requireApplicantAccount(k.stewardship, {
        accountId: k.ids.account(),
        email,
      }),
    ).toThrow("The account read is not the applicant's");
  });
});

describe("slots", () => {
  it("gives no slot to a kind that creates its target", () => {
    const k = everyKind();
    expect(Application.slotOf(k.registration)).toBeNull();
    expect(Application.slotOf(k.listing)).toBeNull();
    expect(Application.slotOf(k.revision)).toEqual(k.revision.target);
  });

  it("drops the companion registration from a stewardship claim's slot", () => {
    const k = everyKind();
    const plain = submitted(
      k.ids,
      targets.stewardship(k.a, k.registration.reservedPlaceId),
    );
    expect(Application.slotOf(k.companion)).toEqual({
      kind: "stewardship",
      applicant: individual(k.a),
      placeId: k.registration.reservedPlaceId,
    });
    const [a, b] = [Application.slotOf(k.companion), Application.slotOf(plain)];
    if (a === null || b === null) throw new Error("expected slots");
    expect(ApplicationSlot.key(a)).toBe(ApplicationSlot.key(b));
    expect(ApplicationSlot.equals(a, b)).toBe(true);
  });

  it("keys applicant, kind and target apart, counting a place as one applicant", () => {
    const ids = applicationIds();
    const [a, b] = [ids.account(), ids.account()];
    const [p, q] = [ids.place(), ids.place()];
    const x = ids.region();
    const key = (target: Parameters<typeof ApplicationSlot.of>[0]) => {
      const slot = ApplicationSlot.of(target);
      if (slot === null) throw new Error("expected a slot");
      return ApplicationSlot.key(slot);
    };
    const keys = [
      key(targets.revision(a, p)),
      key(targets.revision(b, p)),
      key(targets.revision(a, q)),
      key(targets.stewardship(a, p)),
      key(targets.affiliation(p, x)),
      key(targets.leave(p, x)),
      key(targets.affiliation(p, x, a)),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(key(targets.affiliation(p, x))).toBe(key(targets.affiliation(p, x)));
  });
});

// Each kind's subjects, seat, reflected ref, owned photos and resend
// comparison are in the kind contract (`testKinds.contract.test.ts`).

describe("Application.submit validates the case against its kind", () => {
  it("refuses a steward's application naming another place", () => {
    const ids = applicationIds();
    const [p, q] = [ids.place(), ids.place()];
    const target = {
      kind: "affiliation",
      applicant: asPlace(q),
      placeId: p,
      regionId: ids.region(),
    } as const;
    expect(() =>
      Application.submit(
        {
          id: ids.application(),
          admission: admitted(target),
          reserved: {},
          content: null,
        },
        ids.tick(),
      ),
    ).toThrow("A affiliation case violates its kind");
  });

  it("refuses fields the kind does not have", () => {
    const ids = applicationIds();
    const target = targets.registration(ids.account());
    const stray = { reservedPlaceId: ids.place(), stray: 1 };
    expect(() =>
      Application.submit(
        {
          id: ids.application(),
          admission: admitted(target),
          reserved: stray,
          content: standInContent("店"),
        },
        ids.tick(),
      ),
    ).toThrow("A registration case carries fields its kind does not have");
  });
});

describe("Application.reassess refuses a result judged for another target", () => {
  it("lapses only on the application's own premises", () => {
    const k = everyKind();
    const foreign = TestModel.Premise.evaluate(k.affiliation.target, {
      placeHasSteward: false,
      affiliated: true,
    });
    expect(() =>
      // A misuse the types refuse: a result for another kind's target.
      Application.reassess(k.revision, foreign as never, k.ids.tick()),
    ).toThrow(
      "Broken premises placeHasSteward, notAffiliated are not the premises of this revision",
    );
  });
});

describe("Application.kindOf", () => {
  it("names the kind of any application, and refuses one not registered", () => {
    const k = everyKind();
    expect(Application.kindOf(k.leave)).toBe("leave");
    const stranger = { ...k.leave, target: { ...k.leave.target, kind: "x" } };
    expect(() => Application.kindOf(stranger)).toThrow(
      "Unknown application kind: x",
    );
  });
});

describe("Application.namedSubjects", () => {
  it("names a registration's place from its content, not yet existing until approved", () => {
    const k = everyKind();
    const place = { kind: "place", id: k.registration.reservedPlaceId };
    const content = { from: "content", value: "喫茶ルント" } as const;
    expect(Application.namedSubjects(k.registration, null)).toEqual([
      { subject: place, name: content, notYet: true },
    ]);
    expect(
      Application.namedSubjects(approved(k.registration, k.ids.tick()), null),
    ).toEqual([{ subject: place, name: content, notYet: false }]);
  });

  it("names a companion claim's place from its registration's content", () => {
    const k = everyKind();
    const place = { kind: "place", id: k.registration.reservedPlaceId };
    const content = { from: "content", value: "喫茶ルント" } as const;
    expect(Application.registrationOf(k.companion)).toBe(k.registration.id);
    expect(Application.namedSubjects(k.companion, k.registration)).toEqual([
      { subject: place, name: content, notYet: true },
    ]);
    expect(
      Application.namedSubjects(
        k.companion,
        approved(k.registration, k.ids.tick()),
      ),
    ).toEqual([{ subject: place, name: content, notYet: false }]);
    expect(Application.namedSubjects(k.companion, null)).toEqual([
      { subject: place, name: { from: "directory" }, notYet: false },
    ]);
    expect(() => Application.namedSubjects(k.companion, k.listing)).toThrow(
      "The registration read is not the one filed with",
    );
  });

  it("names every other subject through the directory", () => {
    const k = everyKind();
    const directory = { from: "directory" } as const;
    expect(Application.namedSubjects(k.affiliation, null)).toEqual([
      { subject: { kind: "place", id: k.p }, name: directory, notYet: false },
      {
        subject: { kind: "region", id: k.affiliation.target.regionId },
        name: directory,
        notYet: false,
      },
    ]);
    expect(Application.namedSubjects(k.listing, null)).toEqual([
      { subject: { kind: "place", id: k.p }, name: directory, notYet: false },
    ]);
    expect(ApplicationCase.contentNames(k.listing)).toEqual([
      {
        ref: { kind: "listing", id: k.listing.reservedListingId },
        name: "喫茶ルント",
      },
    ]);
  });
});

describe("ApplicationTarget.companion in a kind module", () => {
  it("refers to the registration until it is approved, then only to its place", () => {
    const k = everyKind();
    expect(companionTarget(k.registration, k.a)).toEqual(
      targets.stewardship(
        k.a,
        k.registration.reservedPlaceId,
        k.registration.id,
      ),
    );
    expect(
      companionTarget(approved(k.registration, k.ids.tick()), k.a),
    ).toEqual(targets.stewardship(k.a, k.registration.reservedPlaceId));
    expect(companionTarget(k.registration, k.ids.account())).toBeNull();
    const target = companionTarget(k.registration, k.a);
    if (target === null) throw new Error("expected a target");
    expect(
      Application.matchesSubmission(k.companion, { target, content: claim() }),
    ).toBe(true);
  });
});

describe("Application.requireApplicantAccount on other kinds", () => {
  it("is typed and checked for kinds whose approval appoints the applicant", () => {
    const k = everyKind();
    const email = EmailAddress.create("a@example.com");
    const account = { accountId: k.a, email };
    const call = () =>
      // @ts-expect-error a revision's approval appoints nobody
      Application.requireApplicantAccount(k.revision, account);
    expect(call).toThrow("A revision does not appoint its applicant");
  });
});

describe("Application.snapshot / reconstruct", () => {
  const k = everyKind();
  const at = () => k.ids.tick();
  const samples: readonly TestApplication[] = [
    k.registration,
    k.revision,
    k.stewardship,
    k.companion,
    k.affiliation,
    k.individualAffiliation,
    k.leave,
    k.participation,
    k.listing,
    k.listingRevision,
    returned(k.revision, at()),
    resubmitted(returned(k.affiliation, at()), at()),
    approved(k.leave, at(), "overdue_proxy"),
    approved(k.listing, at()),
    rejected(k.individualLeave, at()),
    rejected(k.listingRevision, at()),
    withdrawn(k.companion, at()),
    lapsed(k.participation, at(), {
      placeHasSteward: true,
      holdingStatus: "cancelled",
      participating: true,
    }),
  ];

  it.each(
    samples.map((app) => [app.target.kind, app.status.kind, app] as const),
  )("round-trips a %s application that is %s", (_kind, _status, app) => {
    const stored = JSON.parse(
      JSON.stringify(Application.snapshot(app)),
      (key, value) =>
        (key === "since" || key === "submittedAt") && typeof value === "string"
          ? new Date(value)
          : value,
    ) as ApplicationSnapshot;
    expect(Application.reconstruct(stored)).toEqual(app);
  });

  const base = Application.snapshot(k.affiliation);
  const broken: readonly [string, ApplicationSnapshot][] = [
    ["an unknown kind", { ...base, kind: "unknown" }],
    ["a kind that differs from its case", { ...base, kind: "leave" }],
    ["a malformed id", { ...base, id: " " }],
    ["a negative version", { ...base, version: -1 }],
    [
      "a steward-seat decision without reviewAs",
      { ...base, status: { ...base.status, kind: "approved", since: null } },
    ],
    [
      "an operator-seat decision with reviewAs",
      {
        ...Application.snapshot(approved(k.revision, at())),
        status: {
          ...Application.snapshot(approved(k.revision, at())).status,
          reviewAs: "approver",
        },
      },
    ],
    [
      "a lapse on a premise the application does not have",
      {
        ...base,
        status: {
          ...base.status,
          kind: "lapsed",
          since: null,
          brokenPremises: ["affiliated"],
        },
      },
    ],
    [
      "a lapse with no premise",
      {
        ...base,
        status: {
          ...base.status,
          kind: "lapsed",
          since: null,
          brokenPremises: [],
        },
      },
    ],
    [
      "fields of another status",
      { ...base, status: { ...base.status, reason: "理由" } },
    ],
    [
      "an untrimmed return request",
      {
        ...base,
        status: {
          ...base.status,
          kind: "returned",
          since: null,
          request: " 確認 ",
        },
      },
    ],
    ["a malformed case", { ...base, case: { target: null } }],
  ];

  it.each(broken)("refuses %s", (_label, snapshot) => {
    let error: unknown;
    try {
      Application.reconstruct(snapshot);
    } catch (caught) {
      error = caught;
    }
    expect(isRehydrationError(error)).toBe(true);
  });
});
