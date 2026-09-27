import { createTestContainer } from "@repo/core/application/__tests__/testContainer";
import { TEST_APP_URL } from "@repo/core/application/account/__tests__/testServices";
import { beginExternalLogin } from "@repo/core/application/account/beginExternalLogin";
import { ForbiddenError, NotFoundError } from "@repo/core/application/errors";
import { describe, expect, it } from "vitest";
import { answerFakeIdp, checkFakeIdpRequest } from "../fakeIdp";

const CALLBACK = `${TEST_APP_URL}/login/external/google/callback`;

async function authorizeQuery(redirectUri = CALLBACK) {
  const { container } = createTestContainer();
  const { authorizationUrl } = await beginExternalLogin({
    container,
    input: { provider: "google", redirectUri },
  });
  return { container, query: new URL(authorizationUrl).search.slice(1) };
}

describe("fake provider screen", () => {
  it("shows where a valid request returns to and answers it with a signed code", async () => {
    const { container, query } = await authorizeQuery();

    expect(await checkFakeIdpRequest({ container, input: { query } })).toEqual({
      kind: "valid",
      returnsTo: "/login/external/google/callback",
    });
    const { location } = await answerFakeIdp({
      container,
      input: {
        query,
        choice: { kind: "verified", email: "u@example.com" },
      },
    });
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe(CALLBACK);
    expect(url.searchParams.get("code")).not.toBeNull();
    expect(url.searchParams.get("state")).toBe(
      new URLSearchParams(query).get("state"),
    );
  });

  it("answers a cancel with access_denied", async () => {
    const { container, query } = await authorizeQuery();
    const { location } = await answerFakeIdp({
      container,
      input: { query, choice: { kind: "cancel" } },
    });
    expect(new URL(location).searchParams.get("error")).toBe("access_denied");
  });

  it("refuses a request that returns to another origin or is malformed", async () => {
    const { container, query } = await authorizeQuery();
    const foreign = new URLSearchParams(query);
    foreign.set("redirect_uri", "https://evil.example/callback");

    for (const bad of [foreign.toString(), "client_id=x"]) {
      expect(
        await checkFakeIdpRequest({ container, input: { query: bad } }),
      ).toEqual({ kind: "invalid" });
      await expect(
        answerFakeIdp({
          container,
          input: { query: bad, choice: { kind: "cancel" } },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it("is refused when the development tools are off", async () => {
    const { container, query } = await authorizeQuery();
    const off = {
      ...container,
      runtime: { ...container.runtime, devTools: false },
    };
    await expect(
      checkFakeIdpRequest({ container: off, input: { query } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
