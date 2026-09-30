// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapCanvas, type MapCanvasProps } from "../MapCanvas";
import type { MapBounds, MapPin } from "../types";

type Listener = (event: Record<string, unknown>) => void;

class FakeMap {
  static instances: FakeMap[] = [];
  readonly listeners = new Map<string, Listener[]>();
  readonly fitBounds = vi.fn();
  readonly easeTo = vi.fn();
  readonly remove = vi.fn();
  readonly touchZoomRotate = { disableRotation: vi.fn() };
  readonly keyboard = { disableRotation: vi.fn() };
  readonly canvas = document.createElement("canvas");
  readonly container: HTMLElement;

  constructor(readonly options: { container: HTMLElement; style: unknown }) {
    this.container = options.container;
    this.container.appendChild(this.canvas);
    FakeMap.instances.push(this);
  }
  on(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    return this;
  }
  once(type: string, listener: Listener) {
    return this.on(type, listener);
  }
  fire(type: string, event: Record<string, unknown> = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  addControl() {
    return this;
  }
  getCanvas() {
    return this.canvas;
  }
  getCenter() {
    return { lat: 35.7, lng: 139.8 };
  }
  getZoom() {
    return 13;
  }
  getBounds() {
    return {
      getWest: () => 139.7,
      getSouth: () => 35.6,
      getEast: () => 139.9,
      getNorth: () => 35.8,
    };
  }
}

class FakeMarker {
  readonly element: HTMLElement;
  lngLat: [number, number] | null = null;
  constructor(options: { element: HTMLElement }) {
    this.element = options.element;
  }
  setLngLat(lngLat: [number, number]) {
    this.lngLat = lngLat;
    return this;
  }
  addTo(map: FakeMap) {
    this.element.classList.add("maplibregl-marker");
    map.container.appendChild(this.element);
    return this;
  }
  remove() {
    this.element.remove();
    return this;
  }
}

vi.mock("../MapCanvas/loadMaplibre", () => ({
  maplibre: {
    Map: FakeMap,
    Marker: FakeMarker,
    NavigationControl: class {},
  },
}));

const EXTENT: MapBounds = {
  southWest: { latitude: 35.69, longitude: 139.76 },
  northEast: { latitude: 35.7, longitude: 139.78 },
};

const PINS: readonly MapPin[] = [
  {
    kind: "target",
    target: "place",
    key: "place-1",
    position: { latitude: 35.69, longitude: 139.76 },
    label: "喫茶 日々",
    selected: true,
  },
  {
    kind: "cluster",
    key: "cluster-1",
    position: { latitude: 35.695, longitude: 139.77 },
    label: "店舗 3 件",
    count: 3,
    extent: EXTENT,
  },
  {
    kind: "region",
    key: "region-1",
    position: { latitude: 35.7, longitude: 139.75 },
    label: "まち こもれび商店街",
    name: "こもれび商店街",
    selected: false,
  },
];

const STYLE_URL = "https://tiles.example/style.json";

function props(overrides: Partial<MapCanvasProps> = {}): MapCanvasProps {
  return {
    styleUrl: STYLE_URL,
    label: "地図",
    viewport: { kind: "bounds", bounds: EXTENT },
    pins: PINS,
    ...overrides,
  };
}

async function mount(overrides: Partial<MapCanvasProps> = {}) {
  const view = render(<MapCanvas {...props(overrides)} />);
  await act(async () => {});
  const map = FakeMap.instances.at(-1);
  if (map === undefined) throw new Error("the map was not created");
  return { ...view, map };
}

async function load(map: FakeMap) {
  await act(async () => {
    map.fire("sourcedata", { tile: {} });
    map.fire("load");
  });
}

beforeEach(() => {
  FakeMap.instances = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MapCanvas", () => {
  it("renders only the loading state on the server", () => {
    const html = renderToString(<MapCanvas {...props()} />);
    expect(html).toContain("地図を読み込んでいます");
    expect(html).toContain('aria-label="地図"');
    expect(html).not.toContain("map-pin");
    expect(FakeMap.instances).toHaveLength(0);
  });

  it("opens on the viewport, then reports the settled range and shows the pins", async () => {
    const onViewportChange = vi.fn();
    const { map } = await mount({ onViewportChange });
    expect(map.options).toMatchObject({
      style: STYLE_URL,
      bounds: [
        [139.76, 35.69],
        [139.78, 35.7],
      ],
    });
    expect(screen.getByText("地図を読み込んでいます")).toBeTruthy();

    await load(map);

    expect(screen.queryByText("地図を読み込んでいます")).toBeNull();
    expect(onViewportChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cause: "initial",
        zoom: 13,
        bounds: {
          southWest: { latitude: 35.6, longitude: 139.7 },
          northEast: { latitude: 35.8, longitude: 139.9 },
        },
      }),
    );
    const place = screen.getByRole("button", { name: "喫茶 日々" });
    expect(place.getAttribute("aria-pressed")).toBe("true");
    expect(place.textContent).toBe("1");
    const cluster = screen.getByRole("button", { name: "店舗 3 件" });
    expect(cluster.hasAttribute("aria-pressed")).toBe(false);
    expect(cluster.textContent).toBe("3");
    expect(
      screen.getByRole("button", { name: "まち こもれび商店街" }).textContent,
    ).toBe("こもれび商店街");
  });

