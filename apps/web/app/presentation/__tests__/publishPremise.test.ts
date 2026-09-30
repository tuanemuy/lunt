import { describe, expect, it } from "vitest";
import { AppServerError } from "../errorResponse";
import { classifyError } from "../errorState";
import { lostPublishPremise, publishSaveFailure } from "../publishPremise";

const conflict = new AppServerError({
  kind: "conflict",
  code: "OPTIMISTIC_LOCK_FAILURE",
  message: "conflict",
});

const unmet = new AppServerError({
  kind: "business",
  code: "ARTICLE_PUBLISH_CONDITION_UNMET",
  message: "unmet",
  missing: ["body"],
});

const invalidTitle = new AppServerError({
  kind: "validation",
  code: "VALIDATION_ERROR",
  message: "invalid",
  fieldErrors: { title: ["too long"] },
});

describe("lostPublishPremise", () => {
  it("names the refusal a publish would meet, suspension first", () => {
    expect(
      lostPublishPremise("LISTING", { published: true, suspended: true }),
    ).toBe("LISTING_SUSPENDED");
    expect(
      lostPublishPremise("ARTICLE", { published: true, suspended: false }),
    ).toBe("COMMON_PUBLICATION_INVALID_TRANSITION");
    expect(
      lostPublishPremise("REGION", { published: false, suspended: false }),
    ).toBeNull();
  });
});

describe("publishSaveFailure", () => {
  it("answers a save conflict with CS-08 once someone else published (CS-08 before CS-07)", async () => {
    const reported = await publishSaveFailure(
      conflict,
      "ARTICLE",
      async () => ({
        published: true,
        suspended: false,
      }),
    );
    const state = classifyError(reported);
    expect(state.kind).toBe("premiseChanged");
    expect(state.code).toBe("COMMON_PUBLICATION_INVALID_TRANSITION");
  });

  it("keeps the conflict while the premise holds", async () => {
    const reported = await publishSaveFailure(
      conflict,
      "OCCASION",
      async () => ({
        published: false,
        suspended: false,
      }),
    );
    expect(reported).toBe(conflict);
  });

  it("keeps the conflict when the premise cannot be read", async () => {
    const reported = await publishSaveFailure(conflict, "LISTING", () =>
      Promise.reject(new Error("offline")),
    );
    expect(reported).toBe(conflict);
  });

  it("answers the publish condition a save met on someone else's publication with CS-08, not CS-10", async () => {
    const reported = await publishSaveFailure(unmet, "ARTICLE", async () => ({
      published: true,
      suspended: false,
    }));
    const state = classifyError(reported);
    expect(state.kind).toBe("premiseChanged");
    expect(state.code).toBe("COMMON_PUBLICATION_INVALID_TRANSITION");
  });

  it("answers an input error with CS-08 once the target was suspended", async () => {
    const reported = await publishSaveFailure(
      invalidTitle,
      "LISTING",
      async () => ({
        published: false,
        suspended: true,
      }),
    );
    const state = classifyError(reported);
    expect(state.kind).toBe("premiseChanged");
    expect(state.code).toBe("LISTING_SUSPENDED");
  });

  it("keeps the input error while the premise holds", async () => {
    const reported = await publishSaveFailure(
      invalidTitle,
      "ARTICLE",
      async () => ({
        published: false,
        suspended: false,
      }),
    );
    expect(reported).toBe(invalidTitle);
  });

  it.each([
    ["the target is gone (CS-17)", "notFound", "ARTICLE_NOT_FOUND"],
    ["the permission is lost (CS-05)", "forbidden", "FORBIDDEN"],
    ["the session ended (CS-04)", "unauthorized", "LOGIN_REQUIRED"],
  ] as const)(
    "reports the premise read's refusal over the conflict when %s",
    async (_, kind, code) => {
      const refused = new AppServerError({ kind, code, message: code });
      for (const saveError of [conflict, unmet]) {
        const reported = await publishSaveFailure(saveError, "REGION", () =>
          Promise.reject(refused),
        );
        expect(reported).toBe(refused);
      }
    },
  );

  it("leaves other failures alone without reading the premise", async () => {
    const failures = [
      new Error("network"),
      new AppServerError({
        kind: "notFound",
        code: "REGION_NOT_FOUND",
        message: "gone",
      }),
      new AppServerError({
        kind: "forbidden",
        code: "FORBIDDEN",
        message: "forbidden",
      }),
    ];
    for (const failed of failures) {
      let read = false;
      const reported = await publishSaveFailure(failed, "REGION", async () => {
        read = true;
        return { published: true, suspended: false };
      });
      expect(reported).toBe(failed);
      expect(read).toBe(false);
    }
  });
});
