import { ExposureSubject } from "@repo/core/domain/common/exposureSubject";
import {
  type Exposure,
  Publication,
  PublishConditionUnmetError,
} from "@repo/core/domain/common/publication";
import { Suspension } from "@repo/core/domain/common/suspension";
import { describe, expect, it } from "vitest";
import { catchError, expectBusinessError } from "./expectBusinessError";

const first = new Date("2026-01-01T00:00:00Z");
const now = new Date("2026-09-28T00:00:00Z");

const draft: Publication = { status: "draft" };
const published: Publication = { status: "published", firstPublishedAt: first };
const unpublishedByManager: Publication = {
  status: "unpublished",
  firstPublishedAt: first,
  reason: "byManager",
};
const unpublishedByTakedown: Publication = {
  status: "unpublished",
  firstPublishedAt: first,
  reason: "photoTakedown",
};

const on = (publication: Publication, suspended = false): Exposure => ({
  publication,
  suspension: { suspended },
});

describe("Publication.publish (suspended → published → missing → ok)", () => {
  it("draft → published sets firstPublishedAt to now", () => {
    expect(Publication.publish(on(draft), [], now, "LISTING")).toEqual({
      status: "published",
      firstPublishedAt: now,
    });
  });

  it.each([
    ["byManager", unpublishedByManager],
    ["photoTakedown", unpublishedByTakedown],
  ])("unpublished (%s) → published keeps firstPublishedAt", (_label, pub) => {
    expect(Publication.publish(on(pub), [], now, "REGION")).toEqual({
      status: "published",
      firstPublishedAt: first,
    });
  });

  it("published → published is COMMON_PUBLICATION_INVALID_TRANSITION", () => {
    expectBusinessError(
      () => Publication.publish(on(published), [], now, "OCCASION"),
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
  });

  it("non-empty missing is {subject}_PUBLISH_CONDITION_UNMET carrying the items", () => {
    const error = catchError(() =>
      Publication.publish(on(draft), ["photos", "name"], now, "LISTING"),
    );
    expect(error).toBeInstanceOf(PublishConditionUnmetError);
    const unmet = error as PublishConditionUnmetError<"LISTING", string>;
    expect(unmet.code).toBe("LISTING_PUBLISH_CONDITION_UNMET");
    expect(unmet.missing).toEqual(["photos", "name"]);
    expect(unmet.toSerialized()).toEqual({
      kind: "business",
      code: "LISTING_PUBLISH_CONDITION_UNMET",
      message: "Publish condition unmet",
      retryable: false,
      missing: ["photos", "name"],
    });
  });

  it.each(ExposureSubject.all)(
    "suspension is checked first for %s (before invalid transition and missing)",
    (subject) => {
      expectBusinessError(
        () => Publication.publish(on(published, true), ["x"], now, subject),
        `${subject}_SUSPENDED`,
      );
      expectBusinessError(
        () => Publication.publish(on(draft, true), ["x"], now, subject),
        `${subject}_SUSPENDED`,
      );
    },
  );

  it("invalid transition is checked before missing", () => {
    expectBusinessError(
      () => Publication.publish(on(published), ["photos"], now, "ARTICLE"),
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
  });

  it("a re-publish lacking a condition stays rejected (unpublished with missing)", () => {
    expectBusinessError(
      () =>
        Publication.publish(
          on(unpublishedByTakedown),
          ["photos"],
          now,
          "ARTICLE",
        ),
      "ARTICLE_PUBLISH_CONDITION_UNMET",
    );
  });

  it("articles pass Suspension.none and are never suspended", () => {
    expect(
      Publication.publish(
        { publication: draft, suspension: Suspension.none },
        [],
        now,
        "ARTICLE",
      ).status,
    ).toBe("published");
  });
});

describe("Publication.unpublish", () => {
  it.each(["byManager", "photoTakedown"] as const)(
    "published → unpublished with reason %s, firstPublishedAt kept",
    (reason) => {
      expect(Publication.unpublish(on(published), reason, "LISTING")).toEqual({
        status: "unpublished",
        firstPublishedAt: first,
        reason,
      });
    },
  );

  it("byManager while suspended is {subject}_SUSPENDED, checked before the transition", () => {
    expectBusinessError(
      () => Publication.unpublish(on(published, true), "byManager", "REGION"),
      "REGION_SUSPENDED",
    );
    expectBusinessError(
      () => Publication.unpublish(on(draft, true), "byManager", "OCCASION"),
      "OCCASION_SUSPENDED",
    );
  });

  it("photoTakedown does not check suspension: a suspended published target is unpublished", () => {
    expect(
      Publication.unpublish(on(published, true), "photoTakedown", "LISTING"),
    ).toEqual({
      status: "unpublished",
      firstPublishedAt: first,
      reason: "photoTakedown",
    });
  });

  it.each([
    ["draft", draft],
    ["unpublished", unpublishedByManager],
  ])("from %s is COMMON_PUBLICATION_INVALID_TRANSITION", (_label, pub) => {
    expectBusinessError(
      () => Publication.unpublish(on(pub), "byManager", "LISTING"),
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
    expectBusinessError(
      () => Publication.unpublish(on(pub, true), "photoTakedown", "LISTING"),
      "COMMON_PUBLICATION_INVALID_TRANSITION",
    );
  });
});

describe("Publication helpers", () => {
  it("draft() is the initial state", () => {
    expect(Publication.draft()).toEqual({ status: "draft" });
  });

  it("assertConditionMet raises the same UNMET error with the items, and passes on empty", () => {
    expect(() => Publication.assertConditionMet([], "REGION")).not.toThrow();
    const error = catchError(() =>
      Publication.assertConditionMet(["name"], "REGION"),
    );
    expect(error).toBeInstanceOf(PublishConditionUnmetError);
    expect((error as PublishConditionUnmetError).code).toBe(
      "REGION_PUBLISH_CONDITION_UNMET",
    );
    expect((error as PublishConditionUnmetError).missing).toEqual(["name"]);
  });

  it("isPublished", () => {
    expect(Publication.isPublished(published)).toBe(true);
    expect(Publication.isPublished(unpublishedByManager)).toBe(false);
  });
});

describe("Suspension", () => {
  it.each(ExposureSubject.all)(
    "%s: suspend / unsuspend round trip",
    (subject) => {
      const suspended = Suspension.suspend({ suspended: false }, subject);
      expect(suspended).toEqual({ suspended: true });
      expect(Suspension.unsuspend(suspended, subject)).toEqual({
        suspended: false,
      });
    },
  );

  it.each(ExposureSubject.all)(
    "%s: suspending twice is {subject}_ALREADY_SUSPENDED",
    (subject) => {
      expectBusinessError(
        () => Suspension.suspend({ suspended: true }, subject),
        `${subject}_ALREADY_SUSPENDED`,
      );
    },
  );

  it.each(ExposureSubject.all)(
    "%s: lifting a non-suspension is {subject}_NOT_SUSPENDED",
    (subject) => {
      expectBusinessError(
        () => Suspension.unsuspend({ suspended: false }, subject),
        `${subject}_NOT_SUSPENDED`,
      );
    },
  );

  it("suspend and unsuspend are independent of the publication state (any state can be suspended)", () => {
    for (const publication of [draft, published, unpublishedByManager]) {
      const exposure = on(publication);
      const suspended = {
        ...exposure,
        suspension: Suspension.suspend(exposure.suspension, "LISTING"),
      };
      expect(suspended.publication).toBe(publication);
      expect(Suspension.unsuspend(suspended.suspension, "LISTING")).toEqual({
        suspended: false,
      });
    }
  });
});