  it("zooms into a chosen cluster and reports that range as a cluster move", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onSelect = vi.fn();
    const onViewportChange = vi.fn();
    const { map } = await mount({ onSelect, onViewportChange, debounceMs: 50 });
    await load(map);

    fireEvent.click(screen.getByRole("button", { name: "店舗 3 件" }));
    expect(onSelect).toHaveBeenCalledWith(PINS[1]);
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [139.76, 35.69],
        [139.78, 35.7],
      ],
      expect.objectContaining({ maxZoom: 18 }),
    );

    map.fire("movestart", {});
    map.fire("moveend", {});
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(onViewportChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ cause: "cluster" }),
    );
  });

  it("reports the viewer's own move once it stops", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onViewportChange = vi.fn();
    const { map } = await mount({ onViewportChange, debounceMs: 100 });
    await load(map);
    onViewportChange.mockClear();

    map.fire("movestart", { originalEvent: new MouseEvent("mousedown") });
    map.fire("moveend", {});
    act(() => {
      vi.advanceTimersByTime(60);
    });
    map.fire("movestart", { originalEvent: new MouseEvent("mousedown") });
    map.fire("moveend", {});
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(onViewportChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(onViewportChange).toHaveBeenCalledTimes(1);
    expect(onViewportChange).toHaveBeenCalledWith(
      expect.objectContaining({ cause: "user" }),
    );
  });

  it("ends the selection on a tap away from the pins and on Escape, not on a pin", async () => {
    const onSelect = vi.fn();
    const { map } = await mount({ onSelect });
    await load(map);

    const place = screen.getByRole("button", { name: "喫茶 日々" });
    map.fire("click", { originalEvent: { target: place } });
    expect(onSelect).not.toHaveBeenCalled();

    map.fire("click", { originalEvent: { target: map.canvas } });
    expect(onSelect).toHaveBeenLastCalledWith(null);

    onSelect.mockClear();
    fireEvent.keyDown(place, { key: "Escape" });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("moves only when the viewport's value changes", async () => {
    const { map, rerender } = await mount();
    await load(map);

    rerender(
      <MapCanvas
        {...props({ viewport: { kind: "bounds", bounds: { ...EXTENT } } })}
      />,
    );
    expect(map.fitBounds).not.toHaveBeenCalled();

    rerender(
      <MapCanvas
        {...props({
          viewport: {
            kind: "center",
            center: { latitude: 35.68, longitude: 139.76 },
            zoom: 15,
          },
        })}
      />,
    );
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [139.76, 35.68], zoom: 15 }),
    );
  });

  it("draws the viewer's position and moves to it", async () => {
    const { map, rerender } = await mount();
    await load(map);

    rerender(
      <MapCanvas
        {...props({ userLocation: { latitude: 35.681, longitude: 139.767 } })}
      />,
    );
    expect(screen.getByRole("img", { name: "現在地" })).toBeTruthy();
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [139.767, 35.681], zoom: 14 }),
    );

    rerender(<MapCanvas {...props({ userLocation: null })} />);
    expect(screen.queryByRole("img", { name: "現在地" })).toBeNull();
  });

  it("shows the re-search note over the map", async () => {
    const { map, rerender } = await mount();
    await load(map);
    rerender(<MapCanvas {...props({ status: "この範囲を探しています" })} />);
    expect(screen.getByRole("status").textContent).toBe(
      "この範囲を探しています",
    );
  });

  it("falls back when the style cannot be loaded, and retries", async () => {
    const onUnavailable = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { map } = await mount({
      onUnavailable,
      unavailableActions: <a href="/regions">まちを探す</a>,
    });

    await act(async () => {
      map.fire("error", { error: new Error("style 404") });
    });

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(map.remove).toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "地図を表示できませんでした",
    );
    expect(screen.getByRole("link", { name: "まちを探す" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "もう一度読み込む" }));
    await act(async () => {});
    expect(FakeMap.instances).toHaveLength(2);
    expect(screen.getByText("地図を読み込んでいます")).toBeTruthy();
    warn.mockRestore();
  });

  it("falls back when no tile arrives, but keeps a map with some failed tiles", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = await mount();
    await act(async () => {
      failing.map.fire("error", { error: new Error("offline"), tile: {} });
      failing.map.fire("load");
    });
    expect(screen.getByRole("alert")).toBeTruthy();
    cleanup();

    const partial = await mount();
    await act(async () => {
      partial.map.fire("error", { error: new Error("one tile"), tile: {} });
      partial.map.fire("sourcedata", { tile: {} });
      partial.map.fire("load");
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "喫茶 日々" })).toBeTruthy();
    warn.mockRestore();
  });

  it("tints the default style it fetches", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#fff" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { map } = await mount({
      styleUrl: "https://tiles.openfreemap.org/styles/positron",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://tiles.openfreemap.org/styles/positron",
    );
    expect(map.options.style).toMatchObject({
      layers: [{ paint: { "background-color": "#F3F1EB" } }],
    });
    vi.unstubAllGlobals();
  });
});
