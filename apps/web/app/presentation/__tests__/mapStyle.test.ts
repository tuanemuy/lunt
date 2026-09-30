import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MAP_STYLE_URL } from "@/components/map/mapStyle";
import { readMapStyleUrl } from "../mapStyle";

describe("readMapStyleUrl", () => {
  it("takes an http(s) style URL", () => {
    const onInvalid = vi.fn();
    expect(
      readMapStyleUrl(
        { MAP_STYLE_URL: " https://tiles.example/style.json " },
        onInvalid,
      ),
    ).toBe("https://tiles.example/style.json");
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("uses the default when unset or empty", () => {
    const onInvalid = vi.fn();
    expect(readMapStyleUrl({}, onInvalid)).toBe(DEFAULT_MAP_STYLE_URL);
    expect(readMapStyleUrl({ MAP_STYLE_URL: "  " }, onInvalid)).toBe(
      DEFAULT_MAP_STYLE_URL,
    );
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("reports a value that is not an http(s) URL and uses the default", () => {
    for (const value of ["not a url", "ftp://tiles.example/style.json"]) {
      const onInvalid = vi.fn();
      expect(readMapStyleUrl({ MAP_STYLE_URL: value }, onInvalid)).toBe(
        DEFAULT_MAP_STYLE_URL,
      );
      expect(onInvalid).toHaveBeenCalledWith(value);
    }
  });
});
