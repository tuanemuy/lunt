import { describe, expect, it } from "vitest";
import { AppServerError } from "../errorResponse";
import { classifyError } from "../errorState";
import { lostPublishPremise, publishSaveFailure } from "../publishPremise";

const conflict = new AppServerError({
  kind: "conflict",
  code: "OPTIMISTIC_LOCK_FAILURE",
  message: "conflict",
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

  it("leaves other failures alone without reading the premise", async () => {
    const failed = new Error("network");
    let read = false;
    const reported = await publishSaveFailure(failed, "REGION", async () => {
      read = true;
      return { published: true, suspended: false };
    });
    expect(reported).toBe(failed);
    expect(read).toBe(false);
  });
});
