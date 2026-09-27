import { createNodeHarness } from "@repo/core/adapters/do/testing/nodeHarness";
import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { FakeLogger } from "@repo/core/application/__tests__/fakes/fakeLogger";
import type { RequestContainer } from "@repo/core/application/di/types";
import { ForbiddenError } from "@repo/core/application/errors";
import { isBusinessRuleError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { devDescribeAccount, devSignIn } from "../devSignIn";

function container(devTools: boolean): RequestContainer {
  const harness = createNodeHarness();
  return {
    clock: { now: () => new Date("2026-09-28T00:00:00.000Z") },
    idGenerator: new FakeIdGenerator(),
    logger: new FakeLogger(),
    config: {
      appUrl: "http://localhost:3000",
      siteName: "Lunt",
      defaultTitle: "Lunt",
      defaultDescription: "",
      themeColor: "#fff",
    },
    runtime: { devTools, sessionSecret: "x".repeat(32) },
    unitOfWorkProvider: harness.uow,
  };
}

describe("devSignIn", () => {
  it("creates the account on the first sign-in and reuses it afterwards", async () => {
    const c = container(true);
    const first = await devSignIn({
      container: c,
      input: { email: " Dev@Example.com " },
    });
    const second = await devSignIn({
      container: c,
      input: { email: "dev@example.com" },
    });
    expect(second.accountId).toBe(first.accountId);
    expect(
      await devDescribeAccount({
        container: c,
        input: { accountId: first.accountId },
      }),
    ).toEqual({ accountId: first.accountId, email: "dev@example.com" });
  });

  it("rejects an invalid email address", async () => {
    const error = await devSignIn({
      container: container(true),
      input: { email: "nope" },
    }).catch((thrown: unknown) => thrown);
    expect(isBusinessRuleError(error)).toBe(true);
  });

  it("is refused while the development tools are off", async () => {
    await expect(
      devSignIn({ container: container(false), input: { email: "a@b.jp" } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
