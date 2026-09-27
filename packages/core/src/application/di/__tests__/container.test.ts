import { describe, expect, it } from "vitest";
import {
  DEV_OPS_TOKEN,
  DEV_SESSION_SECRET,
  readRuntimeSettings,
} from "../container";

const APP_URL = "http://localhost:3000";
const STRONG = "k".repeat(40);

describe("readRuntimeSettings", () => {
  it("turns the development tools on only for DEV_TOOLS=1", () => {
    expect(
      readRuntimeSettings({
        APP_URL,
        DEV_TOOLS: "1",
        SESSION_SECRET: DEV_SESSION_SECRET,
        OPS_TOKEN: DEV_OPS_TOKEN,
      }),
    ).toEqual({
      devTools: true,
      sessionSecret: DEV_SESSION_SECRET,
      opsToken: DEV_OPS_TOKEN,
    });
    expect(
      readRuntimeSettings({ APP_URL, SESSION_SECRET: STRONG }).devTools,
    ).toBe(false);
  });

  it("refuses the public development secret while the development tools are off", () => {
    expect(() =>
      readRuntimeSettings({
        APP_URL,
        DEV_TOOLS: "0",
        SESSION_SECRET: DEV_SESSION_SECRET,
      }),
    ).toThrow("SESSION_SECRET");
  });

  it("refuses a missing or short secret", () => {
    expect(() => readRuntimeSettings({ APP_URL, DEV_TOOLS: "1" })).toThrow();
    expect(() =>
      readRuntimeSettings({ APP_URL, SESSION_SECRET: "short" }),
    ).toThrow();
  });

  it("turns the operations endpoints off without a token and refuses the public one in production", () => {
    expect(
      readRuntimeSettings({ APP_URL, SESSION_SECRET: STRONG }).opsToken,
    ).toBeNull();
    expect(
      readRuntimeSettings({
        APP_URL,
        SESSION_SECRET: STRONG,
        OPS_TOKEN: `${STRONG}-ops`,
      }).opsToken,
    ).toBe(`${STRONG}-ops`);
    expect(() =>
      readRuntimeSettings({
        APP_URL,
        SESSION_SECRET: STRONG,
        OPS_TOKEN: DEV_OPS_TOKEN,
      }),
    ).toThrow("OPS_TOKEN");
    expect(() =>
      readRuntimeSettings({ APP_URL, SESSION_SECRET: STRONG, OPS_TOKEN: "x" }),
    ).toThrow();
  });
});
