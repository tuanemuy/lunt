import { createInProcessState } from "@repo/core/adapters/do/testing/inProcessState";
import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { createTestContainer } from "@repo/core/application/__tests__/testContainer";
import {
  dailyJobsRunAutomatically,
  requestClock,
} from "@repo/core/application/di/clock";
import { createDevServices } from "@repo/core/application/di/dev";
import { ForbiddenError } from "@repo/core/application/errors";
import { SystemClock } from "@repo/core/application/ports/clock";
import { describe, expect, it, vi } from "vitest";
import {
  advanceDevClock,
  readDevClock,
  resetDevClock,
  runDailyJobsNow,
} from "../devClock";

const DAY_MS = 24 * 60 * 60 * 1000;

function state() {
  return createInProcessState({
    clock: SystemClock,
    idGenerator: new FakeIdGenerator(),
  });
}

describe("development clock (F-06)", () => {
  it("runs a request's clock ahead by the offset once advanced, with the development tools on", async () => {
    const { client } = state();
    expect(await requestClock({ DEV_TOOLS: "1" }, client)).toBe(SystemClock);

    await client.devAdvanceClock(3 * DAY_MS);
    await client.devAdvanceClock(DAY_MS);
    const clock = await requestClock({ DEV_TOOLS: "1" }, client);

    const ahead = clock.now().getTime() - Date.now();
    expect(ahead).toBeGreaterThan(4 * DAY_MS - 60_000);
    expect(ahead).toBeLessThanOrEqual(4 * DAY_MS + 1_000);
  });

  it("never moves back", async () => {
    const { client } = state();
    for (const ms of [0, -1, 1.5, Number.NaN]) {
      expect((await client.devAdvanceClock(ms)).kind).toBe("refused");
    }
    expect(await client.devClockOffset()).toBe(0);
  });

  it("is ignored by a deployed configuration: the wall clock, the offset never read", async () => {
    const devClockOffset = vi.fn(async () => 5 * DAY_MS);
    for (const env of [{}, { DEV_TOOLS: "0" }, { DEV_TOOLS: "" }]) {
      expect(await requestClock(env, { devClockOffset })).toBe(SystemClock);
    }
    expect(devClockOffset).not.toHaveBeenCalled();
  });

  it("stops the Cron run of the daily jobs only with the development tools on", () => {
    expect(dailyJobsRunAutomatically({})).toBe(true);
    expect(dailyJobsRunAutomatically({ DEV_TOOLS: "1" })).toBe(true);
    expect(
      dailyJobsRunAutomatically({ DEV_TOOLS: "1", DAILY_JOBS_AUTO: "off" }),
    ).toBe(false);
    expect(dailyJobsRunAutomatically({ DAILY_JOBS_AUTO: "off" })).toBe(true);
    expect(
      dailyJobsRunAutomatically({ DEV_TOOLS: "0", DAILY_JOBS_AUTO: "off" }),
    ).toBe(true);
  });

  it("reads, advances and runs the daily jobs from the development tools", async () => {
    const { container } = createTestContainer();

    expect((await readDevClock({ container, input: {} })).offsetMs).toBe(0);
    expect(
      await advanceDevClock({ container, input: { ms: 2 * DAY_MS } }),
    ).toEqual({ offsetMs: 2 * DAY_MS });
    expect((await readDevClock({ container, input: {} })).offsetMs).toBe(
      2 * DAY_MS,
    );

    await resetDevClock({ container, input: {} });
    expect((await readDevClock({ container, input: {} })).offsetMs).toBe(0);
    await advanceDevClock({ container, input: { ms: 2 * DAY_MS } });

    const results = await runDailyJobsNow({ container, input: {} });
    expect(results.map((result) => result.name)).toContain(
      "purgeClosedLoginChallenges",
    );
    expect(results.every((result) => result.outcome.kind === "completed")).toBe(
      true,
    );
  });

  it("refuses every development clock operation when the development tools are off", async () => {
    const { container } = createTestContainer();
    const off = {
      ...container,
      runtime: { ...container.runtime, devTools: false },
      devClock: null,
    };
    await expect(
      readDevClock({ container: off, input: {} }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      advanceDevClock({ container: off, input: { ms: DAY_MS } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runDailyJobsNow({ container: off, input: {} }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      resetDevClock({ container: off, input: {} }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("puts no development clock on a container without the development tools", () => {
    const { client } = state();
    const deps = (devTools: boolean) => ({
      client,
      shared: {
        clock: SystemClock,
        idGenerator: new FakeIdGenerator(),
        logger: console,
      },
      runtime: { devTools, sessionSecret: "s".repeat(32), opsToken: null },
      presentation: {} as never,
    });
    expect(createDevServices(deps(false)).devClock).toBeNull();
    expect(createDevServices(deps(true)).devClock).not.toBeNull();
  });
});
