import { describe, expect, it } from "vitest";
import {
  DEFAULT_VICINITY_RADIUS_METERS,
  readDiscoverySettings,
} from "../discovery";

describe("Discovery wiring", () => {
  it("defaults the vicinity radius and reads an override", () => {
    expect(readDiscoverySettings({})).toEqual({
      vicinityRadiusMeters: DEFAULT_VICINITY_RADIUS_METERS,
    });
    expect(DEFAULT_VICINITY_RADIUS_METERS).toBe(3000);
    expect(readDiscoverySettings({ VICINITY_RADIUS_METERS: "1500" })).toEqual({
      vicinityRadiusMeters: 1500,
    });
  });

  it("refuses a radius that is not a positive finite number", () => {
    for (const value of ["0", "", "-1", "abc", "Infinity"]) {
      expect(() =>
        readDiscoverySettings({ VICINITY_RADIUS_METERS: value }),
      ).toThrow();
    }
  });
});
