// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MapCanvasProps } from "@/components/map/MapCanvas";
import { PositionField, type PositionValue } from "../PositionField";
import {
  formatCoordinate,
  parsePosition,
  positionText,
} from "../PositionField/position";

vi.mock("@/components/map/useMapStyleUrl", () => ({
  useMapStyleUrl: () => "https://tiles.example/style.json",
}));

vi.mock("@/components/map/MapCanvas", () => ({
  MapCanvas: ({ label, picked, onPick, interactive }: MapCanvasProps) => (
    <section aria-label={label} data-interactive={String(interactive ?? true)}>
      {picked?.position ? <span>{picked.mark}</span> : null}
      {onPick ? (
        <button
          type="button"
          onClick={() => onPick({ latitude: 35.6812345, longitude: 139.7671 })}
        >
          地図をタップ
        </button>
      ) : null}
    </section>
  ),
}));

beforeAll(() => {
  // happy-dom lacks the modal API; the picker only needs it to open and close.
  HTMLDialogElement.prototype.showModal ??= function showModal(
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
  };
});

afterEach(cleanup);

function Harness({ initial }: { initial: PositionValue }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PositionField
        {...value}
        onChange={setValue}
        idPrefix="place"
        legend="位置"
        requirement="required"
        subject="店舗"
        mark="店"
      />
      <output data-testid="value">{`${value.latitude},${value.longitude}`}</output>
    </>
  );
}

describe("position text", () => {
  it("reads a point only when both numbers are in range", () => {
    expect(parsePosition("35.68", " 139.76 ")).toEqual({
      latitude: 35.68,
      longitude: 139.76,
    });
    expect(parsePosition("", "139.76")).toBeNull();
    expect(parsePosition("91", "139.76")).toBeNull();
    expect(parsePosition("35.68", "abc")).toBeNull();
  });

  it("writes six decimals and names the hemisphere", () => {
    expect(formatCoordinate(35.68123456)).toBe("35.681235");
    expect(formatCoordinate(139.5)).toBe("139.5");
    expect(positionText({ latitude: -33.8688, longitude: -70.6693 })).toBe(
      "南緯 33.86880、西経 70.66930",
    );
  });
});

describe("PositionField", () => {
  it("starts with no point, and a point picked on the map becomes the value", () => {
    render(<Harness initial={{ latitude: "", longitude: "" }} />);
    expect(screen.getByText("位置はまだ指定していません")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "地図で位置を指定する" }),
    );
    const confirm = screen.getByRole("button", { name: "この位置にする" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "地図をタップ" }));
    expect(
      screen.getByText("選んだ位置: 北緯 35.68123、東経 139.76710"),
    ).toBeTruthy();
    fireEvent.click(confirm);

    expect(screen.getByTestId("value").textContent).toBe("35.681235,139.7671");
    expect(
      screen.getByRole("region", {
        name: "位置の地図（北緯 35.68124、東経 139.76710）",
      }).dataset.interactive,
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: "地図で位置を選び直す" }),
    ).toBeTruthy();
  });

  it("leaves the value as it was when the picker is left", () => {
    render(<Harness initial={{ latitude: "35.1", longitude: "139.1" }} />);
    fireEvent.click(
      screen.getByRole("button", { name: "地図で位置を選び直す" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "地図をタップ" }));
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(screen.getByTestId("value").textContent).toBe("35.1,139.1");
  });

  it("edits the same value as numbers, opened when the typed text is not a point", () => {
    render(<Harness initial={{ latitude: "35.1", longitude: "x" }} />);
    const details = screen.getByText("緯度・経度で入力する").closest("details");
    expect(details?.open).toBe(true);
    fireEvent.change(screen.getByLabelText("経度"), {
      target: { value: "139.2" },
    });
    expect(screen.getByTestId("value").textContent).toBe("35.1,139.2");
  });
});
