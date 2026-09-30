// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CurrentLocationChip, LocationFeedback } from "../CurrentLocation";
import { locationFailure, useCurrentLocation } from "../useCurrentLocation";

type Success = (position: GeolocationPosition) => void;
type Failure = (error: GeolocationPositionError) => void;

function stubGeolocation() {
  const calls: { success: Success; failure: Failure }[] = [];
  const geolocation = {
    getCurrentPosition: vi.fn((success: Success, failure: Failure) => {
      calls.push({ success, failure });
    }),
  };
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: geolocation,
  });
  return {
    calls,
    succeed: (latitude: number, longitude: number) =>
      calls.at(-1)?.success({
        coords: { latitude, longitude, accuracy: 30 },
      } as GeolocationPosition),
    fail: (code: number) =>
      calls.at(-1)?.failure({ code } as GeolocationPositionError),
  };
}

function Harness({ resume = false }: { resume?: boolean }) {
  const { location, start, stop } = useCurrentLocation({
    resumeWhenGranted: resume,
  });
  return (
    <>
      <CurrentLocationChip location={location} onStart={start} onStop={stop} />
      <output>
        {location.status}
        {location.status === "on"
          ? ` ${location.position.latitude},${location.position.longitude}`
          : ""}
        {location.status === "unavailable" ? ` ${location.reason}` : ""}
      </output>
    </>
  );
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("locationFailure", () => {
  it("keeps a refusal apart from a position that could not be told", () => {
    expect(locationFailure(1)).toBe("denied");
    expect(locationFailure(2)).toBe("failed");
    expect(locationFailure(3)).toBe("failed");
  });
});

describe("useCurrentLocation with the chip", () => {
  it("asks on press, is busy while the browser answers, then is on", () => {
    const geo = stubGeolocation();
    render(<Harness />);
    const chip = screen.getByRole("button", { name: "現在地を使う" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(chip);
    expect(chip.getAttribute("aria-busy")).toBe("true");
    expect(chip.textContent).toBe("現在地を取得しています");

    act(() => geo.succeed(35.68, 139.76));
    expect(screen.getByRole("status").textContent).toBe("on 35.68,139.76");
    expect(chip.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(chip);
    expect(screen.getByRole("status").textContent).toBe("off");
  });

  it("tells a refusal and a failure apart (CS-03)", () => {
    const geo = stubGeolocation();
    render(<Harness />);
    const chip = screen.getByRole("button", { name: "現在地を使う" });

    fireEvent.click(chip);
    act(() => geo.fail(1));
    expect(screen.getByRole("status").textContent).toBe("unavailable denied");

    fireEvent.click(chip);
    act(() => geo.fail(3));
    expect(screen.getByRole("status").textContent).toBe("unavailable failed");
  });

  it("reports a device without location as unsupported", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "現在地を使う" }));
    expect(screen.getByRole("status").textContent).toBe(
      "unavailable unsupported",
    );
  });

  it("ignores an answer that arrives after stopping", () => {
    const geo = stubGeolocation();
    render(<Harness />);
    const chip = screen.getByRole("button", { name: "現在地を使う" });
    fireEvent.click(chip);
    const late = geo.calls[0];
    act(() => geo.succeed(35.68, 139.76));
    fireEvent.click(chip);
    act(() =>
      late?.success({
        coords: { latitude: 1, longitude: 1, accuracy: 1 },
      } as GeolocationPosition),
    );
    expect(screen.getByRole("status").textContent).toBe("off");
  });

  it("resumes by itself only when the permission is already granted", async () => {
    const geo = stubGeolocation();
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn(async () => ({ state: "granted" })) },
    });
    render(<Harness resume />);
    await act(async () => {});
    expect(geo.calls).toHaveLength(1);
    Reflect.deleteProperty(navigator, "permissions");
  });
});

describe("LocationFeedback", () => {
  it.each([
    ["denied", "位置情報を許可してやり直す"],
    ["unsupported", "位置情報を許可してやり直す"],
    ["failed", "現在地をもう一度取得する"],
    [null, "現在地を使う"],
  ] as const)("offers the next step for %s", (reason, label) => {
    const onRetry = vi.fn();
    render(
      <LocationFeedback
        reason={reason}
        onRetry={onRetry}
        areaAction={<a href="/filters">エリアを選ぶ</a>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "エリアを選んで、はじめる。" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "エリアを選ぶ" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
