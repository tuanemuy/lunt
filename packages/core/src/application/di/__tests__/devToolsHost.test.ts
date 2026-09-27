import { createInProcessState } from "@repo/core/adapters/do/testing/inProcessState";
import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { SystemClock } from "@repo/core/application/ports/clock";
import { describe, expect, it, vi } from "vitest";
import { devToolsEnabled, requestClock } from "../clock";
import {
  createRequestContainer,
  DEV_OPS_TOKEN,
  DEV_SESSION_SECRET,
  readRuntimeSettings,
} from "../container";

// design.md D-19: with DEV_TOOLS=1 the development tools answer only
// requests to this machine, unless DEV_TOOLS_ALLOW_REMOTE=1.

const LOCAL_DEV = {
  APP_URL: "http://localhost:3000",
  DEV_TOOLS: "1",
  SESSION_SECRET: DEV_SESSION_SECRET,
  OPS_TOKEN: DEV_OPS_TOKEN,
} as const;
const STRONG = "k".repeat(40);

describe("development tools by request host", () => {
  it("are on for localhost, 127.0.0.1 and [::1], and for queue and scheduled runs", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]", "LOCALHOST", null]) {
      expect(devToolsEnabled({ DEV_TOOLS: "1" }, host)).toBe(true);
    }
  });

  it("are off for any other host unless DEV_TOOLS_ALLOW_REMOTE=1", () => {
    for (const host of [
      "lunt.example",
      "192.168.1.20",
      "localhost.evil.example",
    ]) {
      expect(devToolsEnabled({ DEV_TOOLS: "1" }, host)).toBe(false);
      expect(
        devToolsEnabled({ DEV_TOOLS: "1", DEV_TOOLS_ALLOW_REMOTE: "1" }, host),
      ).toBe(true);
    }
    expect(
      devToolsEnabled({ DEV_TOOLS_ALLOW_REMOTE: "1" }, "lunt.example"),
    ).toBe(false);
  });

  it("refuse the public development secrets for a remote request", () => {
    expect(readRuntimeSettings(LOCAL_DEV, "localhost").devTools).toBe(true);
    expect(() => readRuntimeSettings(LOCAL_DEV, "lunt.example")).toThrow();
    expect(
      readRuntimeSettings(
        { ...LOCAL_DEV, SESSION_SECRET: STRONG, OPS_TOKEN: STRONG },
        "lunt.example",
      ).devTools,
    ).toBe(false);
    expect(
      readRuntimeSettings(
        { ...LOCAL_DEV, DEV_TOOLS_ALLOW_REMOTE: "1" },
        "lunt.example",
      ).devTools,
    ).toBe(true);
  });

  it("keep the development clock's offset away from a remote request", async () => {
    const devClockOffset = vi.fn(async () => 86_400_000);
    expect(
      await requestClock(
        { DEV_TOOLS: "1" },
        { devClockOffset },
        "lunt.example",
      ),
    ).toBe(SystemClock);
    expect(devClockOffset).not.toHaveBeenCalled();
    const allowed = await requestClock(
      { DEV_TOOLS: "1", DEV_TOOLS_ALLOW_REMOTE: "1" },
      { devClockOffset },
      "lunt.example",
    );
    expect(allowed.now().getTime() - Date.now()).toBeGreaterThan(86_000_000);
  });

  it("refuse the development inbox and the fake provider for a remote request, and allow them with ALLOW_REMOTE", () => {
    const { client } = createInProcessState({
      clock: SystemClock,
      idGenerator: new FakeIdGenerator(),
    });
    const withStrongSecrets = {
      ...LOCAL_DEV,
      SESSION_SECRET: STRONG,
      OPS_TOKEN: STRONG,
    };
    // MAIL_TRANSPORT and EXTERNAL_IDP default to devInbox and fake.
    expect(() =>
      createRequestContainer(
        withStrongSecrets,
        client,
        { notificationMailRenderer: () => ({}) as never },
        SystemClock,
        "lunt.example",
      ),
    ).toThrow();
    const remote = createRequestContainer(
      { ...withStrongSecrets, DEV_TOOLS_ALLOW_REMOTE: "1" },
      client,
      { notificationMailRenderer: () => ({}) as never },
      SystemClock,
      "lunt.example",
    );
    expect(remote.runtime.devTools).toBe(true);
    expect(remote.devClock).not.toBeNull();
    expect(remote.fakeIdp).not.toBeNull();
    const local = createRequestContainer(
      withStrongSecrets,
      client,
      { notificationMailRenderer: () => ({}) as never },
      SystemClock,
      "localhost",
    );
    expect(local.runtime.devTools).toBe(true);
  });
});
